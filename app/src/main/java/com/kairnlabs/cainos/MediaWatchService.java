package com.kairnlabs.cainos;

import android.service.notification.NotificationListenerService;

/**
 * Android only lets an app see what other apps are playing if the user has granted it
 * "notification access". This empty listener exists so that permission can be granted;
 * Cain OS does not read or store any notifications.
 */
public class MediaWatchService extends NotificationListenerService {
}
