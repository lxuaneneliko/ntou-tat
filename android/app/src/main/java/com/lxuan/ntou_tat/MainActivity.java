package com.lxuan.ntou_tat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NtouPortalPlugin.class);
        registerPlugin(NtouMailPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
