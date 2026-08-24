package com.lxuan.ntou_tat;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class PortalWebActivity extends Activity {

    public static final String EXTRA_URL = "portal_url";
    private static final String PREFS_NAME = "ntou_portal_prefs";
    private static final String KEY_ZOOM_INDEX = "last_zoom_index";
    private static final int[] ZOOM_LEVELS = { 75, 90, 100, 115, 130, 150, 180, 200 };
    private static final int DEFAULT_ZOOM_INDEX = 5; // 150%
    private int currentZoomIndex = DEFAULT_ZOOM_INDEX;
    private WebView webView;
    private TextView zoomIndicator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 90, 153));
        getWindow().setNavigationBarColor(Color.rgb(12, 14, 17));

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (!isAllowedUrl(url)) {
            finish();
            return;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        int savedIndex = prefs.getInt(KEY_ZOOM_INDEX, DEFAULT_ZOOM_INDEX);
        if (savedIndex >= 0 && savedIndex < ZOOM_LEVELS.length) {
            currentZoomIndex = savedIndex;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(12, 14, 17));
        root.setFitsSystemWindows(true);

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int topInset = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                topInset = insets.getInsets(WindowInsets.Type.statusBars()).top;
            } else {
                topInset = insets.getSystemWindowInsetTop();
            }
            v.setPadding(0, topInset, 0, 0);
            return insets;
        });

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(6), 0, dp(6), 0);
        toolbar.setBackgroundColor(Color.rgb(7, 90, 153));

        ImageButton close = new ImageButton(this);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setColorFilter(Color.WHITE);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("關閉校務系統");
        close.setOnClickListener(view -> finish());
        toolbar.addView(close, new LinearLayout.LayoutParams(dp(44), dp(56)));

        TextView title = new TextView(this);
        title.setText("海大校務系統");
        title.setTextColor(Color.WHITE);
        title.setTextSize(16);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(56), 1));

        TextView zoomOutBtn = new TextView(this);
        zoomOutBtn.setText("－");
        zoomOutBtn.setTextColor(Color.WHITE);
        zoomOutBtn.setTextSize(18);
        zoomOutBtn.setSingleLine(true);
        zoomOutBtn.setGravity(Gravity.CENTER);
        zoomOutBtn.setPadding(dp(2), 0, dp(2), 0);
        zoomOutBtn.setContentDescription("縮小畫面");
        zoomOutBtn.setOnClickListener(v -> adjustZoom(-1));
        toolbar.addView(zoomOutBtn, new LinearLayout.LayoutParams(dp(32), dp(56)));

        zoomIndicator = new TextView(this);
        zoomIndicator.setTextColor(Color.WHITE);
        zoomIndicator.setTextSize(13);
        zoomIndicator.setSingleLine(true);
        zoomIndicator.setGravity(Gravity.CENTER);
        zoomIndicator.setPadding(0, 0, 0, 0);
        zoomIndicator.setContentDescription("重置畫面縮放比例至150%");
        zoomIndicator.setOnClickListener(v -> resetZoom());
        toolbar.addView(zoomIndicator, new LinearLayout.LayoutParams(dp(48), dp(56)));
        updateZoomDisplay();

        TextView zoomInBtn = new TextView(this);
        zoomInBtn.setText("＋");
        zoomInBtn.setTextColor(Color.WHITE);
        zoomInBtn.setTextSize(18);
        zoomInBtn.setSingleLine(true);
        zoomInBtn.setGravity(Gravity.CENTER);
        zoomInBtn.setPadding(dp(2), 0, dp(2), 0);
        zoomInBtn.setContentDescription("放大畫面");
        zoomInBtn.setOnClickListener(v -> adjustZoom(1));
        toolbar.addView(zoomInBtn, new LinearLayout.LayoutParams(dp(32), dp(56)));

        ProgressBar progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        toolbar.addView(progress, new LinearLayout.LayoutParams(dp(28), dp(28)));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 10) {
                    applyZoom();
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String pageUrl, android.graphics.Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
                applyZoom();
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                progress.setVisibility(View.GONE);
                applyZoom();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String nextUrl = request.getUrl().toString();
                if (isAllowedUrl(nextUrl)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(nextUrl)));
                } catch (Exception exception) {
                    Toast.makeText(PortalWebActivity.this, "無法開啟外部連結", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        root.addView(toolbar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(56)
        ));
        root.addView(webView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1
        ));
        setContentView(root);
        webView.loadUrl(url);
    }

    private void adjustZoom(int delta) {
        int nextIndex = currentZoomIndex + delta;
        if (nextIndex >= 0 && nextIndex < ZOOM_LEVELS.length) {
            currentZoomIndex = nextIndex;
            saveZoomIndex();
            updateZoomDisplay();
            applyZoom();
        }
    }

    private void resetZoom() {
        currentZoomIndex = DEFAULT_ZOOM_INDEX; // 150%
        saveZoomIndex();
        updateZoomDisplay();
        applyZoom();
    }

    private void saveZoomIndex() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putInt(KEY_ZOOM_INDEX, currentZoomIndex)
            .apply();
    }

    private void updateZoomDisplay() {
        if (zoomIndicator != null) {
            zoomIndicator.setText(ZOOM_LEVELS[currentZoomIndex] + "%");
        }
    }

    private void applyZoom() {
        if (webView == null) return;
        int zoomPercent = ZOOM_LEVELS[currentZoomIndex];
        webView.getSettings().setTextZoom(zoomPercent);
        double scale = zoomPercent / 100.0;
        String js = "if (document.body) { document.body.style.zoom = '" + scale + "'; }";
        webView.evaluateJavascript(js, null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearHistory();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static boolean isAllowedUrl(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        try {
            Uri uri = Uri.parse(value);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                "ais.ntou.edu.tw".equalsIgnoreCase(uri.getHost());
        } catch (Exception exception) {
            return false;
        }
    }
}
