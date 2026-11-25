package com.kairnlabs.cainos;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;

/**
 * "Install an app from a link": downloads an .apk and hands it to Android's own installer,
 * which always asks the user to confirm. Android will also ask once for permission to
 * "install unknown apps" for Cain OS.
 */
final class Installer {
    private Installer() {}

    private static void status(Bridge b, String state, int pct, String msg) {
        b.emit("install", "{\"state\":" + JsonIn.q(state) + ",\"pct\":" + pct + ",\"msg\":" + JsonIn.q(msg) + "}");
    }

    static void downloadAndInstall(Context ctx, Bridge bridge, String url) {
        File dir = new File(ctx.getCacheDir(), "apk");
        dir.mkdirs();
        File apk = new File(dir, "download.apk");
        try {
            if (url == null) throw new java.io.IOException("Enter a link to an .apk file.");
            url = url.trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
            status(bridge, "download", 0, "Downloading…");
            HttpURLConnection c = IptvSync.open(url);
            long total = c.getContentLengthLong(), got = 0;
            int lastPct = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    got += n;
                    if (got > 1024L * 1024 * 1024) throw new java.io.IOException("That file is too large to be an app.");
                    int pct = total > 0 ? (int) (got * 100 / total) : -1;
                    if (pct != lastPct && (pct < 0 ? got % (1 << 20) < (1 << 16) : true)) { lastPct = pct; status(bridge, "download", Math.max(0, pct), "Downloading…"); }
                }
            } finally { c.disconnect(); }

            // An APK is a zip file: it must start with "PK".
            try (InputStream in = new FileInputStream(apk)) {
                if (in.read() != 'P' || in.read() != 'K') throw new java.io.IOException("That link isn't an Android app (.apk) file.");
            }

            status(bridge, "install", 100, "Opening the installer…");
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setSize(apk.length());
            int id = pi.createSession(params);
            try (PackageInstaller.Session session = pi.openSession(id)) {
                try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("app", 0, apk.length())) {
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                Intent done = new Intent(ctx, InstallReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                session.commit(PendingIntent.getBroadcast(ctx, id, done, flags).getIntentSender());
            }
        } catch (SecurityException e) {
            status(bridge, "error", 0, "Android blocked the install. Allow Cain OS to install unknown apps, then try again.");
        } catch (Throwable t) {
            String m = t.getMessage();
            status(bridge, "error", 0, m == null || m.isEmpty() ? "The download failed. Check the link and try again." : m);
        } finally {
            apk.delete();
        }
    }
}
