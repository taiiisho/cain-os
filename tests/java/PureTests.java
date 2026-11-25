import com.kairnlabs.cainos.IptvSync;
import com.kairnlabs.cainos.JsonIn;
import com.kairnlabs.cainos.LinkServer;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

/** Desktop-JVM tests for the parts of Cain OS that don't need Android. Run: java PureTests */
public class PureTests {
    static int passed, failed;

    static void check(String name, boolean ok) {
        if (ok) passed++; else { failed++; System.out.println("FAIL: " + name); }
    }

    static String read(File f) throws Exception { return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8); }

    public static void main(String[] a) throws Exception {
        json();
        base();
        xtream();
        m3u();
        link();
        System.out.println(passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }

    static void json() throws Exception {
        JsonIn j = new JsonIn(new StringReader("﻿ {\"a\":1,\"b\":\"x\\\"y\\u00e9\\n\",\"c\":[1,{\"d\":null},[true]],\"e\":null ,\"f\":-1.5e3}"));
        j.beginObject();
        check("name a", j.nextName().equals("a")); check("num", j.nextString().equals("1"));
        check("name b", j.nextName().equals("b")); check("escapes", j.nextString().equals("x\"yé\n"));
        check("name c", j.nextName().equals("c")); j.skipValue();
        check("name e", j.nextName().equals("e")); check("null", j.nextString() == null);
        check("name f", j.nextName().equals("f")); check("float", j.nextString().equals("-1.5e3"));
        check("end", !j.hasNext());
        j.endObject();
        check("esc", JsonIn.q("a\"b\\c\n\u0001").equals("\"a\\\"b\\\\c\\n\\u0001\""));
        boolean threw = false;
        try { new JsonIn(new StringReader("{\"a\":\"unterminated")).skipValue(); } catch (Exception e) { threw = true; }
        check("unterminated throws", threw);
    }

    static void base() {
        check("base plain", IptvSync.normalizeBase("example.com:8080").equals("http://example.com:8080"));
        check("base path", IptvSync.normalizeBase(" https://example.com:443/player_api.php?username=a ").equals("https://example.com:443"));
        check("base slash", IptvSync.normalizeBase("http://example.com/").equals("http://example.com"));
        check("base empty", IptvSync.normalizeBase("  ").isEmpty());
    }

    static void xtream() throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final int[] hits = {0};
        s.createContext("/player_api.php", ex -> {
            hits[0]++;
            String q = ex.getRequestURI().getRawQuery();
            Map<String, String> p = new HashMap<>();
            for (String kv : q.split("&")) { String[] x = kv.split("=", 2); p.put(x[0], x.length > 1 ? java.net.URLDecoder.decode(x[1], "UTF-8") : ""); }
            String body;
            boolean good = "bob".equals(p.get("username")) && "p&ss word".equals(p.get("password"));
            String act = p.get("action");
            if (!good) body = "{\"user_info\":{\"auth\":0}}";
            else if (act == null) body = "{\"user_info\":{\"username\":\"bob\",\"auth\":1,\"status\":\"Active\",\"exp_date\":\"1893456000\"},\"server_info\":{\"url\":\"x\"}}";
            else if (act.equals("get_live_categories")) body = "[{\"category_id\":\"1\",\"category_name\":\"News\",\"parent_id\":0},{\"category_id\":\"2\",\"category_name\":\"Sports\",\"parent_id\":0},{\"category_id\":\"9\",\"category_name\":\"Empty\"}]";
            else if (act.equals("get_live_streams")) {
                StringBuilder sb = new StringBuilder("[");
                for (int i = 1; i <= 2500; i++) {
                    if (i > 1) sb.append(',');
                    sb.append("{\"num\":").append(i).append(",\"name\":\"Channel \\\"").append(i).append("\\\" \\u00e9\\tHD\",\"stream_type\":\"live\",\"stream_id\":").append(1000 + i)
                      .append(",\"stream_icon\":\"http://x/").append(i).append(".png\",\"epg_channel_id\":null,\"added\":\"1\",\"category_id\":\"").append(i % 3 == 0 ? "77" : (i % 2 == 0 ? "2" : "1")).append("\",\"extra\":{\"a\":[1,2]},\"tv_archive\":0}");
                }
                body = sb.append("]").toString();
            }
            else if (act.equals("get_vod_categories")) body = "[{\"category_id\":\"5\",\"category_name\":\"Action\"}]";
            else if (act.equals("get_vod_streams")) body = "[{\"num\":1,\"name\":\"Big Film (2021)\",\"stream_id\":501,\"stream_icon\":\"http://x/f.jpg\",\"rating\":\"7.1\",\"category_id\":\"5\",\"container_extension\":\"mkv\"},{\"name\":null,\"stream_id\":502},{\"num\":2,\"name\":\"Other Film\",\"stream_id\":\"503\",\"stream_icon\":null,\"category_id\":null,\"container_extension\":\"mp4\"}]";
            else if (act.equals("get_series_categories")) body = "[]";
            else if (act.equals("get_series")) body = "[{\"num\":1,\"name\":\"A Show\",\"series_id\":900,\"cover\":\"http://x/s.jpg\",\"category_id\":\"3\"}]";
            else body = "[]";
            byte[] b = body.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, b.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(b); }
        });
        s.createContext("/redir/player_api.php", ex -> {
            ex.getResponseHeaders().add("Location", "/player_api.php?" + ex.getRequestURI().getRawQuery());
            ex.sendResponseHeaders(302, -1);
            ex.close();
        });
        s.createContext("/get.php", ex -> {
            String body = "﻿#EXTM3U\n#EXTINF:-1 tvg-id=\"a\" tvg-name=\"One\" tvg-logo=\"http://x/1.png\" group-title=\"News, World\",One, HD\nhttp://h/live/u/p/1.ts\n"
                    + "#EXTINF:-1,Plain Name\nhttp://h/live/u/p/2.m3u8\n#EXTVLCOPT:foo\n#EXTINF:-1 group-title=\"Films\",A Movie\nhttp://h/movie/u/p/9.mkv\n#EXTINF:-1,No url\n\n";
            byte[] b = body.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, b.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(b); }
        });
        s.start();
        int port = s.getAddress().getPort();
        File root = Files.createTempDirectory("cain").toFile();
        File out = new File(root, "iptv");
        try {
            final StringBuilder stages = new StringBuilder();
            IptvSync.Result r = IptvSync.syncXtream("127.0.0.1:" + port + "/", " bob ", "p&ss word", out, (m, pct) -> stages.append(pct).append(' '));
            check("xtream ok: " + r.error, r.ok);
            check("live count", r.live == 2500);
            check("vod count (null name skipped)", r.vod == 2);
            check("series count", r.series == 1);
            check("expires", r.expires.equals("1893456000"));
            check("progress reported", stages.toString().contains("100"));
            String cats = read(new File(out, "live_cats.json"));
            check("cats order + other + empty dropped: " + cats, cats.startsWith("[[0,\"News\",") && cats.contains("[1,\"Sports\",") && cats.contains("[2,\"Other\",") && !cats.contains("Empty"));
            String c0 = read(new File(out, "live_0.json"));
            check("item json valid shape", c0.startsWith("[[\"1001\",\"Channel \\\"1\\\" é HD\",\"http://x/1.png\",\"\"]"));
            // every category file must parse with our own reader
            JsonIn j = new JsonIn(new StringReader(c0)); int n = 0; j.beginArray(); while (j.hasNext()) { j.skipValue(); n++; } j.endArray();
            check("category 0 size", n == 833);
            check("vod ext", read(new File(out, "vod_0.json")).contains("\"mkv\""));
            check("vod other cat", read(new File(out, "vod_cats.json")).contains("Other"));
            check("meta", read(new File(out, "meta.json")).contains("\"type\":\"xtream\"") && read(new File(out, "meta.json")).contains("\"live\":2500"));
            String sr = IptvSync.search(out, "channel \"25", 5);
            check("search finds + limits: " + sr.substring(0, Math.min(120, sr.length())), sr.contains("\"1025\"") && sr.split("\\],\\[").length <= 5 && sr.contains("\"vod\":[]"));
            check("search film", IptvSync.search(out, "BIG film", 5).contains("\"501\""));
            check("search empty q", IptvSync.search(out, " ", 5).equals("{\"live\":[],\"vod\":[],\"series\":[]}"));

            IptvSync.Result bad = IptvSync.syncXtream("127.0.0.1:" + port, "bob", "wrong", out, null);
            check("bad password rejected", !bad.ok && bad.error.contains("rejected"));
            check("failed sync keeps old data", new File(out, "live_cats.json").isFile());
            IptvSync.Result dead = IptvSync.syncXtream("127.0.0.1:1", "bob", "x", out, null);
            check("dead host message", !dead.ok && dead.error.length() > 10);
            IptvSync.Result redir = IptvSync.syncXtream("http://127.0.0.1:" + port + "/redir", "bob", "p&ss word", new File(root, "r2"), null);
            check("base strips path (no redirect needed)", redir.ok);

            File m = new File(root, "m3u");
            IptvSync.Result mr = IptvSync.syncM3u("127.0.0.1:" + port + "/get.php?username=u&password=p&type=m3u_plus", m, null);
            check("m3u ok: " + mr.error, mr.ok && mr.live == 2 && mr.vod == 1);
            String mc = read(new File(m, "live_cats.json"));
            check("m3u groups: " + mc, mc.contains("News, World") && mc.contains("Other"));
            String m0 = read(new File(m, "live_0.json"));
            check("m3u item: " + m0, m0.contains("\"One, HD\"") && m0.contains("http://h/live/u/p/1.ts") && m0.contains("http://x/1.png"));
            check("m3u vod", read(new File(m, "vod_0.json")).contains("A Movie"));
            check("m3u series empty", read(new File(m, "series_cats.json")).equals("[]"));
            check("404 message", !IptvSync.syncM3u("http://127.0.0.1:" + port + "/nope", new File(root, "x"), null).ok);
        } finally { s.stop(0); }
    }

    static void m3u() { /* covered in xtream() via the mock server */ }

    static String http(String method, String url, String token, byte[] body, int[] codeOut) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        if (token != null) c.setRequestProperty("X-Cain-Token", token);
        if (body != null) { c.setDoOutput(true); c.setFixedLengthStreamingMode(body.length); try (OutputStream o = c.getOutputStream()) { o.write(body); } }
        int code = c.getResponseCode();
        if (codeOut != null) codeOut[0] = code;
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        byte[] b = in == null ? new byte[0] : in.readAllBytes();
        return new String(b, StandardCharsets.UTF_8);
    }

    static void link() throws Exception {
        final File dir = Files.createTempDirectory("cainlink").toFile();
        final StringBuilder log = new StringBuilder();
        final String[] saved = {""};
        LinkServer.Host h = new LinkServer.Host() {
            public byte[] page() { return "<html>link</html>".getBytes(StandardCharsets.UTF_8); }
            public String state() { return "{\"name\":\"TV\"}"; }
            public void key(String k) { log.append("key:").append(k).append(';'); }
            public void text(String t) { log.append("text:").append(t).append(';'); }
            public void media(String c) { log.append("media:").append(c).append(';'); }
            public void iptv(Map<String, String> c) { log.append("iptv:").append(c.get("host")).append('/').append(c.get("user")).append(';'); }
            public File uploadTarget(String kind, String name, String profile) { return new File(dir, kind + "_" + name); }
            public void uploaded(String kind, File f, String profile) { log.append("up:").append(kind).append(':').append(f.length()).append(':').append(profile).append(';'); }
            public void paired() { log.append("paired;"); }
            public String loadTokens() { return saved[0]; }
            public void saveTokens(String csv) { saved[0] = csv; }
        };
        LinkServer s = new LinkServer(h);
        int port = s.start(18765);
        check("server started", port > 0 && s.running());
        String base = "http://127.0.0.1:" + port;
        int[] code = {0};
        try {
            check("page", http("GET", base + "/", null, null, code).contains("link") && code[0] == 200);
            http("GET", base + "/api/state", null, null, code); check("state needs token", code[0] == 401);
            http("POST", base + "/api/key", "nope", "{\"key\":\"up\"}".getBytes(), code); check("bad token refused", code[0] == 401 && log.length() == 0);
            http("POST", base + "/api/pair", null, "{\"code\":\"000000x\"}".getBytes(), code); check("wrong code", code[0] == 403);
            String first = s.code();
            String pr = http("POST", base + "/api/pair", null, ("{\"code\":\"" + first + "\"}").getBytes(), code);
            check("pair ok", code[0] == 200 && pr.contains("token"));
            String token = pr.replaceAll(".*\"token\":\"([0-9a-f]{32})\".*", "$1");
            check("token saved + code rotated", saved[0].contains(token) && !s.code().equals(first) && log.toString().contains("paired;"));
            check("state", http("GET", base + "/api/state", token, null, code).contains("TV"));
            http("POST", base + "/api/key", token, "{\"key\":\"up\"}".getBytes(), code);
            http("POST", base + "/api/key", token, "{\"key\":\"<script>\"}".getBytes(), code);
            http("POST", base + "/api/text", token, "{\"text\":\"héllo \\\"x\\\"\"}".getBytes(StandardCharsets.UTF_8), code);
            http("POST", base + "/api/media", token, "{\"cmd\":\"next\"}".getBytes(), code);
            http("POST", base + "/api/iptv", token, "{\"type\":\"xtream\",\"host\":\"h:80\",\"user\":\"u\",\"pass\":\"p\"}".getBytes(), code);
            check("actions delivered: " + log, log.toString().contains("key:up;text:héllo \"x\";media:next;iptv:h:80/u;") && !log.toString().contains("script"));
            byte[] big = new byte[300000]; for (int i = 0; i < big.length; i++) big[i] = (byte) i;
            http("POST", base + "/api/upload?kind=music&name=" + java.net.URLEncoder.encode("../../My Song (1).mp3", "UTF-8") + "&profile=p1", token, big, code);
            File up = new File(dir, "music_My Song (1).mp3");
            check("upload saved, traversal stripped", code[0] == 200 && up.length() == big.length && java.util.Arrays.equals(Files.readAllBytes(up.toPath()), big));
            check("upload callback", log.toString().contains("up:music:300000:p1;"));
            http("POST", base + "/api/upload?kind=music&name=evil.apk", token, new byte[10], code); check("bad type refused", code[0] == 400);
            http("POST", base + "/api/upload?kind=photo&name=a.jpg&token=" + token, null, new byte[]{1, 2, 3}, code); check("query token works", code[0] == 200);
            // lockout after 5 wrong codes
            for (int i = 0; i < 5; i++) http("POST", base + "/api/pair", null, "{\"code\":\"abc\"}".getBytes(), code);
            String locked = http("POST", base + "/api/pair", null, ("{\"code\":\"" + s.code() + "\"}").getBytes(), code);
            check("lockout", code[0] == 403 && locked.contains("Wait"));
            // tokens survive restart
            s.stop();
            LinkServer s2 = new LinkServer(h);
            int p2 = s2.start(18765);
            http("GET", "http://127.0.0.1:" + p2 + "/api/state", token, null, code); check("token persisted", code[0] == 200);
            s2.forgetAll();
            http("GET", "http://127.0.0.1:" + p2 + "/api/state", token, null, code); check("forget all", code[0] == 401);
            s2.stop();
        } finally { s.stop(); }
        check("safeName", LinkServer.safeName("..\\..\\x/.hidden.png").equals("hidden.png") && LinkServer.safeName("noext") == null);
    }
}
