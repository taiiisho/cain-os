package com.kairnlabs.cainos;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Full-screen video player for IPTV channels, movies and episodes.
 * Uses Android's own MediaPlayer on a video surface, so the picture is decoded at the stream's
 * native resolution (including 4K/HDR where the device supports it).
 *
 * Remote: OK = play/pause · Left/Right = skip 10 s (movies) · Up/Down = next/previous channel (live) · Back = close.
 */
public class PlayerActivity extends Activity implements SurfaceHolder.Callback {

    private static final int PAPER = 0xFFEFEBE3, SOFT = 0xFF9A9286, HOT = 0xFFFF5A1F;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private SurfaceView surface;
    private SurfaceHolder holder;
    private MediaPlayer mp;
    private LinearLayout overlay, errorBox;
    private TextView titleV, subV, timeL, timeR, stateV, errorV, errorOpts, hintV;
    private ProgressBar spinner;
    private Bar bar;

    private JSONArray items;
    private int index;
    private boolean live, prepared, paused, useAlt, finishedNaturally, hasSurface, failed;
    private String key = "";
    private long startMs, pendingSeek = -1, lastPos, lastDur;
    private int retries, errorChoice, videoW, videoH;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        try {
            JSONObject p = new JSONObject(getIntent().getStringExtra("payload"));
            items = p.getJSONArray("items");
            index = Math.max(0, Math.min(items.length() - 1, p.optInt("index", 0)));
            live = p.optBoolean("live", false);
            key = p.optString("key", "");
            startMs = p.optLong("start", 0);
            if (items.length() == 0) throw new IllegalArgumentException();
        } catch (Throwable t) {
            finish();
            return;
        }
        buildUi();
        showOverlay(true);
    }

    // ───────────────────────── interface ─────────────────────────

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private TextView label(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        surface.getHolder().addCallback(this);

        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setPadding(dp(60), dp(90), dp(60), dp(40));
        GradientDrawable shade = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xE6000000, 0x00000000});
        overlay.setBackground(shade);
        subV = label(13, SOFT, false);
        subV.setLetterSpacing(0.18f);
        overlay.addView(subV);
        titleV = label(34, PAPER, true);
        overlay.addView(titleV);
        bar = new Bar(this);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(14));
        blp.topMargin = dp(18);
        overlay.addView(bar, blp);
        LinearLayout times = new LinearLayout(this);
        timeL = label(13, 0xFFCBC4B8, false);
        timeR = label(13, 0xFFCBC4B8, false);
        timeR.setGravity(Gravity.END);
        times.addView(timeL, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        times.addView(timeR, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(6);
        overlay.addView(times, tlp);
        hintV = label(11, 0xFF7C766C, false);
        hintV.setLetterSpacing(0.14f);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hlp.topMargin = dp(10);
        overlay.addView(hintV, hlp);
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        spinner = new ProgressBar(this);
        root.addView(spinner, new FrameLayout.LayoutParams(dp(54), dp(54), Gravity.CENTER));
        stateV = label(15, PAPER, true);
        stateV.setPadding(dp(18), dp(8), dp(18), dp(8));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(0xB3000000);
        pill.setCornerRadius(dp(24));
        stateV.setBackground(pill);
        stateV.setVisibility(View.GONE);
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        slp.topMargin = dp(36);
        slp.rightMargin = dp(48);
        root.addView(stateV, slp);

        errorBox = new LinearLayout(this);
        errorBox.setOrientation(LinearLayout.VERTICAL);
        errorBox.setGravity(Gravity.CENTER_HORIZONTAL);
        errorBox.setPadding(dp(40), dp(32), dp(40), dp(32));
        GradientDrawable eb = new GradientDrawable();
        eb.setColor(0xF215120F);
        eb.setCornerRadius(dp(22));
        errorBox.setBackground(eb);
        errorV = label(20, PAPER, true);
        errorV.setSingleLine(false);
        errorV.setGravity(Gravity.CENTER);
        errorBox.addView(errorV);
        errorOpts = label(15, SOFT, false);
        errorOpts.setSingleLine(false);
        errorOpts.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams elp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        elp.topMargin = dp(18);
        errorBox.addView(errorOpts, elp);
        errorBox.setVisibility(View.GONE);
        root.addView(errorBox, new FrameLayout.LayoutParams(dp(560), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
        refreshLabels();
    }

    private JSONObject item() { return items.optJSONObject(index); }

    private void refreshLabels() {
        JSONObject it = item();
        titleV.setText(it == null ? "" : it.optString("t"));
        String sub = it == null ? "" : it.optString("s");
        subV.setText(sub.toUpperCase(Locale.ROOT));
        subV.setVisibility(sub.isEmpty() ? View.GONE : View.VISIBLE);
        hintV.setText(live ? (items.length() > 1 ? "OK PAUSE   ·   UP / DOWN CHANGE CHANNEL   ·   BACK CLOSE" : "OK PAUSE   ·   BACK CLOSE")
                : "OK PAUSE   ·   LEFT / RIGHT SKIP 10 S   ·   BACK CLOSE");
        bar.setVisibility(live ? View.INVISIBLE : View.VISIBLE);
    }

    private static String clock(long ms) {
        long s = Math.max(0, ms / 1000), h = s / 3600, m = (s % 3600) / 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s % 60) : String.format(Locale.ROOT, "%d:%02d", m, s % 60);
    }

    private final Runnable opener = this::open;
    private final Runnable hideOverlay = () -> { if (!paused && errorBox.getVisibility() != View.VISIBLE) overlay.animate().alpha(0f).setDuration(300).start(); };

    private void showOverlay(boolean autoHide) {
        overlay.animate().cancel();
        overlay.setAlpha(1f);
        ui.removeCallbacks(hideOverlay);
        if (autoHide) ui.postDelayed(hideOverlay, 4500);
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (mp != null && prepared) {
                try {
                    lastPos = mp.getCurrentPosition();
                    int d = mp.getDuration();
                    lastDur = d > 0 ? d : 0;
                } catch (Throwable ignored) { }
                if (live) { timeL.setText("LIVE"); timeR.setText(""); }
                else {
                    long shown = pendingSeek >= 0 ? pendingSeek : lastPos;
                    timeL.setText(clock(shown));
                    timeR.setText(lastDur > 0 ? clock(lastDur) : "");
                    bar.set(lastDur > 0 ? (float) shown / lastDur : 0f);
                }
            }
            ui.postDelayed(this, 500);
        }
    };

    private void flash(String text) {
        stateV.setText(text);
        stateV.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideFlash);
        ui.postDelayed(hideFlash, 1600);
    }
    private final Runnable hideFlash = () -> stateV.setVisibility(View.GONE);

    // ───────────────────────── playback ─────────────────────────

    @Override public void surfaceCreated(SurfaceHolder h) { holder = h; hasSurface = true; open(); }
    @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) { }
    @Override public void surfaceDestroyed(SurfaceHolder h) { hasSurface = false; holder = null; release(); }

    private String url() {
        JSONObject it = item();
        if (it == null) return "";
        String alt = it.optString("a");
        return useAlt && !alt.isEmpty() ? alt : it.optString("u");
    }

    private void open() {
        release();
        if (!hasSurface) return;
        failed = false;
        prepared = false;
        errorBox.setVisibility(View.GONE);
        spinner.setVisibility(View.VISIBLE);
        try {
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            mp.setDisplay(holder);
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(m -> {
                prepared = true;
                retries = 0;
                spinner.setVisibility(View.GONE);
                if (!live && startMs > 0) { try { m.seekTo((int) startMs); } catch (Throwable ignored) { } }
                startMs = 0;
                if (!paused) m.start();
                showOverlay(true);
            });
            mp.setOnVideoSizeChangedListener((m, w, h) -> { videoW = w; videoH = h; fitSurface(); });
            mp.setOnInfoListener((m, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) spinner.setVisibility(View.VISIBLE);
                else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) spinner.setVisibility(View.GONE);
                return false;
            });
            mp.setOnCompletionListener(m -> {
                if (failed) return;
                if (live) { retry(); return; }
                finishedNaturally = true;
                close();
            });
            mp.setOnErrorListener((m, what, extra) -> { retry(); return true; });
            mp.setDataSource(this, Uri.parse(url()));
            mp.prepareAsync();
        } catch (Throwable t) {
            retry();
        }
    }

    /** Streams drop; try again a few times, then the other stream format, then explain. */
    private void retry() {
        if (failed) return;
        long keep = lastPos;
        release();
        retries++;
        JSONObject it = item();
        boolean hasAlt = it != null && !it.optString("a").isEmpty();
        if (retries <= 2) {
            if (!live && keep > 0) startMs = keep;
            spinner.setVisibility(View.VISIBLE);
            ui.postDelayed(opener, 1200L * retries);
        } else if (hasAlt && !useAlt) {
            useAlt = true;
            retries = 0;
            if (!live && keep > 0) startMs = keep;
            ui.postDelayed(opener, 600);
        } else {
            failed = true;
            spinner.setVisibility(View.GONE);
            errorChoice = 0;
            showError();
        }
    }

    private void showError() {
        errorV.setText(live ? "This channel isn't playing right now." : "This video couldn't be played.");
        String[] o = {"Try again", "Open in another player", "Close"};
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < o.length; i++) sb.append(i == errorChoice ? "▶  " : "     ").append(o[i]).append(i < o.length - 1 ? "\n" : "");
        errorOpts.setText(sb.toString());
        errorBox.setVisibility(View.VISIBLE);
        showOverlay(false);
    }

    private void errorAct() {
        if (errorChoice == 0) { retries = 0; useAlt = false; open(); }
        else if (errorChoice == 1) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(url()), "video/*");
                i.putExtra("title", item() == null ? "" : item().optString("t"));
                startActivity(Intent.createChooser(i, "Open with"));
            } catch (Throwable t) { flash("No other player is installed"); }
        } else close();
    }

    private void fitSurface() {
        if (videoW <= 0 || videoH <= 0 || root.getWidth() <= 0) return;
        float rw = root.getWidth(), rh = root.getHeight(), s = Math.min(rw / videoW, rh / videoH);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) surface.getLayoutParams();
        int w = Math.round(videoW * s), h = Math.round(videoH * s);
        if (lp.width != w || lp.height != h) { lp.width = w; lp.height = h; lp.gravity = Gravity.CENTER; surface.setLayoutParams(lp); }
    }

    private void release() {
        ui.removeCallbacks(opener);
        if (mp != null) {
            try { if (prepared) { lastPos = mp.getCurrentPosition(); int d = mp.getDuration(); if (d > 0) lastDur = d; } } catch (Throwable ignored) { }
            try { mp.reset(); } catch (Throwable ignored) { }
            try { mp.release(); } catch (Throwable ignored) { }
            mp = null;
        }
        prepared = false;
    }

    private void togglePause() {
        if (mp == null || !prepared) return;
        try {
            if (paused) { mp.start(); paused = false; flash("Playing"); showOverlay(true); }
            else { mp.pause(); paused = true; flash("Paused"); showOverlay(false); }
        } catch (Throwable ignored) { }
    }

    private final Runnable commitSeek = () -> {
        if (mp != null && prepared && pendingSeek >= 0) { try { mp.seekTo((int) pendingSeek); } catch (Throwable ignored) { } }
        pendingSeek = -1;
    };

    private void seekBy(long delta) {
        if (live || mp == null || !prepared || lastDur <= 0) { showOverlay(true); return; }
        long base = pendingSeek >= 0 ? pendingSeek : lastPos;
        pendingSeek = Math.max(0, Math.min(lastDur - 2000, base + delta));
        ui.removeCallbacks(commitSeek);
        ui.postDelayed(commitSeek, 450);
        timeL.setText(clock(pendingSeek));
        bar.set((float) pendingSeek / lastDur);
        showOverlay(true);
    }

    private void zap(int d) {
        if (!live || items.length() < 2) { showOverlay(true); return; }
        index = (index + d + items.length()) % items.length();
        useAlt = false;
        retries = 0;
        paused = false;
        lastPos = 0;
        refreshLabels();
        showOverlay(true);
        open();
    }

    // ───────────────────────── keys ─────────────────────────

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (errorBox.getVisibility() == View.VISIBLE) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_UP: errorChoice = (errorChoice + 2) % 3; showError(); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: errorChoice = (errorChoice + 1) % 3; showError(); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER: case KeyEvent.KEYCODE_BUTTON_A:
                    if (e.getRepeatCount() == 0) errorAct();
                    return true;
                default:
            }
        }
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER: case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_SPACE:
                if (e.getRepeatCount() == 0) togglePause();
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (paused) togglePause(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (!paused) togglePause(); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_MEDIA_REWIND: seekBy(e.getRepeatCount() > 4 ? -30000 : -10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: seekBy(e.getRepeatCount() > 4 ? 30000 : 10000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_CHANNEL_UP: case KeyEvent.KEYCODE_MEDIA_NEXT:
                if (e.getRepeatCount() == 0) zap(1);
                return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: case KeyEvent.KEYCODE_CHANNEL_DOWN: case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                if (e.getRepeatCount() == 0) zap(-1);
                return true;
            case KeyEvent.KEYCODE_MEDIA_STOP: close(); return true;
            default:
                return super.onKeyDown(code, e);
        }
    }

    @Override public void onBackPressed() { close(); }

    private void close() {
        release();
        try {
            JSONObject r = new JSONObject();
            r.put("key", key);
            r.put("live", live);
            r.put("index", index);
            r.put("pos", finishedNaturally ? 0 : lastPos / 1000);
            r.put("dur", lastDur / 1000);
            r.put("done", finishedNaturally || (lastDur > 0 && lastPos > lastDur * 0.94));
            setResult(RESULT_OK, new Intent().putExtra("result", r.toString()));
        } catch (Throwable ignored) { }
        finish();
    }

    @Override
    protected void onResume() {
        super.onResume();
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am != null) am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        ui.post(tick);
    }

    @Override
    protected void onPause() {
        ui.removeCallbacks(tick);
        // Leaving the player (Home pressed, TV switched off): stop and hand the position back.
        if (!isFinishing()) close();
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am != null) am.abandonAudioFocus(null);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        release();
        super.onDestroy();
    }

    /** Thin progress bar with a round handle. */
    private static final class Bar extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG), knob = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float value;
        Bar(Context c) { super(c); track.setColor(0x33EFEBE3); fill.setColor(HOT); knob.setColor(PAPER); }
        void set(float v) { value = Math.max(0f, Math.min(1f, v)); invalidate(); }
        @Override protected void onDraw(Canvas c) {
            float h = getHeight(), w = getWidth(), th = h * 0.36f, y = (h - th) / 2f, r = th / 2f, kx = Math.max(h / 2f, Math.min(w - h / 2f, w * value));
            c.drawRoundRect(0, y, w, y + th, r, r, track);
            c.drawRoundRect(0, y, kx, y + th, r, r, fill);
            c.drawCircle(kx, h / 2f, h / 2f, knob);
        }
    }
}
