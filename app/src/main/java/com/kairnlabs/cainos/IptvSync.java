package com.kairnlabs.cainos;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Downloads an IPTV provider's catalogue (Xtream Codes API or an M3U playlist) and stores it on
 * disk as small per-category files, so the interface only ever loads one category at a time.
 *
 * Output in outDir, for each kind K in live / vod / series:
 *   K_cats.json   [[index, "name", count], ...]
 *   K_<index>.json [["id","name","icon","extra"], ...]   extra = container extension, or the stream URL for M3U
 *   K_index.tsv   id \t name \t icon \t extra \t categoryIndex      (used for search)
 *   meta.json     {"type","label","expires","live","vod","series","at"}
 *
 * Pure Java so it can be tested on a desktop JVM against a mock server.
 */
public final class IptvSync {

    public interface Progress { void stage(String message, int percent); }

    public static final class Result {
        public boolean ok;
        public String error = "";
        public int live, vod, series;
        public String label = "", expires = "";
    }

    static final String UA = "Mozilla/5.0 (Linux; Android TV) CainOS/1.0";
    public static final String[] KINDS = {"live", "vod", "series"};

    private IptvSync() {}

    // ───────────────────────── entry points ─────────────────────────

    public static Result syncXtream(String host, String user, String pass, File outDir, Progress p) {
        Result r = new Result();
        File tmp = new File(outDir.getParentFile(), outDir.getName() + ".tmp");
        try {
            String base = normalizeBase(host);
            if (base.isEmpty() || user == null || user.trim().isEmpty() || pass == null || pass.isEmpty())
                throw new IOException("Enter the server address, username and password.");
            user = user.trim();
            String api = base + "/player_api.php?username=" + enc(user) + "&password=" + enc(pass);
            step(p, "Signing in…", 3);
            auth(api, r);
            r.label = hostOf(base);
            resetDir(tmp);

            step(p, "Loading live channels…", 10);
            r.live = xtreamKind(api, "live", "get_live_categories", "get_live_streams", "stream_id", "stream_icon", null, tmp);
            step(p, "Loading movies…", 40);
            r.vod = xtreamKind(api, "vod", "get_vod_categories", "get_vod_streams", "stream_id", "stream_icon", "container_extension", tmp);
            step(p, "Loading series…", 75);
            r.series = xtreamKind(api, "series", "get_series_categories", "get_series", "series_id", "cover", null, tmp);

            if (r.live + r.vod + r.series == 0) throw new IOException("The provider signed in but returned an empty catalogue.");
            writeMeta(tmp, "xtream", r);
            swap(tmp, outDir);
            step(p, "Done", 100);
            r.ok = true;
        } catch (Exception e) {
            r.error = friendly(e);
            deleteDir(tmp);
        }
        return r;
    }

    public static Result syncM3u(String url, File outDir, Progress p) {
        Result r = new Result();
        File tmp = new File(outDir.getParentFile(), outDir.getName() + ".tmp");
        try {
            if (url == null || url.trim().isEmpty()) throw new IOException("Enter the playlist link.");
            url = url.trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
            step(p, "Downloading playlist…", 5);
            resetDir(tmp);
            HttpURLConnection c = open(url);
            try (InputStream in = c.getInputStream()) {
                step(p, "Reading channels…", 30);
                int[] n = parseM3u(new InputStreamReader(in, StandardCharsets.UTF_8), tmp);
                r.live = n[0];
                r.vod = n[1];
            } finally { c.disconnect(); }
            if (r.live + r.vod == 0) throw new IOException("That link didn't contain any channels. Check it's an M3U playlist.");
            r.label = hostOf(url);
            writeKind(tmp, "series", new LinkedHashMap<String, Bucket>());
            writeMeta(tmp, "m3u", r);
            swap(tmp, outDir);
            step(p, "Done", 100);
            r.ok = true;
        } catch (Exception e) {
            r.error = friendly(e);
            deleteDir(tmp);
        }
        return r;
    }

    /** Case-insensitive search over the saved catalogue. Returns {"live":[...],"vod":[...],"series":[...]}. */
    public static String search(File dir, String query, int limitPerKind) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder("{");
        for (int k = 0; k < KINDS.length; k++) {
            if (k > 0) out.append(',');
            out.append('"').append(KINDS[k]).append("\":[");
            int n = 0;
            File f = new File(dir, KINDS[k] + "_index.tsv");
            if (!q.isEmpty() && f.isFile()) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8), 1 << 16)) {
                    String line;
                    while (n < limitPerKind && (line = br.readLine()) != null) {
                        int t1 = line.indexOf('\t');
                        if (t1 < 0) continue;
                        int t2 = line.indexOf('\t', t1 + 1);
                        if (t2 < 0) continue;
                        if (!line.substring(t1 + 1, t2).toLowerCase(Locale.ROOT).contains(q)) continue;
                        String[] p = line.split("\t", -1);
                        if (p.length < 5) continue;
                        if (n++ > 0) out.append(',');
                        out.append('[').append(JsonIn.q(p[0])).append(',').append(JsonIn.q(p[1])).append(',')
                           .append(JsonIn.q(p[2])).append(',').append(JsonIn.q(p[3])).append(',').append(JsonIn.q(p[4])).append(']');
                    }
                } catch (IOException ignored) { }
            }
            out.append(']');
        }
        return out.append('}').toString();
    }

    // ───────────────────────── Xtream ─────────────────────────

    private static void auth(String api, Result r) throws IOException {
        HttpURLConnection c = open(api);
        boolean sawUser = false;
        String auth = null, status = null;
        try (Reader rd = new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8)) {
            JsonIn j = new JsonIn(rd);
            if (j.peek() != '{') throw new IOException("That address didn't answer like an IPTV server. Check the server address and port.");
            j.beginObject();
            while (j.hasNext()) {
                String name = j.nextName();
                if ("user_info".equals(name) && j.peek() == '{') {
                    sawUser = true;
                    j.beginObject();
                    while (j.hasNext()) {
                        String k = j.nextName();
                        if ("auth".equals(k)) auth = j.nextString();
                        else if ("status".equals(k)) status = j.nextString();
                        else if ("exp_date".equals(k)) { String v = j.nextString(); r.expires = v == null ? "" : v; }
                        else j.skipValue();
                    }
                    j.endObject();
                } else j.skipValue();
            }
        } finally { c.disconnect(); }
        if (!sawUser || "0".equals(auth)) throw new IOException("The provider rejected that username or password.");
        if (status != null && !status.isEmpty() && !"Active".equalsIgnoreCase(status))
            throw new IOException("The provider says this account is " + status.toLowerCase(Locale.ROOT) + ".");
    }

    private static int xtreamKind(String api, String kind, String catsAction, String itemsAction,
                                  String idField, String iconField, String extField, File dir) throws IOException {
        LinkedHashMap<String, Bucket> buckets = new LinkedHashMap<>();
        try {
            HttpURLConnection c = open(api + "&action=" + catsAction);
            try (Reader rd = new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8)) {
                JsonIn j = new JsonIn(rd);
                if (j.peek() == '[') {
                    j.beginArray();
                    while (j.hasNext()) {
                        if (j.peek() != '{') { j.skipValue(); continue; }
                        String id = null, name = null;
                        j.beginObject();
                        while (j.hasNext()) {
                            String k = j.nextName();
                            if ("category_id".equals(k)) id = j.nextString();
                            else if ("category_name".equals(k)) name = j.nextString();
                            else j.skipValue();
                        }
                        j.endObject();
                        if (id != null && !buckets.containsKey(id)) buckets.put(id, new Bucket(name == null || name.trim().isEmpty() ? "Category " + id : name.trim()));
                    }
                    j.endArray();
                }
            } finally { c.disconnect(); }
        } catch (IOException e) {
            // Some panels don't offer every section; a missing category list is not fatal.
        }

        int total = 0;
        try {
            HttpURLConnection c = open(api + "&action=" + itemsAction);
            try (Reader rd = new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8)) {
                JsonIn j = new JsonIn(rd);
                if (j.peek() == '[') {
                    j.beginArray();
                    while (j.hasNext()) {
                        if (j.peek() != '{') { j.skipValue(); continue; }
                        String id = null, name = null, icon = null, cat = null, ext = null;
                        j.beginObject();
                        while (j.hasNext()) {
                            String k = j.nextName();
                            if (idField.equals(k)) id = j.nextString();
                            else if ("name".equals(k)) name = j.nextString();
                            else if (iconField.equals(k)) icon = j.nextString();
                            else if ("category_id".equals(k)) cat = j.nextString();
                            else if (extField != null && extField.equals(k)) ext = j.nextString();
                            else j.skipValue();
                        }
                        j.endObject();
                        if (id == null || id.isEmpty() || name == null) continue;
                        Bucket b = cat == null ? null : buckets.get(cat);
                        if (b == null) {
                            b = buckets.get("\u0000other");
                            if (b == null) { b = new Bucket("Other"); buckets.put("\u0000other", b); }
                        }
                        b.add(id, name.trim(), icon, ext == null ? "" : ext);
                        total++;
                    }
                    j.endArray();
                }
            } finally { c.disconnect(); }
        } catch (IOException e) {
            if ("live".equals(kind)) throw e; // live is the core section; movies and series may be absent
        }
        writeKind(dir, kind, buckets);
        return total;
    }

    // ───────────────────────── M3U ─────────────────────────

    /** Parses an M3U playlist into live and vod buckets. Returns {liveCount, vodCount}. */
    static int[] parseM3u(Reader reader, File dir) throws IOException {
        LinkedHashMap<String, Bucket> live = new LinkedHashMap<>(), vod = new LinkedHashMap<>();
        BufferedReader br = new BufferedReader(reader, 1 << 16);
        String line, name = null, logo = "", group = "";
        int nLive = 0, nVod = 0, idx = 0;
        boolean first = true;
        while ((line = br.readLine()) != null) {
            if (first) { first = false; if (!line.isEmpty() && line.charAt(0) == '﻿') line = line.substring(1); }
            line = line.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#EXTINF")) {
                logo = attr(line, "tvg-logo");
                group = attr(line, "group-title");
                int lastQuote = line.lastIndexOf('"');
                int comma = line.indexOf(',', Math.max(lastQuote, 0));
                name = comma >= 0 ? line.substring(comma + 1).trim() : "";
                if (name.isEmpty()) name = attr(line, "tvg-name");
                continue;
            }
            if (line.startsWith("#EXTGRP:")) { if (group.isEmpty()) group = line.substring(8).trim(); continue; }
            if (line.charAt(0) == '#') continue;
            if (name == null) continue;
            String url = line;
            if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("rtmp://") || url.startsWith("rtsp://")) {
                String lower = url.toLowerCase(Locale.ROOT);
                int qm = lower.indexOf('?');
                String path = qm >= 0 ? lower.substring(0, qm) : lower;
                boolean isVod = path.endsWith(".mp4") || path.endsWith(".mkv") || path.endsWith(".avi") || path.endsWith(".mov")
                        || path.contains("/movie/") || path.contains("/series/");
                LinkedHashMap<String, Bucket> map = isVod ? vod : live;
                String g = group.isEmpty() ? "Other" : group;
                Bucket b = map.get(g);
                if (b == null) { b = new Bucket(g); map.put(g, b); }
                b.add("m" + (idx++), name.isEmpty() ? "Channel " + idx : name, logo, url);
                if (isVod) nVod++; else nLive++;
            }
            name = null; logo = ""; group = "";
        }
        writeKind(dir, "live", live);
        writeKind(dir, "vod", vod);
        return new int[]{nLive, nVod};
    }

    private static String attr(String line, String key) {
        int i = line.indexOf(key + "=\"");
        if (i < 0) return "";
        int s = i + key.length() + 2, e = line.indexOf('"', s);
        return e < 0 ? "" : line.substring(s, e).trim();
    }

    // ───────────────────────── files ─────────────────────────

    private static final class Bucket {
        final String name;
        final List<String[]> items = new ArrayList<>();
        Bucket(String name) { this.name = name; }
        void add(String id, String name, String icon, String extra) {
            items.add(new String[]{id, clean(name), icon == null ? "" : clean(icon), clean(extra)});
        }
    }

    private static String clean(String s) { return s == null ? "" : s.replace('\t', ' ').replace('\n', ' ').replace('\r', ' '); }

    private static void writeKind(File dir, String kind, LinkedHashMap<String, Bucket> buckets) throws IOException {
        StringBuilder cats = new StringBuilder("[");
        int ci = 0;
        try (Writer index = writer(new File(dir, kind + "_index.tsv"))) {
            for (Map.Entry<String, Bucket> e : buckets.entrySet()) {
                Bucket b = e.getValue();
                if (b.items.isEmpty()) continue;
                if (ci > 0) cats.append(',');
                cats.append('[').append(ci).append(',').append(JsonIn.q(b.name)).append(',').append(b.items.size()).append(']');
                try (Writer w = writer(new File(dir, kind + "_" + ci + ".json"))) {
                    w.write('[');
                    for (int i = 0; i < b.items.size(); i++) {
                        String[] it = b.items.get(i);
                        if (i > 0) w.write(',');
                        w.write("[" + JsonIn.q(it[0]) + "," + JsonIn.q(it[1]) + "," + JsonIn.q(it[2]) + "," + JsonIn.q(it[3]) + "]");
                        index.write(it[0] + "\t" + it[1] + "\t" + it[2] + "\t" + it[3] + "\t" + ci + "\n");
                    }
                    w.write(']');
                }
                ci++;
            }
        }
        cats.append(']');
        try (Writer w = writer(new File(dir, kind + "_cats.json"))) { w.write(cats.toString()); }
    }

    private static void writeMeta(File dir, String type, Result r) throws IOException {
        try (Writer w = writer(new File(dir, "meta.json"))) {
            w.write("{\"type\":" + JsonIn.q(type) + ",\"label\":" + JsonIn.q(r.label) + ",\"expires\":" + JsonIn.q(r.expires)
                    + ",\"live\":" + r.live + ",\"vod\":" + r.vod + ",\"series\":" + r.series + ",\"at\":" + System.currentTimeMillis() + "}");
        }
    }

    private static Writer writer(File f) throws IOException {
        return new BufferedWriter(new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8), 1 << 16);
    }

    private static void resetDir(File d) throws IOException {
        deleteDir(d);
        if (!d.mkdirs() && !d.isDirectory()) throw new IOException("This device couldn't make room to save the channel list.");
    }

    static void deleteDir(File d) {
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) { if (f.isDirectory()) deleteDir(f); else f.delete(); }
        d.delete();
    }

    private static void swap(File tmp, File out) throws IOException {
        deleteDir(out);
        if (!tmp.renameTo(out)) throw new IOException("This device couldn't save the channel list.");
    }

    // ───────────────────────── network ─────────────────────────

    static HttpURLConnection open(String url) throws IOException {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IOException("The server sent a broken redirect.");
                url = new URL(new URL(url), loc).toString();
                continue;
            }
            if (code == 401 || code == 403) { c.disconnect(); throw new IOException("The provider refused the request (code " + code + "). Check the username and password."); }
            if (code == 404) { c.disconnect(); throw new IOException("Nothing was found at that address (404). Check the server address and port."); }
            if (code >= 400) { c.disconnect(); throw new IOException("The provider's server answered with an error (code " + code + ")."); }
            return c;
        }
        throw new IOException("Too many redirects.");
    }

    /** Turns whatever the user typed into scheme://host[:port] with no trailing slash or path. */
    public static String normalizeBase(String host) {
        if (host == null) return "";
        String h = host.trim();
        if (h.isEmpty()) return "";
        if (!h.startsWith("http://") && !h.startsWith("https://")) h = "http://" + h;
        int schemeEnd = h.indexOf("://") + 3;
        int slash = h.indexOf('/', schemeEnd);
        if (slash >= 0) h = h.substring(0, slash);
        int qm = h.indexOf('?');
        if (qm >= 0) h = h.substring(0, qm);
        return h.length() <= schemeEnd ? "" : h;
    }

    private static String hostOf(String url) {
        try { return new URL(url).getHost(); } catch (Exception e) { return url; }
    }

    private static String enc(String s) throws IOException { return URLEncoder.encode(s, "UTF-8"); }

    private static void step(Progress p, String msg, int pct) { if (p != null) p.stage(msg, pct); }

    private static String friendly(Exception e) {
        if (e instanceof java.net.UnknownHostException) return "Couldn't find that server. Check the address, and that this device is online.";
        if (e instanceof java.net.SocketTimeoutException) return "The provider took too long to answer. Try again in a moment.";
        if (e instanceof java.net.ConnectException) return "Couldn't connect to that server. Check the address and port.";
        if (e instanceof javax.net.ssl.SSLException) return "Couldn't make a secure connection to that server. Try http:// instead of https://.";
        if (e instanceof java.net.MalformedURLException) return "That address doesn't look right. It should be like http://example.com:8080";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "Something went wrong while loading the channel list." : m;
    }
}
