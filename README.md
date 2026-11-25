# Cain OS

A home screen for Google TV and Fire TV, by Kairn Labs.

- **Home:** your streaming apps on a 3D dock, live backgrounds, and full-screen music from Spotify, YouTube Music or your own songs.
- **Live TV, Movies, Shows:** filled from your own IPTV provider (Xtream login or M3U link, the same details as IPTV Smarters Pro), with Continue Watching and Recent Channels.
- **Phone Link:** use your phone as a keyboard and remote, and send it music, photos and backgrounds over your home Wi-Fi.
- **Also included:** voice search, profiles, a screensaver, and a Home-button helper that brings you back to Cain OS.

## Building

You don't need Android Studio. Every push to GitHub builds the app with GitHub Actions (`.github/workflows/build.yml`) and publishes it at:

```
https://github.com/<your-name>/<repo>/releases/latest/download/CainOS.apk
```

The build needs one secret, `CAIN_KEYSTORE_B64`: the signing key, base64-encoded. **Never commit the key itself.** Every version must be signed with the same key, or Android won't install an update over the old one.

To build locally instead, run `gradle :app:assembleRelease` with JDK 17, Gradle 8.11.1 and the Android SDK (API 34). Put the key at `signing/cainos.jks`.

## Layout

| Path | What it is |
| --- | --- |
| `app/src/main/java/com/kairnlabs/cainos/` | The Android shell: WebView host, bridge, video player, IPTV sync, Phone Link server, Home-button helper, installer |
| `app/src/main/assets/index.html`, `cain.css`, `cain.js` | The interface |
| `app/src/main/assets/link.html` | The page your phone opens for Phone Link |
| `app/src/main/assets/demo.js` | Stands in for the device when the interface is opened in a normal browser |
| `tests/java/PureTests.java` | Tests for JSON parsing, IPTV sync (against a mock server) and Phone Link. CI runs them on every build |

## Privacy

Profiles, watch history, IPTV details and paired phones stay on the device. Cain OS has no ads, no analytics, and no Kairn Labs server.

© 2026 Kairn Labs. All rights reserved.
