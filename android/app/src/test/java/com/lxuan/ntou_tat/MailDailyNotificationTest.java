package com.lxuan.ntou_tat;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {30, 35})
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class MailDailyNotificationTest {
    private static final long NOW = 1791676800000L;
    private static final String PREFS = "ntou_mail_notification_settings_v1";
    private Context context;
    private SharedPreferences preferences;
    private NotificationManager manager;

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        preferences.edit().clear().putBoolean("enabled", true).commit();
        manager = context.getSystemService(NotificationManager.class);
        manager.cancelAll();
        if (Build.VERSION.SDK_INT >= 33) Shadows.shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
    }

    @After public void resetWorkManagerTestSingleton() throws Exception {
        // Robolectric resets the Android context, not this library singleton.
        // Leave other test classes free to initialize their own WorkManager.
        androidx.work.impl.WorkManagerImpl worker = androidx.work.impl.WorkManagerImpl.getInstance();
        if (worker != null) {
            worker.cancelAllWork().getResult().get(10, TimeUnit.SECONDS);
            Object database = androidx.work.impl.WorkManagerImpl.class.getMethod("getWorkDatabase").invoke(worker);
            database.getClass().getMethod("close").invoke(database);
        }
        androidx.work.impl.WorkManagerImpl.setDelegate(null);
        java.lang.reflect.Field singleton = androidx.work.impl.WorkManagerImpl.class.getDeclaredField("sDefaultInstance");
        singleton.setAccessible(true);
        singleton.set(null, null);
    }

    private java.util.List<MailNotificationWorker.NewMessage> messages() {
        return Arrays.asList(new MailNotificationWorker.NewMessage("QA Sender", "QA First"), new MailNotificationWorker.NewMessage("QA Sender", "QA Second"));
    }

    @Test public void enforcesExactlyTwentyFourHoursBetweenAlerts() {
        assertTrue(MailDailyNotificationPolicy.claim(preferences, NOW));
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, NOW));
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, NOW + TimeUnit.HOURS.toMillis(23)));
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, NOW + MailDailyNotificationPolicy.INTERVAL_MILLIS - 1));
        assertTrue(MailDailyNotificationPolicy.canNotify(preferences, NOW + MailDailyNotificationPolicy.INTERVAL_MILLIS));
    }

    @Test public void midnightAndClockRollbackDoNotResetTheLimit() {
        MailDailyNotificationPolicy.claim(preferences, NOW);
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, NOW + TimeUnit.MINUTES.toMillis(2)));
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, NOW - TimeUnit.DAYS.toMillis(1)));
        assertFalse(MailDailyNotificationPolicy.canNotify(preferences, 0));
    }

    @Test public void persistsAcrossFreshPreferenceHandlesAndEnableToggles() {
        MailDailyNotificationPolicy.claim(preferences, NOW);
        preferences.edit().putBoolean("enabled", false).remove("last_uid").remove("uid_validity").commit();
        preferences.edit().putBoolean("enabled", true).commit();
        SharedPreferences reread = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        assertFalse(MailDailyNotificationPolicy.claim(reread, NOW + 1000));
        assertEquals(NOW, reread.getLong(MailDailyNotificationPolicy.LAST_ALERT_KEY, 0));
    }

    @Test public void concurrentAttemptsCannotClaimTwoAlerts() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger claims = new AtomicInteger();
        Runnable claim = () -> { try { start.await(); if (MailDailyNotificationPolicy.claim(preferences, NOW)) claims.incrementAndGet(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } };
        Thread first = new Thread(claim), second = new Thread(claim);
        first.start(); second.start(); start.countDown(); first.join(5000); second.join(5000);
        assertEquals(1, claims.get());
    }

    @Test public void cooldownDoesNotConsumePendingMessageCursors() {
        preferences.edit().putLong("last_uid", 42).putLong("uid_validity", 7).commit();
        MailDailyNotificationPolicy.claim(preferences, NOW);
        assertFalse(MailNotificationWorker.shouldCheckMail(context, NOW + 1000));
        assertEquals(42, preferences.getLong("last_uid", 0));
        assertEquals(7, preferences.getLong("uid_validity", 0));
        assertTrue(MailNotificationWorker.shouldCheckMail(context, NOW + MailDailyNotificationPolicy.INTERVAL_MILLIS));
    }

    @Test public void actualMailAndAuthenticationAlertsShareTheSameLimit() {
        assertTrue(MailNotificationWorker.showNewMailNotification(context, messages(), NOW));
        Notification notification = Shadows.shadowOf(manager).getNotification(2000);
        assertNotNull(notification);
        assertEquals("2 封 Mail2000 新信", notification.extras.getString(Notification.EXTRA_TITLE));
        assertEquals(Notification.VISIBILITY_PRIVATE, notification.visibility);
        manager.cancelAll();
        assertFalse(MailNotificationWorker.showNewMailNotification(context, messages(), NOW + 1000));
        assertFalse(MailNotificationWorker.showAuthenticationNotification(context, NOW + 2000));
        assertEquals(0, Shadows.shadowOf(manager).getAllNotifications().size());
        assertTrue(MailNotificationWorker.showAuthenticationNotification(context, NOW + MailDailyNotificationPolicy.INTERVAL_MILLIS));
        assertEquals("Mail2000 通知已暫停", Shadows.shadowOf(manager).getNotification(2000).extras.getString(Notification.EXTRA_TITLE));
    }

    @Test public void anEmptyOrDisabledMailboxNeverConsumesTheDailySlot() {
        assertFalse(MailNotificationWorker.showNewMailNotification(context, Collections.emptyList(), NOW));
        assertFalse(preferences.contains(MailDailyNotificationPolicy.LAST_ALERT_KEY));
        preferences.edit().putBoolean("enabled", false).commit();
        assertFalse(MailNotificationWorker.shouldCheckMail(context, NOW));
        assertFalse(MailNotificationWorker.showNewMailNotification(context, messages(), NOW));
        assertFalse(preferences.contains(MailDailyNotificationPolicy.LAST_ALERT_KEY));
    }

    @Test public void blockedNotificationChannelDoesNotConsumeTheDailySlot() {
        manager.createNotificationChannel(new NotificationChannel("ntou_mail_new_messages", "QA blocked", NotificationManager.IMPORTANCE_NONE));
        assertFalse(MailNotificationWorker.canPostNotifications(context));
        assertFalse(MailNotificationWorker.showNewMailNotification(context, messages(), NOW));
        assertFalse(preferences.contains(MailDailyNotificationPolicy.LAST_ALERT_KEY));
    }

    @Test public void notificationPermissionDenialDoesNotConsumeTheDailySlot() {
        if (Build.VERSION.SDK_INT < 33) return;
        Shadows.shadowOf((Application) context).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertFalse(MailNotificationWorker.shouldCheckMail(context, NOW));
        assertFalse(MailNotificationWorker.showNewMailNotification(context, messages(), NOW));
        assertFalse(preferences.contains(MailDailyNotificationPolicy.LAST_ALERT_KEY));
    }

    @Test public void schedulesDailyConnectedNetworkWorkInsteadOfFifteenMinutePolling() {
        PeriodicWorkRequest request = MailNotificationWorker.dailyWorkRequest();
        assertEquals(TimeUnit.HOURS.toMillis(24), request.getWorkSpec().intervalDuration);
        assertEquals(NetworkType.CONNECTED, request.getWorkSpec().constraints.getRequiredNetworkType());
        assertEquals(MailNotificationWorker.class.getName(), request.getWorkSpec().workerClassName);
    }

    @Test public void disabledMigrationDoesNotEnableNotifications() {
        preferences.edit().putBoolean("enabled", false).commit();
        MailNotificationWorker.restoreDailySchedule(context);
        assertFalse(MailNotificationWorker.isEnabled(context));
        assertFalse(preferences.contains("schedule_version"));
    }

    @Test public void upgradesExistingWorkWithoutResettingCursorOrCreatingDuplicateJobs() throws Exception {
        WorkManager.initialize(context, new androidx.work.Configuration.Builder().build());
        WorkManager work = WorkManager.getInstance(context);
        PeriodicWorkRequest legacy = new PeriodicWorkRequest.Builder(MailNotificationWorker.class, 15, TimeUnit.MINUTES)
            .setInitialDelay(1, TimeUnit.DAYS).build();
        work.enqueueUniquePeriodicWork("ntou-mail-notification-check-v1", androidx.work.ExistingPeriodicWorkPolicy.KEEP, legacy).getResult().get(10, TimeUnit.SECONDS);
        preferences.edit().putLong("last_uid", 42).putLong("uid_validity", 7).putLong(MailDailyNotificationPolicy.LAST_ALERT_KEY, NOW).commit();
        MailNotificationWorker.restoreDailySchedule(context);
        java.util.List<androidx.work.WorkInfo> first = work.getWorkInfosForUniqueWork("ntou-mail-notification-check-v1").get(10, TimeUnit.SECONDS);
        assertEquals(1, first.size());
        assertEquals(legacy.getId(), first.get(0).getId());
        // Room is a runtime dependency of WorkManager, not exposed on its Java API classpath.
        Object database = androidx.work.impl.WorkManagerImpl.class.getMethod("getWorkDatabase").invoke(work);
        Object dao = database.getClass().getMethod("workSpecDao").invoke(database);
        java.lang.reflect.Method readSpec = dao.getClass().getMethod("getWorkSpec", String.class);
        readSpec.setAccessible(true);
        java.util.concurrent.FutureTask<androidx.work.impl.model.WorkSpec> query = new java.util.concurrent.FutureTask<>(() ->
            (androidx.work.impl.model.WorkSpec) readSpec.invoke(dao, legacy.getStringId()));
        new Thread(query, "mail-migration-test-query").start();
        androidx.work.impl.model.WorkSpec updated = query.get(10, TimeUnit.SECONDS);
        assertNotNull(updated);
        assertEquals(TimeUnit.HOURS.toMillis(24), updated.intervalDuration);
        assertEquals(2, preferences.getInt("schedule_version", 0));
        MailNotificationWorker.restoreDailySchedule(context);
        java.util.List<androidx.work.WorkInfo> again = work.getWorkInfosForUniqueWork("ntou-mail-notification-check-v1").get(10, TimeUnit.SECONDS);
        assertEquals(first.get(0).getId(), again.get(0).getId());
        assertEquals(42, preferences.getLong("last_uid", 0));
        assertEquals(7, preferences.getLong("uid_validity", 0));
        assertEquals(NOW, preferences.getLong(MailDailyNotificationPolicy.LAST_ALERT_KEY, 0));
    }
}
