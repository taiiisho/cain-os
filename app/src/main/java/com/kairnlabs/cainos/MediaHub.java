package com.kairnlabs.cainos;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.io.File;
import java.io.FileOutputStream;
import java.util.List;

/**
 * Follows whatever is playing in other apps (Spotify, YouTube Music, …) so Home can show the
 * song, its cover and working play / pause / skip buttons. Needs "notification access", which
 * the user grants once (see the install guide); without it this simply reports nothing.
 */
final class MediaHub {
    private final Context ctx;
    private final Bridge bridge;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ComponentName listener;
    private MediaSessionManager msm;
    private MediaController current;
    private boolean started;
    private String lastArtKey = "", lastArtUrl = "";

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsChanged = this::pick;

    private final MediaController.Callback callback = new MediaController.Callback() {
        @Override public void onPlaybackStateChanged(PlaybackState state) { publish(); }
        @Override public void onMetadataChanged(MediaMetadata metadata) { publish(); }
        @Override public void onSessionDestroyed() { main.post(MediaHub.this::refresh); }
    };

    MediaHub(Context ctx, Bridge bridge) {
        this.ctx = ctx.getApplicationContext();
        this.bridge = bridge;
        this.listener = new ComponentName(this.ctx, MediaWatchService.class);
    }

    boolean hasAccess() {
        try {
            MediaSessionManager m = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
            m.getActiveSessions(listener);
            return true;
        } catch (Throwable t) { return false; }
    }

    void start() {
        main.post(() -> {
            if (started) { refresh(); return; }
            try {
                msm = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
                msm.addOnActiveSessionsChangedListener(sessionsChanged, listener, main);
                started = true;
                refresh();
            } catch (Throwable t) { started = false; }
        });
    }

    void stop() {
        main.post(() -> {
            try { if (msm != null) msm.removeOnActiveSessionsChangedListener(sessionsChanged); } catch (Throwable ignored) { }
            setCurrent(null);
            started = false;
        });
    }

    private void refresh() {
        try { pick(msm == null ? null : msm.getActiveSessions(listener)); } catch (Throwable t) { setCurrent(null); }
    }

    private void pick(List<MediaController> list) {
        MediaController best = null;
        if (list != null) for (MediaController c : list) {
            if (ctx.getPackageName().equals(c.getPackageName())) continue;
            PlaybackState s = c.getPlaybackState();
            boolean playing = s != null && s.getState() == PlaybackState.STATE_PLAYING;
            if (playing) { best = c; break; }
            if (best == null && c.getMetadata() != null) best = c;
        }
        setCurrent(best);
        publish();
    }

    private void setCurrent(MediaController c) {
        if (current != null) try { current.unregisterCallback(callback); } catch (Throwable ignored) { }
        current = c;
        if (c != null) try { c.registerCallback(callback, main); } catch (Throwable ignored) { }
    }

    private void publish() { bridge.emit("media", snapshot()); }

    /** JSON for the page, or "null" when nothing is available. */
    String snapshot() {
        MediaController c = current;
        if (c == null) return "null";
        try {
            MediaMetadata md = c.getMetadata();
            PlaybackState st = c.getPlaybackState();
            if (md == null) return "null";
            String title = text(md, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            if (title.isEmpty()) return "null";
            String artist = text(md, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
            if (artist.isEmpty()) artist = text(md, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, MediaMetadata.METADATA_KEY_AUTHOR);
            String album = text(md, MediaMetadata.METADATA_KEY_ALBUM, MediaMetadata.METADATA_KEY_ALBUM);
            long dur = Math.max(0, md.getLong(MediaMetadata.METADATA_KEY_DURATION));
            boolean playing = st != null && st.getState() == PlaybackState.STATE_PLAYING;
            long pos = 0;
            if (st != null) {
                pos = st.getPosition();
                if (playing) pos += (long) ((SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime()) * st.getPlaybackSpeed());
                if (pos < 0) pos = 0;
                if (dur > 0 && pos > dur) pos = dur;
            }
            String app = c.getPackageName();
            try {
                PackageManager pm = ctx.getPackageManager();
                app = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(c.getPackageName(), 0)));
            } catch (Throwable ignored) { }
            return "{\"pkg\":" + JsonIn.q(c.getPackageName()) + ",\"app\":" + JsonIn.q(app) + ",\"t\":" + JsonIn.q(title) + ",\"a\":" + JsonIn.q(artist)
                    + ",\"al\":" + JsonIn.q(album) + ",\"art\":" + JsonIn.q(art(md, c.getPackageName() + "|" + title + "|" + artist))
                    + ",\"playing\":" + playing + ",\"pos\":" + (pos / 1000) + ",\"d\":" + (dur / 1000) + "}";
        } catch (Throwable t) { return "null"; }
    }

    private static String text(MediaMetadata md, String k1, String k2) {
        CharSequence a = md.getText(k1);
        if (a == null || a.toString().trim().isEmpty()) a = md.getText(k2);
        return a == null ? "" : a.toString().trim();
    }

    private String art(MediaMetadata md, String key) {
        if (key.equals(lastArtKey)) return lastArtUrl;
        String url = "";
        try {
            Bitmap b = md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
            if (b == null) b = md.getBitmap(MediaMetadata.METADATA_KEY_ART);
            if (b == null) b = md.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
            if (b != null) {
                File dir = new File(ctx.getCacheDir(), "art");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null && old.length > 12) for (File f : old) f.delete();
                File f = new File(dir, Integer.toHexString(key.hashCode()) + "_" + b.getWidth() + ".jpg");
                try (FileOutputStream fo = new FileOutputStream(f)) { b.compress(Bitmap.CompressFormat.JPEG, 92, fo); }
                url = "file://" + f.getAbsolutePath();
            } else {
                String u = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI);
                if (u == null) u = md.getString(MediaMetadata.METADATA_KEY_ART_URI);
                if (u == null) u = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI);
                if (u != null && (u.startsWith("http://") || u.startsWith("https://"))) url = u;
            }
        } catch (Throwable ignored) { }
        // Some apps publish the title first and the cover a moment later; only remember a real result.
        if (!url.isEmpty()) { lastArtKey = key; lastArtUrl = url; }
        return url;
    }

    void command(final String cmd) {
        main.post(() -> {
            MediaController c = current;
            if (c == null || cmd == null) return;
            try {
                MediaController.TransportControls t = c.getTransportControls();
                PlaybackState st = c.getPlaybackState();
                boolean playing = st != null && st.getState() == PlaybackState.STATE_PLAYING;
                switch (cmd) {
                    case "toggle": if (playing) t.pause(); else t.play(); break;
                    case "play": t.play(); break;
                    case "pause": t.pause(); break;
                    case "next": t.skipToNext(); break;
                    case "prev": t.skipToPrevious(); break;
                    case "stop": t.pause(); break;
                    default:
                }
            } catch (Throwable ignored) { }
        });
    }
}
