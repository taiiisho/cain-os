package com.kairnlabs.cainos;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;

/**
 * Optional "Home button opens Cain OS". Google TV and Fire OS don't let another app be the
 * default home screen, so when the user turns this service on (Settings > Accessibility), it
 * notices the device's own home screen appearing and opens Cain OS instead.
 *
 * It only listens for "a window opened" events and never reads screen content.
 * Safety: it stands down if the user chose "Open the original home screen", if they switched the
 * option off inside Cain OS, or if Cain OS has crashed twice in a few minutes.
 */
public class HomeWatchService extends AccessibilityService {

    static final String[] STOCK = {
            "com.google.android.apps.tv.launcherx",
            "com.google.android.tvlauncher",
            "com.google.android.leanbacklauncher",
            "com.amazon.tv.launcher",
    };

    private long lastRedirect;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = e.getPackageName();
        if (pkg == null) return;
        String p = pkg.toString();
        boolean stock = false;
        for (String s : STOCK) if (s.equals(p)) { stock = true; break; }
        if (!stock) return;

        SharedPreferences prefs = getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("home_redirect", true) || prefs.getBoolean("home_suspended", false)) return;
        long now = System.currentTimeMillis();
        if (prefs.getInt("crash_count", 0) >= 2 && now - prefs.getLong("crash_at", 0) < 5 * 60 * 1000L) return;
        long up = SystemClock.elapsedRealtime();
        if (up - lastRedirect < 1500) return;
        lastRedirect = up;
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            i.putExtra("from_home", true);
            startActivity(i);
        } catch (Throwable ignored) { }
    }

    @Override
    public void onInterrupt() { }
}
