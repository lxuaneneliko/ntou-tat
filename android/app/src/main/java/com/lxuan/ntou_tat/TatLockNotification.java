package com.lxuan.ntou_tat;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Calendar;
import java.util.List;
import org.json.JSONObject;

/** Optional public lock-screen notification. This is not a keyguard-widget host. */
public class TatLockNotification {
    static final String CHANNEL = "tat-lock-timetable";
    static final int ID = 33001;
    static boolean isEnabled(Context context) { return context.getSharedPreferences("tat_widget", 0).getBoolean("lock_notifications", false); }
    static boolean canPost(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }
    static void cancel(Context context) { NotificationManagerCompat.from(context).cancel(ID); }
    static Notification build(Context context, JSONObject snapshot, Calendar now) {
        List<JSONObject> courses = TatWidgetProvider.today(snapshot, now);
        String summary = courses.isEmpty() ? "今天沒有排定課程" : "今日課程已結束";
        for (JSONObject course : courses) {
            if (TatWidgetProvider.time(now, course.optString("end")) > now.getTimeInMillis()) {
                summary = (TatWidgetProvider.time(now, course.optString("start")) <= now.getTimeInMillis() ? "上課中：" : "下一堂：") + course.optString("title") + " · " + course.optString("start") + " · " + course.optString("room"); break;
            }
        }
        NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle().setBigContentTitle("海大 TAT · 今日課表").setSummaryText(summary);
        for (JSONObject course : courses) style.addLine(course.optString("start") + "–" + course.optString("end") + "  " + course.optString("title") + " · " + course.optString("room"));
        Intent open = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("ntoutat://timetable")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent click = PendingIntent.getActivity(context, 331, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Public content is enabled only by explicit consent in Settings; no password or student ID is included.
        return new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_tat_notification).setContentTitle("海大 TAT · 今日課表").setContentText(summary)
            .setStyle(style).setContentIntent(click).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_LOW).setOnlyAlertOnce(true).setSilent(true).setOngoing(true).setShowWhen(false).build();
    }
    static void update(Context context, JSONObject snapshot) {
        if (!isEnabled(context) || !snapshot.optBoolean("enabled", false) || !canPost(context)) { cancel(context); return; }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "鎖定畫面課表", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("你自行開啟的今日課表通知；可以顯示於鎖定畫面"); channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(null, null); channel.enableVibration(false); context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        NotificationManagerCompat.from(context).notify(ID, build(context, snapshot, Calendar.getInstance()));
    }
}
