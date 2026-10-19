# Real-device test procedure (isolated, disposable data)

**Status: real-device testing has NOT been performed.** The agent environment has no iPhone and no iOS Safari/WebKit engine. What has been
done is a scripted desktop-Chrome rehearsal (`integration/device/rehearse.js`, 12 checks) that proves the bundle, guard, seed backup and the
scriptable steps. Everything under "Manual acceptance checklist" below is **untested and must be run by a person on the phone**. Treat
iPhone behaviour as unknown until the checklist is signed off.

## Hard rules

1. Use a **separate origin** that has never held your real training data (a new tunnel hostname, a new test site, or a separate browser profile on `localhost`). Browser storage is per origin, so a different hostname cannot see your real `pa_*` data.
2. Use **only** the synthetic file `DISPOSABLE_TEST_BACKUP.json` (made by this procedure). Do **not** export from, import to, or restore against your real installed app.
3. Do **not** deploy, merge, or push to your production host. Add that host to `--forbid` when building, so the test build refuses to run there.
4. Use a clearly different Home Screen name: the test bundle installs as **PA TEST A / PA TEST B**, with a red banner "TEST BUILD ... DISPOSABLE DATA ONLY".
5. If anything on the phone looks like your real data (your real workouts, real weights), stop, close it and do not tap RESTORE or any delete action.

## What the test bundle is

`build_device_bundle.js` copies the Phase 3 candidate (`integration/app`) and changes only: an origin guard at the top of `<head>`, a fixed red TEST label,
the page title, the service-worker cache name (`project-america-shell-devicetest-<tag>`) and the manifest `name`/`short_name`/`id`. `--check` proves it
(reverses those edits and compares to the source, byte for byte). The guard blocks any host that is not `localhost`/`127.0.0.1`, an allowed tunnel
suffix (`--allow`) or that is listed in `--forbid`; a blocked page runs no app code, writes no storage and registers no service worker (rehearsal step D3).

## A. Prepare (on a computer)

Prerequisites: Node 22, Chrome (for the rehearsal only), and one HTTPS tunnel tool (for example `cloudflared`). iOS needs **HTTPS** for the service worker and Home-Screen install; plain `http://<LAN-ip>` will not work.

```bash
# 1. Build two test builds so the update test has an A (installed first) and a B (deployed later)
node integration/device/build_device_bundle.js --tag A --out integration/device/dist/A --forbid YOUR-REAL-HOST.example
node integration/device/build_device_bundle.js --tag B --out integration/device/dist/B --forbid YOUR-REAL-HOST.example
node integration/device/build_device_bundle.js --check integration/device/dist/A
node integration/device/build_device_bundle.js --check integration/device/dist/B

# 2. Make the synthetic backup (driven through the app itself, no personal data)
node integration/device/make_disposable_backup.js --out integration/device/dist/DISPOSABLE_TEST_BACKUP.json

# 3. (optional but recommended) rehearse everything scriptable on the desktop first
node integration/device/rehearse.js

# 4. Serve build A locally and put an HTTPS tunnel in front of it
node integration/device/serve_bundle.js integration/device/dist/A --port 8787      # keep this running
cloudflared tunnel --url http://127.0.0.1:8787                                    # prints https://<random>.trycloudflare.com
```

If the tunnel host is not under the default allow list (`.trycloudflare.com .loca.lt .ngrok-free.app .ngrok.app .ngrok.io .serveo.net .localhost.run .lhr.life`), rebuild with `--allow <your-host-or-.suffix>`.
Get `DISPOSABLE_TEST_BACKUP.json` onto the phone (AirDrop, or Files via iCloud Drive). Name it so you can never mistake it for a real backup.
Do not put a real backup on the phone during this test.

Stop everything afterwards: Ctrl+C the server and tunnel. The tunnel URL then stops working; the test origin and its data are discarded when you delete the test Home-Screen app and clear that site's data (section K).

## B. Manual acceptance checklist (untested; fill in on the phone)

Record the iOS version, device model, and the tunnel hostname in the results table. Mark each row PASS / FAIL / N/A with notes. Any FAIL that loses or alters data is a release blocker.

### S. Safari (tab) basics

| ID | Step | Expected |
|---|---|---|
| S1 | Open the tunnel URL in Safari | Red "TEST BUILD A" banner; the app loads; no blocked page |
| S2 | Look at Home and the history | No workout history (empty state) |
| S3 | More, Backup, import `DISPOSABLE_TEST_BACKUP.json`, tap RESTORE THIS BACKUP | Preview lists sessions; restore completes; the page reloads; Home shows RESUME Giant A (the unfinished draft) |
| S4 | Close the Safari tab, reopen the URL | Same data present |

### I. Home-Screen / PWA install

| ID | Step | Expected |
|---|---|---|
| I1 | Share, Add to Home Screen | Name proposed "PA TEST A"; icon appears |
| I2 | Open from the Home Screen | Runs standalone (no Safari bars); banner visible below the status area |
| I3 | Check data in the installed app | **Expected on iOS: it starts EMPTY.** The installed app has its own storage separate from the Safari tab. Record what you see; this is a known iOS behaviour and matters for any real migration |
| I4 | In the installed app import the same disposable backup | Same result as S3 |

### O. Offline

| ID | Step | Expected |
|---|---|---|
| O1 | In the installed app, wait for "Ready offline" on Home | Status text says ready offline |
| O2 | Turn on Airplane Mode; fully quit the app; reopen it from the Home Screen | App opens from cache with the banner and your data |
| O3 | Offline, start a Giant A, log two sets, leave it unfinished | Sets saved; no network error; no external requests |
| O4 | Offline, finish a workout | Finishes; session appears in history |
| O5 | Airplane Mode off; reopen | Data unchanged; app still works |

### W. Interrupted workout recovery

| ID | Step | Expected |
|---|---|---|
| W1 | Log 2 sets of a lift, swipe the app away (force quit) | |
| W2 | Reopen: Home shows RESUME; tap it | The two logged sets are present; you can log set 3 |
| W3 | Lock the phone for 2 minutes mid-workout, unlock | Workout and rest timer still correct (timer is timestamp-based) |
| W4 | Switch to another app for 5 minutes, return | Workout intact |
| W5 | Start a workout, tap Skip on the second exercise, finish | The session's completion summary lists that exercise as skipped; no sets exist for it |

### X. Specialized intensifier logging (Giant B)

| ID | Step | Expected |
|---|---|---|
| X1 | Start Giant B: note which intensifiers are presented (for example Myo-Reps, DC Rest-Pause) | Two presented, the rest straight sets |
| X2 | Myo-Reps: enter efforts, SAVE FINAL BLOCK | Saves one cluster; numbers shown on screen |
| X3 | DC Rest-Pause: enter all stages, save | Saves; stages visible |
| X4 | Widowmaker (when presented): log the single set | Saves as one set |
| X5 | Finish. Start another Giant B | The **next group** is offered (credit follows what was performed) |
| X6 | Start a Giant B, do only straight sets, skip the intensifiers, finish. Start another Giant B | The **same group is offered again**, with a "repeat" note |
| X7 | Enter a decimal weight such as 97.5 in any set | Numeric keypad opens; the decimal is accepted and shown unchanged |

### B. Backup, export, import round trip

| ID | Step | Expected |
|---|---|---|
| B1 | More, Backup, EXPORT FULL BACKUP | iOS download or share sheet appears; save to Files and rename it to start with `TEST_` |
| B2 | In Files, open the file | Valid JSON; contains only your disposable data |
| B3 | Delete the test site's data (section K), reopen the test app (empty), import the exported file | Preview shows the same session counts; restore succeeds; data identical on screen |
| B4 | Import the seed file, which contains the cardio note `easy <Z2> 30 min` | Accepted; the note shows as plain text on the cardio PREVIOUS line; nothing renders as markup |
| B5 | Try a corrupted copy of the file (delete the last 20 characters) | Refused with a clear message; existing data unchanged |
| B6 | After any restore, More, DOWNLOAD PRE-RESTORE SNAPSHOT | A rollback file downloads |

### R. Refresh and persistence

| ID | Step | Expected |
|---|---|---|
| R1 | Pull down to refresh / reload in Safari | Data unchanged |
| R2 | Use the app for 7 days if the test lasts that long, in both Safari and the installed app | Data persists; note any iOS storage eviction in the Safari tab (installed apps are normally exempt) |
| R3 | Log a set, immediately force-quit | The set is present on reopen |
| R4 | Open More, Training Budget | Each bar has a "logged exposure" line; no unlabelled mixing of sets and checklist items |

### U. Service-worker update

| ID | Step | Expected |
|---|---|---|
| U1 | With the installed build A, start a workout and log one set (leave it running) | |
| U2 | On the computer: type `swap integration/device/dist/B` + Enter in the `serve_bundle.js` terminal | "now serving ...B" |
| U3 | On the phone, open the app; wait up to a minute (or close and reopen it once) | An update prompt appears on Home only. The banner still says TEST BUILD A; the running workout is not disturbed |
| U4 | Finish or leave the workout, return to Home, tap Update | The app reloads; banner says TEST BUILD B |
| U5 | Check data and the unfinished workout | Everything from before is still present |
| U6 | Open Airplane Mode and relaunch | B works offline |

### K. Clean-up (always)

1. Delete the "PA TEST" icon from the Home Screen.
2. Safari, Settings, Advanced, Website Data: remove the tunnel hostname.
3. Stop the server and tunnel.
4. Delete the `TEST_*` files and `DISPOSABLE_TEST_BACKUP.json` from Files.
5. Confirm your real Home-Screen app still shows your real data (only look; do not change anything).

## C. Result record

| Field | Value |
|---|---|
| Date / tester | |
| iPhone model / iOS version | |
| Tunnel hostname (destroyed afterwards) | |
| Build tags tested | A, B |
| Sections S, I, O, W, X, B, R, U, K | PASS / FAIL per row |
| Any data loss or unexpected alteration | Yes / No (Yes = release blocker) |

Only after every row is PASS, or each FAIL has a documented decision, may real-device testing be called complete.

## D. What the desktop rehearsal covers (not iOS)

`node integration/device/rehearse.js` (headless Chrome, throw-away profiles, 127.0.0.1) checks: D1 bundle differs only as intended, D2 guard host matrix,
D3 blocked page inert, D4 seed generator, D5 label/manifest, D6 service worker and cache name, D7 import through the real screen and persistence,
D8 interrupted-workout resume, D9 offline use and persistence, D10 export, wipe and re-import round trip, D11 Myo-Reps cluster record, D12 update from A to B with the draft preserved.
These prove the logic, not the iOS WebKit behaviours (storage separation between Safari and the installed app, share-sheet downloads, keyboard, lock-screen timers, storage eviction).
