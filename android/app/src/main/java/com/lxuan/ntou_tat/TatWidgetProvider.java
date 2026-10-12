package com.lxuan.ntou_tat;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class TatWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.lxuan.ntou_tat.WIDGET_REFRESH";
    static JSONObject snapshot(Context context) {
        try { return new JSONObject(context.getSharedPreferences("tat_widget", 0).getString("snapshot", "{}")); }
        catch (Exception ignored) { return new JSONObject(); }
    }
    static List<JSONObject> today(JSONObject snapshot, Calendar now) {
        List<JSONObject> result = new ArrayList<>();
        if (!snapshot.optBoolean("enabled", false)) return result;
        try {
            SimpleDateFormat dates = new SimpleDateFormat("yyyy-MM-dd", Locale.US); dates.setLenient(false);
            Calendar start = Calendar.getInstance(); start.setTime(dates.parse(snapshot.getString("semesterStart"))); start.set(Calendar.HOUR_OF_DAY, 0);
            Calendar end = (Calendar) start.clone(); end.add(Calendar.DAY_OF_YEAR, 126);
            if (now.before(start) || !now.before(end)) return result;
        } catch (Exception ignored) { return result; }
        int day = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
        JSONArray days = snapshot.optJSONArray("days");
        if (days != null) for (int i = 0; i < days.length(); i++) {
            JSONObject weekday = days.optJSONObject(i);
            if (weekday != null && weekday.optInt("day") == day) {
                JSONArray classes = weekday.optJSONArray("classes");
                if (classes != null) for (int j = 0; j < classes.length(); j++) if (classes.optJSONObject(j) != null) result.add(classes.optJSONObject(j));
            }
        }
        return result;
    }
    static int color(JSONObject colors, String key, String fallback) {
        try { return Color.parseColor(colors.optString(key, fallback)); } catch (Exception ignored) { return Color.parseColor(fallback); }
    }
    static JSONObject display(Context context, JSONObject data) {
        try { return new JSONObject(context.getSharedPreferences("tat_widget", 0).getString("display", data.optJSONObject("display") == null ? "{}" : data.optJSONObject("display").toString())); }
        catch (Exception ignored) { return new JSONObject(); }
    }
    static JSONObject widgetColors(Context context, JSONObject data) {
        JSONObject options = display(context, data), appColors = data.optJSONObject("colors"); if (appColors == null) appColors = new JSONObject();
        if (options.optString("tone", "light").equals("app")) return appColors;
        boolean dark = options.optString("tone", "light").equals("dark");
        try { return new JSONObject().put("background", dark ? "#19252e" : "#ffffff").put("text", dark ? "#eaf2f7" : "#233340").put("accent", appColors.optString("accent", "#5daee1")); }
        catch (Exception ignored) { return appColors; }
    }
    static Bitmap cardBackground(int width, int height, int color, int opacity) {
        Bitmap image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(image); Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.argb(Math.round(255 * opacity / 100f), Color.red(color), Color.green(color), Color.blue(color)));
        float radius = Math.min(width, height) * .10f;
        canvas.drawRoundRect(new RectF(1, 1, width - 1, height - 1), radius, radius, paint);
        paint.setColor(Color.argb(Math.round(65 * opacity / 100f), 150, 168, 180)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1);
        canvas.drawRoundRect(new RectF(1, 1, width - 1, height - 1), radius, radius, paint); return image;
    }
    static long time(Calendar day, String value) {
        try { String[] split = value.split(":"); Calendar moment = (Calendar) day.clone(); moment.set(Calendar.HOUR_OF_DAY, Integer.parseInt(split[0])); moment.set(Calendar.MINUTE, Integer.parseInt(split[1])); moment.set(Calendar.SECOND, 0); moment.set(Calendar.MILLISECOND, 0); return moment.getTimeInMillis(); }
        catch (Exception ignored) { return day.getTimeInMillis(); }
    }
    static RemoteViews row(Context context, JSONObject course, int textColor, int accentColor) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.tat_widget_row);
        view.setTextViewText(R.id.widget_course_title, course.optString("title"));
        view.setTextViewText(R.id.widget_course_time, course.optString("start") + "–" + course.optString("end"));
        view.setTextViewText(R.id.widget_course_room, course.optString("room", "未指定教室"));
        view.setTextColor(R.id.widget_course_title, textColor); view.setTextColor(R.id.widget_course_time, Color.argb(190, Color.red(textColor), Color.green(textColor), Color.blue(textColor))); view.setTextColor(R.id.widget_course_room, Color.argb(190, Color.red(textColor), Color.green(textColor), Color.blue(textColor)));
        view.setInt(R.id.widget_course_accent, "setBackgroundColor", accentColor);
        view.setOnClickFillInIntent(R.id.widget_row, new Intent());
        return view;
    }
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TatWidgetProvider.class));
        for (int id : ids) update(context, manager, id);
        TatLockNotification.update(context, snapshot(context));
        if (ids.length > 0 || TatLockNotification.isEnabled(context)) schedule(context); else cancelSchedule(context);
    }
    static void update(Context context, AppWidgetManager manager, int id) {
        Calendar now = Calendar.getInstance(); JSONObject data = snapshot(context);
        JSONObject colors = widgetColors(context, data), options = display(context, data);
        int text = color(colors, "text", "#f5f7fb"), accent = color(colors, "accent", "#f2b84b");
        List<JSONObject> courses = today(data, now);
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.tat_widget);
        Bundle size = manager.getAppWidgetOptions(id); int width = Math.max(250, size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300)), height = Math.max(180, size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220));
        String style = options.optString("style", "glass"); int opacity = style.equals("transparent") ? 0 : style.equals("solid") ? 100 : Math.max(35, Math.min(100, options.optInt("opacity", 88)));
        view.setImageViewBitmap(R.id.widget_background, cardBackground(Math.min(width * 2, 1200), Math.min(height * 2, 1200), color(colors, "background", "#ffffff"), opacity));
        view.setTextColor(R.id.widget_title, text); view.setTextColor(R.id.widget_date, text); view.setTextColor(R.id.widget_next, text); view.setTextColor(R.id.widget_empty, text); view.setTextColor(R.id.widget_countdown, text);
        view.setTextColor(R.id.widget_refresh, text);
        view.setTextViewText(R.id.widget_title, "海大 TAT · 今日課表");
        view.setTextViewText(R.id.widget_date, new SimpleDateFormat("M/d E", Locale.TAIWAN).format(now.getTime()) + " · " + data.optString("semester", ""));
        Intent open = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("ntoutat://timetable")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent click = PendingIntent.getActivity(context, 301, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.widget_root, click); view.setOnClickPendingIntent(R.id.widget_title, click);
        // Collection templates must be mutable so the launcher can fill in the row intent.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        view.setPendingIntentTemplate(R.id.widget_courses, PendingIntent.getActivity(context, 302, open, flags));
        Intent refresh = new Intent(context, TatWidgetProvider.class).setAction(ACTION_REFRESH);
        view.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, 303, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        view.setEmptyView(R.id.widget_courses, R.id.widget_empty);
        view.setTextViewText(R.id.widget_empty, data.optBoolean("enabled", false) ? "今天沒有排定課程" : "開啟 TAT 並登入，課表會自動同步");
        if (Build.VERSION.SDK_INT >= 31) {
            RemoteViews.RemoteCollectionItems.Builder collection = new RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1);
            for (int i = 0; i < courses.size(); i++) collection.addItem(i, row(context, courses.get(i), text, accent));
            view.setRemoteAdapter(R.id.widget_courses, collection.build());
        } else {
            Intent service = new Intent(context, TatWidgetService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
            view.setRemoteAdapter(R.id.widget_courses, service);
        }
        String next = "今日課程已結束"; long countdownAt = 0;
        for (JSONObject course : courses) {
            long start = time(now, course.optString("start")), end = time(now, course.optString("end"));
            if (now.getTimeInMillis() >= start && now.getTimeInMillis() < end) { next = "上課中：" + course.optString("title") + " · 至 " + course.optString("end"); break; }
            if (start > now.getTimeInMillis()) { next = "下一堂：" + course.optString("title") + " · " + course.optString("start"); countdownAt = start; break; }
        }
        if (courses.isEmpty()) next = "點擊開啟課表";
        view.setTextViewText(R.id.widget_next, next);
        view.setViewVisibility(R.id.widget_countdown, countdownAt > 0 ? View.VISIBLE : View.GONE);
        if (countdownAt > 0) { view.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() + countdownAt - now.getTimeInMillis(), "距離上課 %s", true); view.setChronometerCountDown(R.id.widget_countdown, true); }
        manager.updateAppWidget(id, view);
        if (Build.VERSION.SDK_INT < 31) manager.notifyAppWidgetViewDataChanged(id, R.id.widget_courses);
    }
    static void schedule(Context context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("tat-widget-refresh", ExistingPeriodicWorkPolicy.KEEP, new PeriodicWorkRequest.Builder(TatWidgetWorker.class, 15, TimeUnit.MINUTES).build());
        Calendar now = Calendar.getInstance(), midnight = (Calendar) now.clone(); midnight.add(Calendar.DAY_OF_YEAR, 1); midnight.set(Calendar.HOUR_OF_DAY, 0); midnight.set(Calendar.MINUTE, 0); midnight.set(Calendar.SECOND, 5);
        long next = midnight.getTimeInMillis();
        for (JSONObject course : today(snapshot(context), now)) for (String field : new String[]{"start", "end"}) { long moment = time(now, course.optString(field)); if (moment > now.getTimeInMillis()) next = Math.min(next, moment); }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent refresh = PendingIntent.getBroadcast(context, 304, new Intent(context, TatWidgetProvider.class).setAction(ACTION_REFRESH), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (alarms != null) alarms.setAndAllowWhileIdle(AlarmManager.RTC, next, refresh);
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { update(context, manager, id); }
    @Override public void onReceive(Context context, Intent intent) { super.onReceive(context, intent); String action = intent.getAction(); if (ACTION_REFRESH.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) updateAll(context); }
    static void cancelSchedule(Context context) { WorkManager.getInstance(context).cancelUniqueWork("tat-widget-refresh"); AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE); PendingIntent pending = PendingIntent.getBroadcast(context, 304, new Intent(context, TatWidgetProvider.class).setAction(ACTION_REFRESH), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE); if (alarms != null && pending != null) alarms.cancel(pending); }
    @Override public void onDisabled(Context context) { if (TatLockNotification.isEnabled(context)) schedule(context); else cancelSchedule(context); }
}
