package com.lxuan.ntou_tat;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.whitestein.securestorage.PasswordStorageHelper;
import jakarta.mail.Address;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.FetchProfile;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.UIDFolder;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeUtility;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

public class MailNotificationWorker extends Worker {

    private static final String HOST = "mail.ntou.edu.tw";
    private static final int IMAP_PORT = 993;
    private static final String WORK_NAME = "ntou-mail-notification-check-v1";
    private static final String PREFERENCES_FILE = "ntou_mail_notification_settings_v1";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_LAST_UID = "last_uid";
    private static final String KEY_UID_VALIDITY = "uid_validity";
    private static final String SECURE_ACCOUNT_KEY = "ntou_mail_notification_account_v1";
    private static final String SECURE_PASSWORD_KEY = "ntou_mail_notification_password_v1";
    private static final String CHANNEL_ID = "ntou_mail_new_messages";
    private static final int NOTIFICATION_ID = 2000;

    public MailNotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean(KEY_ENABLED, false)) return Result.success();

        Credentials credentials = readCredentials(context);
        if (credentials == null) {
            disable(context);
            return Result.success();
        }

        Store store = null;
        Folder folder = null;
        try {
            store = createSession().getStore("imaps");
            store.connect(HOST, IMAP_PORT, credentials.account, credentials.password);
            folder = store.getFolder("INBOX");
            if (!folder.exists()) throw new MessagingException("Inbox does not exist");
            folder.open(Folder.READ_ONLY);
            if (!(folder instanceof UIDFolder)) throw new MessagingException("Inbox does not support UID");

            UIDFolder uidFolder = (UIDFolder) folder;
            long uidValidity = uidFolder.getUIDValidity();
            long lastUid = preferences.getLong(KEY_LAST_UID, 0L);
            long savedUidValidity = preferences.getLong(KEY_UID_VALIDITY, 0L);
            long latestUid = latestUid(folder, uidFolder);

            if (lastUid <= 0L || savedUidValidity != uidValidity) {
                saveCursor(context, latestUid, uidValidity);
                return Result.success();
            }

            Message[] messages = uidFolder.getMessagesByUID(lastUid + 1L, UIDFolder.LASTUID);
            if (messages == null || messages.length == 0) return Result.success();

            FetchProfile profile = new FetchProfile();
            profile.add(FetchProfile.Item.ENVELOPE);
            profile.add(FetchProfile.Item.FLAGS);
            profile.add(UIDFolder.FetchProfileItem.UID);
            folder.fetch(messages, profile);

            long newestUid = lastUid;
            List<NewMessage> newMessages = new ArrayList<>();
            for (Message message : messages) {
                if (message == null) continue;
                long uid = uidFolder.getUID(message);
                if (uid > newestUid) newestUid = uid;
                if (!message.isSet(Flags.Flag.SEEN) && !message.isSet(Flags.Flag.DELETED)) {
                    newMessages.add(new NewMessage(senderLabel(message), subjectLabel(message)));
                }
            }

            saveCursor(context, newestUid, uidValidity);
            if (!newMessages.isEmpty()) showNewMailNotification(context, newMessages);
            return Result.success();
        } catch (AuthenticationFailedException exception) {
            disable(context);
            showAuthenticationNotification(context);
            return Result.success();
        } catch (MessagingException exception) {
            return Result.retry();
        } finally {
            closeFolder(folder);
            closeStore(store);
        }
    }

    static boolean isEnabled(Context context) {
        return preferences(context).getBoolean(KEY_ENABLED, false);
    }

    static boolean canPostNotifications(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void enable(Context context, String account, String password, long lastUid, long uidValidity) {
        PasswordStorageHelper secureStorage = new PasswordStorageHelper(context.getApplicationContext());
        secureStorage.setData(SECURE_ACCOUNT_KEY, account.getBytes(StandardCharsets.UTF_8));
        secureStorage.setData(SECURE_PASSWORD_KEY, password.getBytes(StandardCharsets.UTF_8));
        preferences(context).edit()
            .putBoolean(KEY_ENABLED, true)
            .putLong(KEY_LAST_UID, lastUid)
            .putLong(KEY_UID_VALIDITY, uidValidity)
            .apply();
        ensureChannel(context);
        schedule(context);
    }

    static void disable(Context context) {
        preferences(context).edit()
            .putBoolean(KEY_ENABLED, false)
            .remove(KEY_LAST_UID)
            .remove(KEY_UID_VALIDITY)
            .apply();
        PasswordStorageHelper secureStorage = new PasswordStorageHelper(context.getApplicationContext());
        secureStorage.remove(SECURE_ACCOUNT_KEY);
        secureStorage.remove(SECURE_PASSWORD_KEY);
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(WORK_NAME);
    }

    private static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(MailNotificationWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE);
    }

    private static void saveCursor(Context context, long lastUid, long uidValidity) {
        preferences(context).edit()
            .putLong(KEY_LAST_UID, lastUid)
            .putLong(KEY_UID_VALIDITY, uidValidity)
            .apply();
    }

    private static Credentials readCredentials(Context context) {
        PasswordStorageHelper secureStorage = new PasswordStorageHelper(context.getApplicationContext());
        byte[] account = secureStorage.getData(SECURE_ACCOUNT_KEY);
        byte[] password = secureStorage.getData(SECURE_PASSWORD_KEY);
        if (account == null || password == null || account.length == 0 || password.length == 0) return null;
        return new Credentials(
            new String(account, StandardCharsets.UTF_8),
            new String(password, StandardCharsets.UTF_8)
        );
    }

    private static Session createSession() {
        Properties properties = new Properties();
        properties.setProperty("mail.imaps.host", HOST);
        properties.setProperty("mail.imaps.port", String.valueOf(IMAP_PORT));
        properties.setProperty("mail.imaps.auth", "true");
        properties.setProperty("mail.imaps.ssl.enable", "true");
        properties.setProperty("mail.imaps.ssl.checkserveridentity", "true");
        properties.setProperty("mail.imaps.connectiontimeout", "20000");
        properties.setProperty("mail.imaps.timeout", "30000");
        properties.setProperty("mail.imaps.writetimeout", "30000");
        return Session.getInstance(properties);
    }

    private static long latestUid(Folder folder, UIDFolder uidFolder) throws MessagingException {
        int count = folder.getMessageCount();
        return count > 0 ? uidFolder.getUID(folder.getMessage(count)) : 0L;
    }

    private static String senderLabel(Message message) throws MessagingException {
        Address[] addresses = message.getFrom();
        if (addresses == null || addresses.length == 0) return "新郵件";
        Address address = addresses[0];
        if (address instanceof InternetAddress) {
            InternetAddress internetAddress = (InternetAddress) address;
            String personal = decode(internetAddress.getPersonal());
            if (!personal.isEmpty()) return personal;
            String email = internetAddress.getAddress();
            if (email != null && !email.trim().isEmpty()) return email.trim();
        }
        return decode(address.toString());
    }

    private static String subjectLabel(Message message) throws MessagingException {
        String subject = decode(message.getSubject());
        return subject.isEmpty() ? "（無主旨）" : subject;
    }

    private static String decode(String value) {
        if (value == null || value.trim().isEmpty()) return "";
        try {
            return MimeUtility.decodeText(value).trim();
        } catch (Exception ignored) {
            return value.trim();
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Mail2000 新信通知",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("海大 Mail2000 收件匣的新信通知");
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private static NotificationCompat.Builder baseNotification(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mail_notification)
            .setColor(0xFF6FC7FF)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_EMAIL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
    }

    private static void showNewMailNotification(Context context, List<NewMessage> messages) {
        if (!canPostNotifications(context)) return;
        ensureChannel(context);
        NotificationCompat.Builder builder = baseNotification(context);
        if (messages.size() == 1) {
            NewMessage message = messages.get(0);
            builder.setContentTitle(message.sender).setContentText(message.subject)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message.subject));
        } else {
            builder.setContentTitle(messages.size() + " 封 Mail2000 新信")
                .setContentText(messages.get(messages.size() - 1).subject);
            NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle();
            int start = Math.max(0, messages.size() - 5);
            for (int index = start; index < messages.size(); index++) {
                NewMessage message = messages.get(index);
                style.addLine(message.sender + "：" + message.subject);
            }
            style.setSummaryText("海大 Mail2000");
            builder.setStyle(style).setNumber(messages.size());
        }
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
    }

    private static void showAuthenticationNotification(Context context) {
        if (!canPostNotifications(context)) return;
        ensureChannel(context);
        NotificationCompat.Builder builder = baseNotification(context)
            .setContentTitle("Mail2000 通知已暫停")
            .setContentText("請回到海大 TAT 重新登入信箱")
            .setStyle(new NotificationCompat.BigTextStyle().bigText("Mail2000 登入已失效，請回到海大 TAT 重新登入信箱並再次開啟通知。"));
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
    }

    private static void closeFolder(Folder folder) {
        if (folder == null || !folder.isOpen()) return;
        try {
            folder.close(false);
        } catch (MessagingException ignored) {
        }
    }

    private static void closeStore(Store store) {
        if (store == null || !store.isConnected()) return;
        try {
            store.close();
        } catch (MessagingException ignored) {
        }
    }

    private static class Credentials {
        final String account;
        final String password;

        Credentials(String account, String password) {
            this.account = account;
            this.password = password;
        }
    }

    private static class NewMessage {
        final String sender;
        final String subject;

        NewMessage(String sender, String subject) {
            this.sender = sender;
            this.subject = subject;
        }
    }
}
