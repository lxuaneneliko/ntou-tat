package com.lxuan.ntou_tat;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(NtouPortalPlugin.class);
        registerPlugin(NtouMailPlugin.class);
        registerPlugin(TatWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        MailNotificationWorker.restoreDailySchedule(this);
    }
}
