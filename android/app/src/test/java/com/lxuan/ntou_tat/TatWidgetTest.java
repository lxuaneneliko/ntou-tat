package com.lxuan.ntou_tat;

import static org.junit.Assert.*;
import android.content.Context;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.Manifest;
import android.graphics.Color;
import android.appwidget.AppWidgetManager;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {30, 35})
// Keep a single graphics sandbox per SDK. Mixing LEGACY and NATIVE on Windows
// mounts Robolectric's bundled font ZIP twice when Android 30 creates ColorSpace.
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class TatWidgetTest {
    private Calendar date(int year, int month, int day, int hour, int minute) {
        Calendar result = Calendar.getInstance(); result.clear(); result.set(year, month - 1, day, hour, minute); return result;
    }
    private JSONObject payload() throws Exception {
        JSONObject course = new JSONObject().put("title", "工程數學").put("room", "ME203").put("start", "08:20").put("end", "10:10");
        JSONArray days = new JSONArray().put(new JSONObject().put("day", 1).put("classes", new JSONArray().put(course)))
                .put(new JSONObject().put("day", 7).put("classes", new JSONArray().put(course)));
        return new JSONObject().put("enabled", true).put("semesterStart", "2026-09-14").put("days", days);
    }
    @Test public void mapsMondayAndSundayOnlyWithinSemester() throws Exception {
        assertEquals(1, TatWidgetProvider.today(payload(), date(2026, 10, 5, 7, 0)).size());
        assertEquals(1, TatWidgetProvider.today(payload(), date(2026, 10, 11, 7, 0)).size());
        assertEquals(0, TatWidgetProvider.today(payload(), date(2026, 10, 6, 7, 0)).size());
        assertEquals(0, TatWidgetProvider.today(payload(), date(2026, 9, 13, 7, 0)).size());
        assertEquals(0, TatWidgetProvider.today(payload(), date(2027, 1, 18, 7, 0)).size());
    }
    @Test public void logoutAndInvalidSemesterClearClasses() throws Exception {
        assertTrue(TatWidgetProvider.today(payload().put("enabled", false), date(2026, 10, 5, 7, 0)).isEmpty());
        assertTrue(TatWidgetProvider.today(payload().put("semesterStart", "invalid"), date(2026, 10, 5, 7, 0)).isEmpty());
    }
    @Test public void classStartUsesTodayAndExactMinutes() {
        Calendar today = date(2026, 10, 5, 7, 0);
        assertEquals(date(2026, 10, 5, 8, 20).getTimeInMillis(), TatWidgetProvider.time(today, "08:20"));
        assertEquals(7, today.get(Calendar.HOUR_OF_DAY));
    }
    @Test public void remoteRowRendersRealTitleTimeAndClassroom() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        RemoteViews row = TatWidgetProvider.row(context, payload().getJSONArray("days").getJSONObject(0).getJSONArray("classes").getJSONObject(0), 0xff000000, 0xff08799c);
        View rendered = row.apply(context, null);
        assertEquals("工程數學", ((TextView) rendered.findViewById(R.id.widget_course_title)).getText().toString());
        assertEquals("08:20–10:10", ((TextView) rendered.findViewById(R.id.widget_course_time)).getText().toString());
        assertEquals("ME203", ((TextView) rendered.findViewById(R.id.widget_course_room)).getText().toString());
    }
    @Test public void storesAndReadsPayloadWithoutCredentials() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("tat_widget", 0).edit().putString("snapshot", payload().toString()).commit();
        assertTrue(TatWidgetProvider.snapshot(context).getBoolean("enabled"));
        assertFalse(TatWidgetProvider.snapshot(context).has("password"));
    }
    @Test public void widgetContainerAndRefreshLifecycleRenderOnBothAndroidPaths() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        // Robolectric does not run AndroidX Startup providers automatically.
        androidx.work.WorkManager.initialize(context, new androidx.work.Configuration.Builder().build());
        context.getSharedPreferences("tat_widget", 0).edit().putString("snapshot", payload().toString()).commit();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int id = Shadows.shadowOf(manager).createWidget(TatWidgetProvider.class, R.layout.tat_widget);
        TatWidgetProvider.update(context, manager, id);
        View rendered = Shadows.shadowOf(manager).getViewFor(id);
        assertEquals("海大 TAT · 今日課表", ((TextView) rendered.findViewById(R.id.widget_title)).getText().toString());
        assertNotNull(rendered.findViewById(R.id.widget_courses));
        new TatWidgetProvider().onDisabled(context);
    }
    @Test public void cardCanBeTransparentOrTranslucentWithRoundedCorners() {
        assertEquals(0, Color.alpha(TatWidgetProvider.cardBackground(300, 200, Color.WHITE, 0).getPixel(150, 100)));
        assertEquals(224, Color.alpha(TatWidgetProvider.cardBackground(300, 200, Color.WHITE, 88).getPixel(150, 100)));
        assertEquals(0, Color.alpha(TatWidgetProvider.cardBackground(300, 200, Color.WHITE, 100).getPixel(0, 0)));
    }
    @Test public void defaultCardUsesLegibleLightToneAndCanSwitchToDark() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        assertEquals("#ffffff", TatWidgetProvider.widgetColors(context, payload()).getString("background"));
        context.getSharedPreferences("tat_widget", 0).edit().putString("display", "{\"tone\":\"dark\"}").commit();
        assertEquals("#19252e", TatWidgetProvider.widgetColors(context, payload()).getString("background"));
    }
    @Test public void lockNotificationContainsClassesButNoCredentials() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        Notification notification = TatLockNotification.build(context, payload(), date(2026, 10, 5, 7, 0));
        assertEquals(Notification.VISIBILITY_PUBLIC, notification.visibility);
        assertTrue(notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("下一堂：工程數學"));
        assertTrue(notification.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)[0].toString().contains("ME203"));
        assertFalse(notification.extras.toString().contains("password"));
    }
    @Test public void lockNotificationRequiresOptInAndClearsAtLogout() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        Shadows.shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        assertFalse(TatLockNotification.isEnabled(context));
        TatLockNotification.update(context, payload());
        assertNull(Shadows.shadowOf(manager).getNotification(TatLockNotification.ID));
        context.getSharedPreferences("tat_widget", 0).edit().putBoolean("lock_notifications", true).commit();
        TatLockNotification.update(context, payload());
        assertNotNull(Shadows.shadowOf(manager).getNotification(TatLockNotification.ID));
        TatLockNotification.update(context, payload().put("enabled", false));
        assertNull(Shadows.shadowOf(manager).getNotification(TatLockNotification.ID));
    }
}
