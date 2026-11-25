package com.kairnlabs.cainos;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * The Cain OS home screen. The interface itself is a bundled web page (assets/index.html)
 * shown full-screen in a WebView; this class feeds it remote-control keys and gives it the
 * {@link Bridge} for everything that needs Android.
 */
public class MainActivity extends Activity {

    WebView web;
    volatile boolean typing;
    private Bridge bridge;
    private FrameLayout root;
    private boolean okDown, okHeld;
    private long okDownAt;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        installCrashGuard();
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        bridge = new Bridge(this);
        try {
            buildWebView();
        } catch (Throwable t) {
            showFatal("Cain OS needs \"Android System WebView\", which is missing or switched off on this device.\n\nInstall or enable it from the app store, then open Cain OS again.");
            return;
        }
        bridge.autoStartLink();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void buildWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // The page is bundled with the app and loads no remote scripts. These let it read the
        // user's own uploaded files (music, photos, backgrounds) from the app's private folder.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.addJavascriptInterface(bridge, "CainNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The interface is a single local page; never navigate away from it.
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The WebView's renderer was killed (usually low memory). Rebuild instead of crashing.
                rebuild();
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl("file:///android_asset/index.html");
        web.requestFocus();
    }

    private void rebuild() {
        try {
            if (web != null) { root.removeView(web); web.destroy(); }
        } catch (Throwable ignored) { }
        web = null;
        typing = false;
        try { buildWebView(); } catch (Throwable t) { showFatal("Cain OS couldn't restart its display. Close and reopen the app."); }
    }

    void reloadPage() { if (web != null) { typing = false; web.reload(); } }

    private void showFatal(String msg) {
        TextView tv = new TextView(this);
        tv.setText(msg);
        tv.setTextColor(0xFFEFEBE3);
        tv.setTextSize(22);
        tv.setPadding(120, 120, 120, 120);
        root.removeAllViews();
        root.addView(tv);
    }

    void setKeepAwake(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // ───────────────────────── remote control keys ─────────────────────────

    private void key(String name) {
        if (web != null) web.evaluateJavascript("window.CainOS&&CainOS.key('" + name + "')", null);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (web == null) return super.dispatchKeyEvent(e);
        final int c = e.getKeyCode();
        final boolean down = e.getAction() == KeyEvent.ACTION_DOWN, up = e.getAction() == KeyEvent.ACTION_UP;

        if (typing) {
            // A text box is open: let the on-screen keyboard and the WebView handle keys; Back cancels.
            if (c == KeyEvent.KEYCODE_BACK || c == KeyEvent.KEYCODE_ESCAPE) { if (up) key("back"); return true; }
            return super.dispatchKeyEvent(e);
        }

        switch (c) {
            case KeyEvent.KEYCODE_DPAD_UP: if (down) key("up"); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: if (down) key("down"); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: if (down) key("left"); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: if (down) key("right"); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                if (down) {
                    if (e.getRepeatCount() == 0) { okDown = true; okHeld = false; okDownAt = e.getEventTime(); }
                    else if (okDown && !okHeld && e.getEventTime() - okDownAt > 550) { okHeld = true; key("hold"); }
                } else if (up) {
                    if (okDown && !okHeld) key("ok");
                    okDown = false;
                }
                return true;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BUTTON_B:
                if (up) key("back");
                return true;
            case KeyEvent.KEYCODE_MENU:
                if (up) key("menu");
                return true;
            case KeyEvent.KEYCODE_SEARCH:
            case KeyEvent.KEYCODE_VOICE_ASSIST:
                if (up) key("search");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: if (down && e.getRepeatCount() == 0) key("mtoggle"); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (down && e.getRepeatCount() == 0) key("mplay"); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP: if (down && e.getRepeatCount() == 0) key("mpause"); return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: if (down && e.getRepeatCount() == 0) key("mnext"); return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
            case KeyEvent.KEYCODE_MEDIA_REWIND: if (down && e.getRepeatCount() == 0) key("mprev"); return true;
            default:
                return super.dispatchKeyEvent(e);
        }
    }

    // ───────────────────────── lifecycle ─────────────────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Home pressed while Cain OS is already showing: go to its Home view.
        if (intent != null && (intent.hasCategory(Intent.CATEGORY_HOME) || intent.getBooleanExtra("from_home", false))) key("home");
    }

    @Override
    protected void onResume() {
        super.onResume();
        SharedPreferences p = getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean("home_suspended", false).apply();
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (web != null) {
            web.onResume();
            web.requestFocus();
            bridge.onResume();
            bridge.emit("resume", "true");
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            // Synchronously tell the page first so it can pause its own audio before we go to the background.
            web.evaluateJavascript("window.CainOS&&CainOS.emit('pause',true)", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        try {
            if (web != null) { root.removeView(web); web.destroy(); web = null; }
        } catch (Throwable ignored) { }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() { key("back"); }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        bridge.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        bridge.onPermission(requestCode, grantResults);
    }

    /** Remembers crashes so the optional Home-button redirect can stand down instead of looping. */
    private static boolean guardInstalled;
    private void installCrashGuard() {
        if (guardInstalled) return;
        guardInstalled = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        final Context app = getApplicationContext();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                SharedPreferences p = app.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE);
                long now = System.currentTimeMillis();
                int n = now - p.getLong("crash_at", 0) < 5 * 60 * 1000L ? p.getInt("crash_count", 0) + 1 : 1;
                p.edit().putLong("crash_at", now).putInt("crash_count", n).commit();
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(thread, error);
        });
    }
}
