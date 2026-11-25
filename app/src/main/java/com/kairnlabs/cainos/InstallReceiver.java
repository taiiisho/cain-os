package com.kairnlabs.cainos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives the result of an app install started from Cain OS and shows Android's confirmation screen. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { ctx.startActivity(confirm); } catch (Throwable ignored) { }
            }
            return;
        }
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        ctx.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE).edit()
                .putString("js_lastInstall", (status == PackageInstaller.STATUS_SUCCESS ? "ok|" : "fail|") + (msg == null ? "" : msg) + "|" + System.currentTimeMillis()).apply();
    }
}
