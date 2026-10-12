package com.lxuan.ntou_tat;

import android.content.SharedPreferences;
import java.util.concurrent.TimeUnit;

/** Persistent, rolling 24-hour limit, shared by mail and authentication alerts. */
final class MailDailyNotificationPolicy {
    static final long INTERVAL_MILLIS = TimeUnit.HOURS.toMillis(24);
    static final String LAST_ALERT_KEY = "last_daily_alert_at";

    static boolean canNotify(SharedPreferences preferences, long now) {
        if (now <= 0L) return false;
        long lastAlert = preferences.getLong(LAST_ALERT_KEY, 0L);
        return lastAlert <= 0L || (now >= lastAlert && now - lastAlert >= INTERVAL_MILLIS);
    }

    static synchronized boolean claim(SharedPreferences preferences, long now) {
        if (!canNotify(preferences, now)) return false;
        // Persist before posting so retries, process restarts, and toggles cannot
        // create a second alert. Do not reset this timestamp on mail sign-out.
        return preferences.edit().putLong(LAST_ALERT_KEY, now).commit();
    }
}
