package com.kairnlabs.cainos;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * "Phone Link": a tiny web server on the home network. A phone opens http://tv-address:port,
 * enters the 6-digit code shown on the TV, and can then act as a remote, type text, set up IPTV
 * and send photos, backgrounds and music to the TV.
 *
 * Only devices on the same local network are answered, every action needs a token obtained with
 * the on-screen code, and wrong codes lock pairing for a minute. Pure Java (unit-tested on a JVM).
 */
public final class LinkServer {

    public interface Host {
        byte[] page();
        String state();
        void key(String key);
        void text(String text);
        void media(String cmd);
        void iptv(Map<String, String> config);
        /** Where an upload should be written, or null to refuse it. */
        File uploadTarget(String kind, String fileName, String profile);
        void uploaded(String kind, File file, String profile);
        void paired();
        String loadTokens();
        void saveTokens(String csv);
    }

    private static final long MAX_UPLOAD = 600L * 1024 * 1024;
    private static final int MAX_CONNECTIONS = 12;

    private final Host host;
    private final SecureRandom rnd = new SecureRandom();
    private final Set<String> tokens = new LinkedHashSet<>();
    private final AtomicInteger active = new AtomicInteger();
    private volatile ServerSocket server;
    private volatile boolean running;
    private volatile String code;
    private int fails;
    private long lockedUntil;
    private int port;

    public LinkServer(Host host) {
        this.host = host;
        String saved = host.loadTokens();
        if (saved != null) for (String t : saved.split(",")) if (t.length() == 32) tokens.add(t);
        newCode();
    }

    public synchronized void newCode() { code = String.format(Locale.ROOT, "%06d", rnd.nextInt(1000000)); }
    public String code() { return code; }
    public int port() { return port; }
    public boolean running() { return running; }
    public synchronized int pairedCount() { return tokens.size(); }

    public synchronized void forgetAll() { tokens.clear(); host.saveTokens(""); newCode(); }

    /** Starts listening on the first free port from preferredPort upward. Returns the port, or -1. */
    public synchronized int start(int preferredPort) {
        if (running) return port;
        for (int p = preferredPort; p < preferredPort + 12; p++) {
            try {
                ServerSocket s = new ServerSocket(p);
                server = s;
                port = p;
                running = true;
                Thread t = new Thread(this::acceptLoop, "cain-link");
                t.setDaemon(true);
                t.start();
                return p;
            } catch (IOException ignored) { }
        }
        return -1;
    }

    public synchronized void stop() {
        running = false;
        ServerSocket s = server;
        server = null;
        if (s != null) try { s.close(); } catch (IOException ignored) { }
    }

    private void acceptLoop() {
        ServerSocket s = server;
        while (running && s != null) {
            try {
                final Socket sock = s.accept();
                if (active.get() >= MAX_CONNECTIONS || !isLocal(sock.getInetAddress())) { close(sock); continue; }
                active.incrementAndGet();
                Thread t = new Thread(() -> {
                    try { handle(sock); } catch (Throwable ignored) { } finally { close(sock); active.decrementAndGet(); }
                }, "cain-link-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    static boolean isLocal(InetAddress a) {
        return a != null && (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress());
    }

    private static void close(Socket s) { try { s.close(); } catch (IOException ignored) { } }

    // ───────────────────────── request handling ─────────────────────────

    private void handle(Socket sock) throws IOException {
        sock.setSoTimeout(30000);
        InputStream in = new BufferedInputStream(sock.getInputStream(), 1 << 16);
        OutputStream out = sock.getOutputStream();

        String head = readHead(in);
        if (head == null) return;
        String[] lines = head.split("\r\n");
        String[] rl = lines[0].split(" ");
        if (rl.length < 2) { send(out, 400, "text/plain", "Bad request"); return; }
        String method = rl[0], target = rl[1];
        Map<String, String> headers = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int c = lines[i].indexOf(':');
            if (c > 0) headers.put(lines[i].substring(0, c).trim().toLowerCase(Locale.ROOT), lines[i].substring(c + 1).trim());
        }
        String path = target;
        Map<String, String> query = new HashMap<>();
        int qm = target.indexOf('?');
        if (qm >= 0) {
            path = target.substring(0, qm);
            for (String kv : target.substring(qm + 1).split("&")) {
                int eq = kv.indexOf('=');
                if (eq > 0) query.put(dec(kv.substring(0, eq)), dec(kv.substring(eq + 1)));
            }
        }
        long length = 0;
        try { length = Long.parseLong(headers.getOrDefault("content-length", "0")); } catch (NumberFormatException ignored) { }

        if ("GET".equals(method) && ("/".equals(path) || "/index.html".equals(path))) {
            byte[] page = host.page();
            sendBytes(out, 200, "text/html; charset=utf-8", page);
            return;
        }
        if ("GET".equals(method) && "/favicon.ico".equals(path)) { send(out, 204, "text/plain", ""); return; }

        if ("POST".equals(method) && "/api/pair".equals(path)) {
            Map<String, String> body = jsonBody(in, length);
            String token = pair(body.get("code"));
            if (token == null) send(out, 403, "application/json", "{\"ok\":false,\"error\":" + JsonIn.q(pairError()) + "}");
            else send(out, 200, "application/json", "{\"ok\":true,\"token\":\"" + token + "\"}");
            return;
        }

        String token = headers.get("x-cain-token");
        if (token == null) token = query.get("token");
        if (!authed(token)) { send(out, 401, "application/json", "{\"ok\":false,\"error\":\"Not paired\"}"); return; }

        if ("GET".equals(method) && "/api/state".equals(path)) { send(out, 200, "application/json", host.state()); return; }

        if (!"POST".equals(method)) { send(out, 404, "application/json", "{\"ok\":false}"); return; }

        switch (path) {
            case "/api/key": {
                String k = jsonBody(in, length).get("key");
                if (k != null && k.matches("[a-z:]{1,16}")) host.key(k);
                send(out, 200, "application/json", "{\"ok\":true}");
                return;
            }
            case "/api/text": {
                String t = jsonBody(in, length).get("text");
                if (t != null) host.text(t.length() > 500 ? t.substring(0, 500) : t);
                send(out, 200, "application/json", "{\"ok\":true}");
                return;
            }
            case "/api/media": {
                String c = jsonBody(in, length).get("cmd");
                if (c != null && c.matches("[a-z]{1,10}")) host.media(c);
                send(out, 200, "application/json", "{\"ok\":true}");
                return;
            }
            case "/api/iptv": {
                host.iptv(jsonBody(in, length));
                send(out, 200, "application/json", "{\"ok\":true}");
                return;
            }
            case "/api/upload": {
                String kind = query.get("kind"), name = safeName(query.get("name")), profile = query.get("profile");
                if (profile != null && !profile.matches("[A-Za-z0-9]{1,24}")) profile = null;
                if (kind == null || name == null || length <= 0 || length > MAX_UPLOAD || !allowed(kind, name)) {
                    send(out, 400, "application/json", "{\"ok\":false,\"error\":\"That file type can't be used here.\"}");
                    return;
                }
                File dest = host.uploadTarget(kind, name, profile);
                if (dest == null) { send(out, 400, "application/json", "{\"ok\":false,\"error\":\"The TV couldn't take that file.\"}"); return; }
                File part = new File(dest.getParentFile(), dest.getName() + ".part");
                boolean ok = false;
                try (FileOutputStream fo = new FileOutputStream(part)) {
                    byte[] buf = new byte[1 << 16];
                    long left = length;
                    while (left > 0) {
                        int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                        if (n < 0) break;
                        fo.write(buf, 0, n);
                        left -= n;
                    }
                    ok = left == 0;
                } finally {
                    if (!ok) part.delete();
                }
                if (!ok) { send(out, 400, "application/json", "{\"ok\":false,\"error\":\"The upload was cut off.\"}"); return; }
                dest.delete();
                if (!part.renameTo(dest)) { part.delete(); send(out, 500, "application/json", "{\"ok\":false,\"error\":\"The TV couldn't save that file.\"}"); return; }
                host.uploaded(kind, dest, profile);
                send(out, 200, "application/json", "{\"ok\":true}");
                return;
            }
            default:
                send(out, 404, "application/json", "{\"ok\":false}");
        }
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream(1024);
        int state = 0, b;
        while ((b = in.read()) >= 0) {
            bo.write(b);
            if (b == '\r' && (state == 0 || state == 2)) state++;
            else if (b == '\n' && (state == 1 || state == 3)) state++;
            else state = 0;
            if (state == 4) return new String(bo.toByteArray(), 0, bo.size() - 4, StandardCharsets.ISO_8859_1);
            if (bo.size() > 16384) return null;
        }
        return null;
    }

    private static Map<String, String> jsonBody(InputStream in, long length) throws IOException {
        Map<String, String> m = new HashMap<>();
        if (length <= 0 || length > 65536) return m;
        byte[] buf = new byte[(int) length];
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n < 0) break;
            off += n;
        }
        try {
            JsonIn j = new JsonIn(new StringReader(new String(buf, 0, off, StandardCharsets.UTF_8)));
            if (j.peek() != '{') return m;
            j.beginObject();
            while (j.hasNext()) {
                String k = j.nextName();
                String v = j.nextString();
                if (v != null) m.put(k, v);
            }
        } catch (IOException ignored) { }
        return m;
    }

    // ───────────────────────── pairing ─────────────────────────

    private synchronized String pair(String entered) {
        long now = System.currentTimeMillis();
        if (now < lockedUntil) return null;
        if (entered == null || !entered.trim().equals(code)) {
            if (++fails >= 5) { fails = 0; lockedUntil = now + 60000; newCode(); }
            return null;
        }
        fails = 0;
        byte[] b = new byte[16];
        rnd.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        String t = sb.toString();
        tokens.add(t);
        while (tokens.size() > 8) tokens.remove(tokens.iterator().next());
        StringBuilder csv = new StringBuilder();
        for (String x : tokens) { if (csv.length() > 0) csv.append(','); csv.append(x); }
        host.saveTokens(csv.toString());
        newCode();
        host.paired();
        return t;
    }

    private synchronized String pairError() {
        return System.currentTimeMillis() < lockedUntil ? "Too many wrong codes. Wait a minute, then use the new code on the TV." : "That code isn't right. Check the TV and try again.";
    }

    private synchronized boolean authed(String token) { return token != null && tokens.contains(token); }

    // ───────────────────────── helpers ─────────────────────────

    public static String safeName(String n) {
        if (n == null) return null;
        n = n.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).trim();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n.length() && sb.length() < 120; i++) {
            char c = n.charAt(i);
            sb.append(Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_' || c == ' ' || c == '(' || c == ')' ? c : '_');
        }
        String s = sb.toString();
        while (s.startsWith(".")) s = s.substring(1);
        return s.isEmpty() || !s.contains(".") ? null : s;
    }

    static boolean allowed(String kind, String name) {
        String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (kind) {
            case "photo": return ext.matches("jpg|jpeg|png|webp");
            case "wallpaper": return ext.matches("jpg|jpeg|png|webp|gif|mp4|webm");
            case "music": return ext.matches("mp3|m4a|aac|wav|ogg|oga|flac|opus");
            default: return false;
        }
    }

    private static String dec(String s) {
        try { return URLDecoder.decode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static void send(OutputStream out, int code, String type, String body) throws IOException {
        sendBytes(out, code, type, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void sendBytes(OutputStream out, int code, String type, byte[] body) throws IOException {
        String status = code == 200 ? "OK" : code == 204 ? "No Content" : code == 400 ? "Bad Request" : code == 401 ? "Unauthorized"
                : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : "Error";
        String head = "HTTP/1.1 " + code + " " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }
}
