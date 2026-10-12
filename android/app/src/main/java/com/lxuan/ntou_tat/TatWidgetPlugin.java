package com.lxuan.ntou_tat;

import android.app.PendingIntent;
import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(name = "TatWidget", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class TatWidgetPlugin extends Plugin {
    @PluginMethod public void sync(PluginCall call) {
        String payload = call.getString("payload", "{}");
        try {
            JSONObject snapshot = new JSONObject(payload);
            if (snapshot.optInt("version") != 1) { call.reject("Invalid widget data"); return; }
            getContext().getSharedPreferences("tat_widget", 0).edit().putString("snapshot", payload).apply();
            TatWidgetProvider.updateAll(getContext());
            call.resolve();
        } catch (Exception error) { call.reject("Unable to update timetable widget", error); }
    }
    @PluginMethod public void pin(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        boolean supported = Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported();
        boolean requested = supported && manager.requestPinAppWidget(new ComponentName(getContext(), TatWidgetProvider.class), null, null);
        JSObject result = new JSObject(); result.put("supported", supported); result.put("requested", requested); call.resolve(result);
    }
    @PluginMethod public void setDisplay(PluginCall call) {
        try {
            JSONObject display = new JSONObject(call.getString("display", "{}"));
            String style = display.optString("style", "glass"), tone = display.optString("tone", "light");
            if (!(style.equals("glass") || style.equals("solid") || style.equals("transparent")) || !(tone.equals("light") || tone.equals("dark") || tone.equals("app"))) { call.reject("Invalid widget display"); return; }
            display.put("opacity", Math.max(35, Math.min(100, display.optInt("opacity", 88))));
            getContext().getSharedPreferences("tat_widget", 0).edit().putString("display", display.toString()).apply();
            TatWidgetProvider.updateAll(getContext()); call.resolve();
        } catch (Exception error) { call.reject("Unable to save widget display", error); }
    }
    private JSObject lockSettings() {
        JSObject result = new JSObject(); boolean permission = TatLockNotification.canPost(getContext());
        result.put("enabled", TatLockNotification.isEnabled(getContext()) && permission); result.put("permissionGranted", permission); result.put("supported", true);
        result.put("device", Build.MANUFACTURER + " " + Build.MODEL); result.put("androidVersion", Build.VERSION.RELEASE); result.put("sdk", Build.VERSION.SDK_INT); return result;
    }
    @PluginMethod public void getLockSettings(PluginCall call) { call.resolve(lockSettings()); }
    @PluginMethod public void setLockNotifications(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("enabled", false))) {
            getContext().getSharedPreferences("tat_widget", 0).edit().putBoolean("lock_notifications", false).apply();
            TatLockNotification.cancel(getContext()); TatWidgetProvider.updateAll(getContext()); call.resolve(lockSettings()); return;
        }
        if (Build.VERSION.SDK_INT >= 33 && !TatLockNotification.canPost(getContext())) { requestPermissionForAlias("notifications", call, "lockPermissionCallback"); return; }
        enableLock(call);
    }
    @PermissionCallback public void lockPermissionCallback(PluginCall call) { enableLock(call); }
    private void enableLock(PluginCall call) {
        if (!TatLockNotification.canPost(getContext())) { call.reject("請先在手機設定允許 TAT 通知；課表通知仍為關閉"); return; }
        getContext().getSharedPreferences("tat_widget", 0).edit().putBoolean("lock_notifications", true).apply();
        TatWidgetProvider.updateAll(getContext()); call.resolve(lockSettings());
    }
    @PluginMethod public void openNotificationSettings(PluginCall call) {
        Intent intent = Build.VERSION.SDK_INT >= 26 ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()) : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent); call.resolve();
    }
}
