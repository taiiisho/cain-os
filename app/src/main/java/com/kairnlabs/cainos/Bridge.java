package com.kairnlabs.cainos;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadataRetriever;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.Display;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Everything the interface (a web page in a WebView) can ask Android to do.
 * Exposed to JavaScript as window.CainNative. Results that take time come back as events:
 * CainOS.emit(name, data).
 */
public final class Bridge implements LinkServer.Host {

    static final int REQ_VOICE = 71, REQ_PLAYER = 72, REQ_AUDIO_PERM = 73;
    static final String PREFS = "cain";

    private final MainActivity act;
    private final SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final ExecutorService serial = Executors.newSingleThreadExecutor();
    private final MediaHub media;
    private LinkServer link;
    private volatile String linkState = "{}";

    Bridge(MainActivity act) {
        this.act = act;
        this.prefs = act.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.media = new MediaHub(act, this);
    }

    // ───────────────────────── events to the page ─────────────────────────

    void emit(final String name, final String json) {
        act.runOnUiThread(() -> {
            WebView w = act.web;
            if (w != null) w.evaluateJavascript("window.CainOS&&CainOS.emit('" + name + "'," + (json == null ? "null" : json) + ")", null);
        });
    }

    void shutdown() {
        media.stop();
        if (link != null) link.stop();
        pool.shutdownNow();
        serial.shutdownNow();
    }

    void onResume() { media.start(); }

    // ───────────────────────── device info ─────────────────────────

    @JavascriptInterface
    public String info() {
        try {
            PackageManager pm = act.getPackageManager();
            JSONObject o = new JSONObject();
            o.put("version", pm.getPackageInfo(act.getPackageName(), 0).versionName);
            o.put("model", Build.MODEL);
            o.put("maker", Build.MANUFACTURER);
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("fireos", isFireOs());
            o.put("lowRam", ((ActivityManager) act.getSystemService(Context.ACTIVITY_SERVICE)).isLowRamDevice());
            o.put("voice", voiceIntent().resolveActivity(pm) != null);
            o.put("files", "file://" + act.getFilesDir().getAbsolutePath());
            Display d = act.getWindowManager().getDefaultDisplay();
            Display.Mode m = d.getMode();
            o.put("dispW", m.getPhysicalWidth());
            o.put("dispH", m.getPhysicalHeight());
            o.put("dispHz", Math.round(m.getRefreshRate()));
            try {
                PackageInfo wv = Build.VERSION.SDK_INT >= 26 ? WebView.getCurrentWebViewPackage() : null;
                o.put("webview", wv == null ? "" : wv.versionName);
            } catch (Throwable t) { o.put("webview", ""); }
            return o.toString();
        } catch (Throwable t) { return "{}"; }
    }

    boolean isFireOs() {
        return "Amazon".equalsIgnoreCase(Build.MANUFACTURER) || act.getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
    }

    @JavascriptInterface
    public String net() {
        String type = "", ip = "";
        boolean online = false;
        try {
            ConnectivityManager cm = (ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
            if (nc != null) {
                online = nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                if (nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) type = "Ethernet";
                else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "Wi-Fi";
                else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) type = "VPN";
                else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) type = "Mobile";
                if (nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN) && !"VPN".equals(type)) type += " + VPN";
            }
        } catch (Throwable ignored) { }
        ip = localIp();
        return "{\"online\":" + online + ",\"type\":" + JsonIn.q(type) + ",\"ip\":" + JsonIn.q(ip) + "}";
    }

    static String localIp() {
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            String fallback = "";
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> as = ni.getInetAddresses();
                while (as.hasMoreElements()) {
                    InetAddress a = as.nextElement();
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    if (a.isSiteLocalAddress()) {
                        String name = ni.getName() == null ? "" : ni.getName();
                        if (name.startsWith("wlan") || name.startsWith("eth")) return a.getHostAddress();
                        if (fallback.isEmpty()) fallback = a.getHostAddress();
                    }
                }
            }
            return fallback;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface
    public String storage() {
        try {
            StatFs s = new StatFs(Environment.getDataDirectory().getPath());
            return "{\"free\":" + s.getAvailableBytes() + ",\"total\":" + s.getTotalBytes() + ",\"used\":" + dirSize(act.getFilesDir()) + "}";
        } catch (Throwable t) { return "{}"; }
    }

    private static long dirSize(File d) {
        long n = 0;
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) n += f.isDirectory() ? dirSize(f) : f.length();
        return n;
    }

    // ───────────────────────── simple saved values ─────────────────────────

    @JavascriptInterface
    public void setPref(String key, String value) {
        if (key == null || !key.matches("[a-zA-Z0-9_]{1,32}")) return;
        prefs.edit().putString("js_" + key, value).apply();
        if ("homeRedirect".equals(key)) prefs.edit().putBoolean("home_redirect", "1".equals(value)).apply();
    }

    @JavascriptInterface
    public String getPref(String key) { return prefs.getString("js_" + key, null); }

    @JavascriptInterface
    public void typing(boolean on) { act.typing = on; }

    @JavascriptInterface
    public void keepAwake(final boolean on) { act.runOnUiThread(() -> act.setKeepAwake(on)); }

    @JavascriptInterface
    public void reload() { act.runOnUiThread(act::reloadPage); }

    // ───────────────────────── apps ─────────────────────────

    @JavascriptInterface
    public void loadApps() {
        serial.execute(() -> {
            try { emit("apps", buildApps()); } catch (Throwable t) { emit("apps", "[]"); }
        });
    }

    private String buildApps() throws Exception {
        PackageManager pm = act.getPackageManager();
        LinkedHashMap<String, ResolveInfo> found = new LinkedHashMap<>();
        java.util.HashSet<String> tv = new java.util.HashSet<>();
        Intent i1 = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(i1, 0)) {
            String p = ri.activityInfo.packageName;
            if (!found.containsKey(p)) { found.put(p, ri); tv.add(p); }
        }
        Intent i2 = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(i2, 0)) {
            String p = ri.activityInfo.packageName;
            if (!found.containsKey(p)) found.put(p, ri);
        }
        found.remove(act.getPackageName());

        File dir = new File(act.getCacheDir(), "icons");
        dir.mkdirs();
        List<String[]> rows = new ArrayList<>();
        for (Map.Entry<String, ResolveInfo> e : found.entrySet()) {
            String pkg = e.getKey();
            ResolveInfo ri = e.getValue();
            try {
                String label = String.valueOf(ri.loadLabel(pm)).trim();
                if (label.isEmpty()) label = pkg;
                int ver = 0;
                try { ver = pm.getPackageInfo(pkg, 0).versionCode; } catch (Throwable ignored) { }
                String memo = prefs.getString("ic_" + pkg, "");
                String[] m = memo.split("\\|");
                File f = m.length == 4 ? new File(dir, m[3]) : null;
                boolean banner;
                String color;
                if (f != null && f.isFile() && m[0].equals(String.valueOf(ver))) {
                    banner = "b".equals(m[1]);
                    color = m[2];
                } else {
                    Drawable d = null;
                    banner = false;
                    try { d = ri.activityInfo.loadBanner(pm); } catch (Throwable ignored) { }
                    if (d == null) try { d = ri.activityInfo.applicationInfo.loadBanner(pm); } catch (Throwable ignored) { }
                    if (d != null) banner = true;
                    else d = ri.loadIcon(pm);
                    int w = banner ? 640 : 192, h = banner ? 360 : 192;
                    Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(bmp);
                    d.setBounds(0, 0, w, h);
                    d.draw(c);
                    color = averageColor(bmp);
                    String name = pkg.replaceAll("[^A-Za-z0-9._-]", "_") + "-" + ver + (banner ? "-b" : "-i") + ".png";
                    f = new File(dir, name);
                    try (FileOutputStream fo = new FileOutputStream(f)) { bmp.compress(Bitmap.CompressFormat.PNG, 100, fo); }
                    bmp.recycle();
                    prefs.edit().putString("ic_" + pkg, ver + "|" + (banner ? "b" : "i") + "|" + color + "|" + name).apply();
                }
                rows.add(new String[]{pkg, label, "file://" + f.getAbsolutePath(), banner ? "1" : "0", color, tv.contains(pkg) ? "1" : "0"});
            } catch (Throwable ignored) { }
        }
        Collections.sort(rows, (a, b) -> a[1].compareToIgnoreCase(b[1]));
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < rows.size(); i++) {
            String[] r = rows.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"pkg\":").append(JsonIn.q(r[0])).append(",\"label\":").append(JsonIn.q(r[1])).append(",\"img\":").append(JsonIn.q(r[2]))
              .append(",\"banner\":").append("1".equals(r[3])).append(",\"color\":").append(JsonIn.q(r[4])).append(",\"tv\":").append("1".equals(r[5])).append('}');
        }
        return sb.append(']').toString();
    }

    static String averageColor(Bitmap src) {
        Bitmap s = Bitmap.createScaledBitmap(src, 16, 16, true);
        long r = 0, g = 0, b = 0, n = 0;
        for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
            int p = s.getPixel(x, y);
            int a = Color.alpha(p);
            if (a < 128) continue;
            r += Color.red(p); g += Color.green(p); b += Color.blue(p); n++;
        }
        if (s != src) s.recycle();
        if (n == 0) return "#1d1a17";
        return String.format(Locale.ROOT, "#%02x%02x%02x", r / n, g / n, b / n);
    }

    @JavascriptInterface
    public boolean launch(final String pkg) {
        try {
            PackageManager pm = act.getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            final Intent fi = i;
            act.runOnUiThread(() -> { try { act.startActivity(fi); } catch (Throwable t) { emit("launchFailed", JsonIn.q(pkg)); } });
            return true;
        } catch (Throwable t) { return false; }
    }

    @JavascriptInterface
    public boolean appInfo(String pkg) {
        return start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
    }

    /** Opens the device's app store on a search, or returns false if there is none. */
    @JavascriptInterface
    public boolean openStore(String query) {
        String q = Uri.encode(query == null ? "" : query);
        if (isFireOs() && start(new Intent(Intent.ACTION_VIEW, Uri.parse("amzn://apps/android?s=" + q)))) return true;
        return start(new Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=" + q)));
    }

    /** Opens a system settings screen. Returns "exact", "general" (fell back to main Settings) or "none". */
    @JavascriptInterface
    public String openSettings(String kind) {
        String action;
        Uri data = null;
        switch (kind == null ? "" : kind) {
            case "wifi": action = Settings.ACTION_WIFI_SETTINGS; break;
            case "display": action = Settings.ACTION_DISPLAY_SETTINGS; break;
            case "sound": action = Settings.ACTION_SOUND_SETTINGS; break;
            case "date": action = Settings.ACTION_DATE_SETTINGS; break;
            case "captions": action = Settings.ACTION_CAPTIONING_SETTINGS; break;
            case "accessibility": action = Settings.ACTION_ACCESSIBILITY_SETTINGS; break;
            case "notif": action = "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"; break;
            case "vpn": action = "android.settings.VPN_SETTINGS"; break;
            case "apps": action = Settings.ACTION_APPLICATION_SETTINGS; break;
            case "storage": action = Settings.ACTION_INTERNAL_STORAGE_SETTINGS; break;
            case "developer": action = Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS; break;
            case "unknown": action = "android.settings.MANAGE_UNKNOWN_APP_SOURCES"; data = Uri.parse("package:" + act.getPackageName()); break;
            case "bluetooth": action = Settings.ACTION_BLUETOOTH_SETTINGS; break;
            default: action = Settings.ACTION_SETTINGS;
        }
        Intent i = new Intent(action);
        if (data != null) i.setData(data);
        if (start(i)) return "exact";
        return start(new Intent(Settings.ACTION_SETTINGS)) ? "general" : "none";
    }

    private boolean start(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(act.getPackageManager()) == null) return false;
            final Intent fi = i;
            act.runOnUiThread(() -> { try { act.startActivity(fi); } catch (Throwable ignored) { } });
            return true;
        } catch (Throwable t) { return false; }
    }

    // ───────────────────────── TV inputs (TVs with Google TV built in) ─────────────────────────

    @JavascriptInterface
    public String inputs() {
        StringBuilder sb = new StringBuilder("[");
        try {
            TvInputManager tm = (TvInputManager) act.getSystemService(Context.TV_INPUT_SERVICE);
            int n = 0;
            if (tm != null) for (TvInputInfo in : tm.getTvInputList()) {
                if (!in.isPassthroughInput()) continue;
                if (n++ > 0) sb.append(',');
                sb.append("{\"id\":").append(JsonIn.q(in.getId())).append(",\"label\":").append(JsonIn.q(String.valueOf(in.loadLabel(act)))).append('}');
            }
        } catch (Throwable ignored) { }
        return sb.append(']').toString();
    }

    @JavascriptInterface
    public boolean openInput(String id) {
        try { return start(new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(id))); }
        catch (Throwable t) { return false; }
    }

    // ───────────────────────── voice search ─────────────────────────

    private static Intent voiceIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        return i;
    }

    @JavascriptInterface
    public boolean voice() {
        final Intent i = voiceIntent();
        if (i.resolveActivity(act.getPackageManager()) == null) return false;
        act.runOnUiThread(() -> { try { act.startActivityForResult(i, REQ_VOICE); } catch (Throwable t) { emit("voice", "null"); } });
        return true;
    }

    // ───────────────────────── IPTV ─────────────────────────

    private File iptvDir() { return new File(act.getFilesDir(), "iptv"); }

    @JavascriptInterface
    public void iptvSync(final String configJson) {
        serial.execute(() -> {
            IptvSync.Result r;
            try {
                JSONObject c = new JSONObject(configJson);
                IptvSync.Progress p = (msg, pct) -> emit("iptvProgress", "{\"msg\":" + JsonIn.q(msg) + ",\"pct\":" + pct + "}");
                if ("m3u".equals(c.optString("type"))) r = IptvSync.syncM3u(c.optString("url"), iptvDir(), p);
                else r = IptvSync.syncXtream(c.optString("host"), c.optString("user"), c.optString("pass"), iptvDir(), p);
            } catch (Throwable t) {
                r = new IptvSync.Result();
                r.error = "Couldn't read those details.";
            }
            emit("iptvDone", "{\"ok\":" + r.ok + ",\"error\":" + JsonIn.q(r.error) + ",\"live\":" + r.live + ",\"vod\":" + r.vod + ",\"series\":" + r.series + "}");
        });
    }

    /** Reads one saved catalogue file (meta.json, live_cats.json, vod_3.json …). Returns "" if missing. */
    @JavascriptInterface
    public String iptvRead(String name) {
        if (name == null || !name.matches("[a-z]+(_[a-z0-9]+)?\\.json")) return "";
        File f = new File(iptvDir(), name);
        if (!f.isFile() || f.length() > 24L * 1024 * 1024) return "";
        String t = readText(f);
        return t == null ? "" : t;
    }

    static String readText(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream((int) Math.max(32, f.length()));
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } catch (Throwable t) { return null; }
    }

    @JavascriptInterface
    public void iptvSearch(final int id, final String query) {
        pool.execute(() -> emit("iptvSearch", "{\"id\":" + id + ",\"r\":" + IptvSync.search(iptvDir(), query, 30) + "}"));
    }

    @JavascriptInterface
    public void iptvClear() { serial.execute(() -> IptvSync.deleteDir(iptvDir())); }

    /** Small GET for provider API calls (e.g. a series' episode list). Answer arrives as the "http" event. */
    @JavascriptInterface
    public void http(final int id, final String url) {
        pool.execute(() -> {
            String body = "";
            int code = 0;
            try {
                if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) throw new java.io.IOException("bad url");
                HttpURLConnection c = IptvSync.open(url);
                code = c.getResponseCode();
                try (Reader rd = new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8)) {
                    StringBuilder sb = new StringBuilder();
                    char[] buf = new char[8192];
                    int n;
                    while ((n = rd.read(buf)) > 0 && sb.length() < 4 * 1024 * 1024) sb.append(buf, 0, n);
                    body = sb.toString();
                } finally { c.disconnect(); }
            } catch (Throwable t) { code = code == 0 ? -1 : code; }
            emit("http", "{\"id\":" + id + ",\"code\":" + code + ",\"body\":" + JsonIn.q(body) + "}");
        });
    }

    // ───────────────────────── video player ─────────────────────────

    @JavascriptInterface
    public void play(final String payloadJson) {
        act.runOnUiThread(() -> {
            try {
                Intent i = new Intent(act, PlayerActivity.class);
                i.putExtra("payload", payloadJson);
                act.startActivityForResult(i, REQ_PLAYER);
            } catch (Throwable t) { emit("player", "null"); }
        });
    }

    // ───────────────────────── now playing (other apps) ─────────────────────────

    @JavascriptInterface public boolean mediaAccess() { return media.hasAccess(); }
    @JavascriptInterface public String media() { return media.snapshot(); }
    @JavascriptInterface public void mediaCmd(String cmd) { media.command(cmd); }

    // ───────────────────────── your own music, photos and backgrounds ─────────────────────────

    private File mediaDir(String sub) {
        File d = new File(new File(act.getFilesDir(), "media"), sub);
        d.mkdirs();
        return d;
    }

    @JavascriptInterface
    public String musicList() {
        StringBuilder sb = new StringBuilder("[");
        File[] fs = mediaDir("music").listFiles();
        int n = 0;
        if (fs != null) {
            Arrays.sort(fs, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
            for (File f : fs) {
                if (f.getName().endsWith(".json") || f.getName().endsWith(".part") || f.getName().endsWith(".art")) continue;
                File side = new File(f.getPath() + ".json");
                String meta = null;
                if (side.isFile()) meta = readText(side);
                if (meta == null) meta = describeSong(f);
                if (meta == null) continue;
                if (n++ > 0) sb.append(',');
                sb.append(meta);
            }
        }
        return sb.append(']').toString();
    }

    /** Reads tags and cover art from an audio file and caches them next to it. Null if it isn't playable audio. */
    private String describeSong(File f) {
        MediaMetadataRetriever mr = new MediaMetadataRetriever();
        try {
            mr.setDataSource(f.getAbsolutePath());
            String title = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
            String artist = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            String album = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String dur = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            String base = f.getName().replaceAll("\\.[^.]+$", "").replace('_', ' ').trim();
            if (title == null || title.trim().isEmpty()) {
                int dash = base.indexOf(" - ");
                if (dash > 0) { if (artist == null || artist.trim().isEmpty()) artist = base.substring(0, dash).trim(); title = base.substring(dash + 3).trim(); }
                else title = base;
            }
            String art = "";
            byte[] pic = mr.getEmbeddedPicture();
            if (pic != null && pic.length > 0) {
                File af = new File(f.getPath() + ".art");
                try (FileOutputStream fo = new FileOutputStream(af)) { fo.write(pic); }
                art = "file://" + af.getAbsolutePath();
            }
            long ms = 0;
            try { ms = Long.parseLong(dur); } catch (Throwable ignored) { }
            String json = "{\"id\":" + JsonIn.q("u" + Integer.toHexString(f.getName().hashCode())) + ",\"file\":" + JsonIn.q(f.getName())
                    + ",\"t\":" + JsonIn.q(title) + ",\"a\":" + JsonIn.q(artist == null || artist.trim().isEmpty() ? "Unknown artist" : artist.trim())
                    + ",\"al\":" + JsonIn.q(album == null ? "" : album.trim()) + ",\"d\":" + Math.max(1, ms / 1000)
                    + ",\"url\":" + JsonIn.q("file://" + f.getAbsolutePath()) + ",\"art\":" + JsonIn.q(art) + "}";
            try (FileOutputStream fo = new FileOutputStream(new File(f.getPath() + ".json"))) { fo.write(json.getBytes(StandardCharsets.UTF_8)); }
            return json;
        } catch (Throwable t) {
            return null;
        } finally {
            try { mr.release(); } catch (Throwable ignored) { }
        }
    }

    /** Looks for music already on the device or a USB drive. Asks for permission the first time. Answer: "deviceMusic" event. */
    @JavascriptInterface
    public void musicScan() {
        final String perm = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_AUDIO : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (act.checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
            act.runOnUiThread(() -> act.requestPermissions(new String[]{perm}, REQ_AUDIO_PERM));
            return;
        }
        scanDeviceMusic();
    }

    void scanDeviceMusic() {
        pool.execute(() -> {
            StringBuilder sb = new StringBuilder("[");
            int n = 0;
            try (Cursor c = act.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    new String[]{MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION},
                    MediaStore.Audio.Media.IS_MUSIC + "!=0", null, MediaStore.Audio.Media.TITLE + " COLLATE NOCASE")) {
                while (c != null && c.moveToNext() && n < 2000) {
                    long id = c.getLong(0);
                    String artist = c.getString(2);
                    if (artist == null || artist.equals("<unknown>")) artist = "Unknown artist";
                    if (n++ > 0) sb.append(',');
                    sb.append("{\"id\":\"d").append(id).append("\",\"t\":").append(JsonIn.q(c.getString(1))).append(",\"a\":").append(JsonIn.q(artist))
                      .append(",\"al\":").append(JsonIn.q(c.getString(3))).append(",\"d\":").append(Math.max(1, c.getLong(4) / 1000))
                      .append(",\"url\":").append(JsonIn.q(Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id)).toString()))
                      .append(",\"art\":\"\"}");
                }
            } catch (Throwable ignored) { }
            emit("deviceMusic", sb.append(']').toString());
        });
    }

    @JavascriptInterface
    public void musicClear() {
        File[] fs = mediaDir("music").listFiles();
        if (fs != null) for (File f : fs) f.delete();
    }

    /** {"wall":{"p1":{"url","kind","name"}},"photo":{"p1":"file://…"}} */
    @JavascriptInterface
    public String userMedia() {
        StringBuilder sb = new StringBuilder("{\"wall\":{");
        File[] ws = mediaDir("wall").listFiles();
        int n = 0;
        if (ws != null) for (File f : ws) {
            String nm = f.getName();
            int us = nm.indexOf('_'), dot = nm.lastIndexOf('.');
            if (us <= 0 || dot < us || nm.endsWith(".part")) continue;
            String ext = nm.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (n++ > 0) sb.append(',');
            sb.append(JsonIn.q(nm.substring(0, us))).append(":{\"url\":").append(JsonIn.q("file://" + f.getAbsolutePath()))
              .append(",\"kind\":\"").append(ext.equals("mp4") || ext.equals("webm") ? "video" : "image").append("\"}");
        }
        sb.append("},\"photo\":{");
        File[] ps = mediaDir("photo").listFiles();
        n = 0;
        if (ps != null) for (File f : ps) {
            String nm = f.getName();
            int us = nm.indexOf('_');
            if (us <= 0 || nm.endsWith(".part")) continue;
            if (n++ > 0) sb.append(',');
            sb.append(JsonIn.q(nm.substring(0, us))).append(':').append(JsonIn.q("file://" + f.getAbsolutePath()));
        }
        return sb.append("}}").toString();
    }

    /** Removes a profile's uploaded background ("wall") or photo ("photo"); profile "*" removes all. */
    @JavascriptInterface
    public void deleteUserMedia(String kind, String profile) {
        if (!"wall".equals(kind) && !"photo".equals(kind)) return;
        File[] fs = mediaDir(kind).listFiles();
        if (fs != null) for (File f : fs) if ("*".equals(profile) || f.getName().startsWith(profile + "_")) f.delete();
    }

    // ───────────────────────── phone link ─────────────────────────

    @JavascriptInterface
    public String linkStart() {
        if (link == null) link = new LinkServer(this);
        int port = link.start(8765);
        prefs.edit().putBoolean("link_on", port > 0).apply();
        return linkInfo();
    }

    @JavascriptInterface
    public void linkStop() {
        if (link != null) link.stop();
        prefs.edit().putBoolean("link_on", false).apply();
    }

    @JavascriptInterface
    public String linkInfo() {
        boolean on = link != null && link.running();
        return "{\"on\":" + on + ",\"wanted\":" + prefs.getBoolean("link_on", false) + ",\"ip\":" + JsonIn.q(localIp()) + ",\"port\":" + (on ? link.port() : 0)
                + ",\"code\":" + JsonIn.q(on ? link.code() : "") + ",\"paired\":" + (link == null ? countTokens() : link.pairedCount()) + "}";
    }

    private int countTokens() {
        String t = prefs.getString("link_tokens", "");
        return t.isEmpty() ? 0 : t.split(",").length;
    }

    @JavascriptInterface
    public void linkForget() {
        if (link != null) link.forgetAll();
        else prefs.edit().putString("link_tokens", "").apply();
    }

    @JavascriptInterface
    public void linkState(String json) { linkState = json == null ? "{}" : json; }

    void autoStartLink() { if (prefs.getBoolean("link_on", false)) linkStart(); }

    // LinkServer.Host
    @Override public byte[] page() {
        try (InputStream in = act.getAssets().open("link.html")) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } catch (Throwable t) { return "Cain OS".getBytes(StandardCharsets.UTF_8); }
    }
    @Override public String state() { return linkState; }
    @Override public void key(String key) { emit("rkey", JsonIn.q(key)); }
    @Override public void text(String text) { emit("rtext", JsonIn.q(text)); }
    @Override public void media(String cmd) { emit("rmedia", JsonIn.q(cmd)); }
    @Override public void iptv(Map<String, String> c) {
        JSONObject o = new JSONObject();
        try { for (Map.Entry<String, String> e : c.entrySet()) o.put(e.getKey(), e.getValue()); } catch (Throwable ignored) { }
        emit("riptv", o.toString());
    }
    @Override public File uploadTarget(String kind, String fileName, String profile) {
        String ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if ("music".equals(kind)) return new File(mediaDir("music"), fileName);
        String p = profile == null ? prefs.getString("js_profile", "p1") : profile;
        if (p == null || !p.matches("[A-Za-z0-9]{1,24}")) p = "p1";
        if ("wallpaper".equals(kind)) return new File(mediaDir("wall"), p + "_" + System.currentTimeMillis() + "." + ext);
        if ("photo".equals(kind)) return new File(mediaDir("photo"), p + "_" + System.currentTimeMillis() + "." + ext);
        return null;
    }
    @Override public void uploaded(String kind, File file, String profile) {
        String p = file.getName().contains("_") ? file.getName().substring(0, file.getName().indexOf('_')) : "";
        if ("music".equals(kind)) {
            new File(file.getPath() + ".json").delete();
            if (describeSong(file) == null) { file.delete(); emit("upload", "{\"kind\":\"music\",\"ok\":false}"); return; }
        } else {
            File[] old = file.getParentFile().listFiles();
            if (old != null) for (File f : old) if (!f.equals(file) && f.getName().startsWith(p + "_")) f.delete();
        }
        emit("upload", "{\"kind\":" + JsonIn.q(kind) + ",\"ok\":true,\"profile\":" + JsonIn.q(p) + "}");
    }
    @Override public void paired() { emit("linkPaired", "true"); }
    @Override public String loadTokens() { return prefs.getString("link_tokens", ""); }
    @Override public void saveTokens(String csv) { prefs.edit().putString("link_tokens", csv).apply(); }

    // ───────────────────────── Home button ─────────────────────────

    @JavascriptInterface
    public String homeStatus() {
        boolean enabled = false;
        try {
            String s = Settings.Secure.getString(act.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            String me = new ComponentName(act, HomeWatchService.class).flattenToString();
            String meShort = new ComponentName(act, HomeWatchService.class).flattenToShortString();
            if (s != null) for (String part : s.split(":")) if (part.equalsIgnoreCase(me) || part.equalsIgnoreCase(meShort)) enabled = true;
        } catch (Throwable ignored) { }
        return "{\"service\":" + enabled + ",\"redirect\":" + prefs.getBoolean("home_redirect", true) + ",\"component\":"
                + JsonIn.q(new ComponentName(act, HomeWatchService.class).flattenToString()) + "}";
    }

    /** Opens the device's original home screen and stops redirecting until Cain OS is opened again. */
    @JavascriptInterface
    public boolean openStockHome() {
        prefs.edit().putBoolean("home_suspended", true).apply();
        PackageManager pm = act.getPackageManager();
        for (String pkg : HomeWatchService.STOCK) {
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) {
                Intent h = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(pkg);
                if (h.resolveActivity(pm) != null) i = h;
            }
            if (i != null && start(i)) return true;
        }
        return false;
    }

    // ───────────────────────── install an app from a link ─────────────────────────

    @JavascriptInterface
    public void installFromUrl(final String url) {
        pool.execute(() -> Installer.downloadAndInstall(act, this, url));
    }

    @JavascriptInterface
    public boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || act.getPackageManager().canRequestPackageInstalls();
    }

    // ───────────────────────── results from other screens ─────────────────────────

    void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_VOICE) {
            String text = null;
            if (res == Activity.RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) text = r.get(0);
            }
            emit("voice", text == null ? "null" : JsonIn.q(text));
        } else if (req == REQ_PLAYER) {
            String out = data == null ? null : data.getStringExtra("result");
            emit("player", out == null ? "null" : out);
        }
    }

    void onPermission(int req, int[] grants) {
        if (req == REQ_AUDIO_PERM) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) scanDeviceMusic();
            else emit("deviceMusic", "null");
        }
    }
}
