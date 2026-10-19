# Windows: Tier 1 iPhone test (private Wi-Fi, plain HTTP)

**No iPhone test has been performed.** Nothing here claims a result. This file only tells you how to run the test yourself.

Tier 1 needs: Git (or a ZIP download), Node.js, your Wi-Fi, one command. It does **not** need Chrome, bash, a certificate, a tunnel, a cloud account or any change to your production app.

## 1. What you need (nothing is assumed to be installed)

| Needed | Why | How to check | If missing |
|---|---|---|---|
| Node.js 18 or newer (tested here with 22.14 on Linux; Windows not tested by me) | runs the build and the server | `node --version` | Install the LTS from https://nodejs.org/ and open a **new** terminal |
| Git for Windows (includes Git Bash) **or** a ZIP download of the branch | get the files | `git --version` | https://git-scm.com/download/win, or use the ZIP route in section 2 |
| Access to this GitHub repository | the repository is private | `git clone` asks you to sign in | sign in with your GitHub account in the browser prompt |
| iPhone and computer on the **same Wi-Fi** | the phone must reach the computer | both show the same network name | a guest network or router "client isolation" blocks this; use your main Wi-Fi |
| Windows network profile **Private** | Windows Firewall blocks inbound traffic on Public networks | Settings > Network & Internet > Wi-Fi > your network > Network profile type | choose Private |

Not needed for Tier 1: Chrome, Python, bash, mkcert, a tunnel, a Cursor account. `make_disposable_backup.js` and `rehearse.js` need Chrome and are for the developer machine only; the committed seed replaces them.

## 2. Exact branch and files

- Repository: `https://github.com/alexcook1298-commits/Fitness-for-Life`
- Branch: `cursor/phase4-iphone-evidence-qa-75d6` (draft PR #8). Use the commit hash given in the hand-off message; confirm with `git rev-parse HEAD`.
- Candidate app files that get tested (the test build is these, plus only a labelled guard, label, title, cache name and manifest name):

| File | SHA-256 |
|---|---|
| `integration/app/index.html` | `71c7cb8005f932b9f651f8bef4ae65a9d257dfd0b2f5227f455a622117032e60` |
| `integration/app/sw.js` | `a2a9a805665f516bb360a5fa39a4fe60ea2ad683548b84ea4d8df944f449d669` |
| `integration/device/seed/DISPOSABLE_TEST_BACKUP.json` | `931d63136766d77eac54b8f6b3b0f71ef6febffe8529b0f76bc4c71750d3ef7f` |

- Files the launcher needs: `integration/app/*`, `integration/device/lan_up.js`, `build_device_bundle.js`, `lan_test_server.js`, `seed_tools.js`, `seed/DISPOSABLE_TEST_BACKUP.json`. The launcher stops and lists anything missing.

If the hashes differ you probably have Windows line-ending conversion. Use the `-c core.autocrlf=false` option below. (The test still works with converted files, but then it is not byte-identical to what was reviewed.)

## 3. Copy-and-paste setup

### PowerShell (Git installed)

```powershell
cd $HOME
git -c core.autocrlf=false clone --branch cursor/phase4-iphone-evidence-qa-75d6 --single-branch https://github.com/alexcook1298-commits/Fitness-for-Life.git pa-device-test
cd pa-device-test
git rev-parse HEAD
node --version
Get-FileHash integration\app\index.html -Algorithm SHA256
Get-FileHash integration\app\sw.js -Algorithm SHA256
Get-FileHash integration\device\seed\DISPOSABLE_TEST_BACKUP.json -Algorithm SHA256
```

Compare the three hashes with the table. Optional safety self-check (11 checks, no network needed):

```powershell
node integration\device\verify_server_isolation.js
```

Start the server:

```powershell
node integration\device\lan_up.js --forbid YOUR-REAL-APP-HOST.example
```

Replace `YOUR-REAL-APP-HOST.example` with the host name of your real app (for example the part after `https://`). It is an extra block on top of the default, which already blocks every public host. Leave the option out if you prefer.

### Git Bash (Git installed)

```bash
cd ~
git -c core.autocrlf=false clone --branch cursor/phase4-iphone-evidence-qa-75d6 --single-branch https://github.com/alexcook1298-commits/Fitness-for-Life.git pa-device-test
cd pa-device-test
git rev-parse HEAD
node --version
sha256sum integration/app/index.html integration/app/sw.js integration/device/seed/DISPOSABLE_TEST_BACKUP.json
node integration/device/verify_server_isolation.js
node integration/device/lan_up.js --forbid YOUR-REAL-APP-HOST.example
```

Use `node integration/device/lan_up.js`, not `lan_up.sh`. (`lan_up.sh` is the older bash launcher for macOS/Linux; the Node launcher is the Windows-compatible one.)

### No Git: ZIP route

1. In a browser, open the repository, switch to the branch `cursor/phase4-iphone-evidence-qa-75d6`, choose Code > Download ZIP, and extract it.
2. Open PowerShell in the extracted folder (File Explorer > address bar > type `powershell` > Enter) and run the `node` commands above.

## 4. Starting the server and getting the iPhone URL

`lan_up.js` builds the two disposable builds (A and B) in `integration\device\dist\`, proves each differs from the candidate only by the labelled edits, writes the synthetic backup, and starts the server. It then prints a block like this (your address will differ):

```
TEST SERVER RUNNING
  URL for the iPhone:  http://192.168.1.23:8787/
  ...
  seed backup:         http://192.168.1.23:8787/DISPOSABLE_TEST_BACKUP.json (synthetic data only)
```

**The URL printed by your computer is the iPhone URL.** Type exactly that into Safari. Do not copy an address from this document.

- The server picks your Wi-Fi address and avoids virtual adapters (WSL, Hyper-V, VirtualBox, VPN). If it picks the wrong one, or the phone cannot connect, run `ipconfig`, find "Wireless LAN adapter Wi-Fi" > "IPv4 Address" (it starts with `192.168.`, `10.` or `172.16.` to `172.31.`), and run again with `--bind`:

```powershell
node integration\device\lan_up.js --bind 192.168.1.23
```

- First run: Windows Defender Firewall asks to allow Node.js. Tick **Private networks** only. Untick Public.
- If Safari cannot connect: confirm both devices are on the same Wi-Fi, the profile is Private, and the phone is not on mobile data or a VPN.
- Leave the terminal window open. Every request is printed there, which also shows which devices connected.
- The server stops by itself after 120 minutes (`--ttl 60` shortens it).

Tier 1 is plain `http://`. The red label will say `NOT-SECURE` and `sw off`. That is expected: iOS only allows service workers, offline mode, the update flow and true Home-Screen install over HTTPS. **Do not add the test to the Home Screen in Tier 1 and do not judge offline or update behaviour here.** Those are Tier 2 and are not part of this hand-off.

## 5. Why this cannot serve your production app or touch real workout data

Each statement below is a checked property; items marked (V#) are automated by `node integration\device\verify_server_isolation.js` (11 of 11 passed on Linux; run it yourself on Windows).

1. **It serves only the test bundle (V3, V5, V6).** The server refuses to start unless the folder contains `TEST_BUNDLE.json`; the repository root is refused. Traversal, encoded, backslash, drive-letter and hidden-file requests (22 variants) return only bundle files. The marker file itself is never served.
2. **It is read-only (V7).** POST, PUT, DELETE and PATCH return 405. Nothing can be uploaded or changed on your computer through it.
3. **It is private (V2, V3).** It binds to a private IPv4 address only and refuses a public address and `0.0.0.0`. Clients with public addresses get 403. No tunnel is started and none is needed.
4. **No cross-origin access (V9).** No CORS headers are sent, so a web page on another origin cannot read its files.
5. **No code path to production (V10).** The app contains no absolute http(s) address it fetches, loads or links to. The test build also has an origin guard: any host that is not localhost, a private address or a tunnel name shows a blocked page and runs no app code; `--forbid` always wins.
6. **Separate storage.** The phone's browser keeps data per origin (here `http://<your-ip>:8787`). Your production app lives on a different origin and its storage is invisible to this one, and vice versa. The test build also uses a different cache name and manifest id.
7. **Synthetic data only (V11).** The backup the test uses contains four keys of invented workouts. There is no real workout data on the computer side of this setup, and nothing in it is read from your real app.
8. **Nothing can be sent anywhere by the test.** The server has no write endpoint and the app has no external URL. The only data path is you tapping export/import on the phone.

Limits, stated plainly: the server has no password. That is acceptable because it holds only synthetic data and is reachable only from devices on your private network (anyone on your Wi-Fi who knows the address could open the test app). Windows behaviour has not been tested by me; the Linux checks above are the evidence.

**Rule for you:** never type your real app's address into the iPhone during this test, never use a real backup, never tap RESTORE on your real app.

## 6. Shut down and clean up

Computer:

```powershell
# in the server terminal: press Ctrl+C (or wait for the 120 minute timer, or close the window)
cd $HOME\pa-device-test
Remove-Item -Recurse -Force integration\device\dist      # builds A and B and the synthetic backup copy
```

- Deleting `dist` removes all disposable test files. The repository files are unchanged.
- To remove everything: `cd $HOME; Remove-Item -Recurse -Force pa-device-test`. (If you want the files for later, keep the folder.)
- Check it stopped: reload the URL on the phone; it should not connect.
- In Windows Defender Firewall > Allow an app, you can remove Node.js if you do not use it for anything else.

iPhone (remove only the test, never real data):

1. Safari: Settings > Apps > Safari > Advanced > Website Data (older iOS: Settings > Safari > Advanced > Website Data). Search for the test address (for example `192.168.1.23`). Swipe left on that entry only > Delete.
2. If you downloaded the synthetic backup: Files > Downloads > delete `DISPOSABLE_TEST_BACKUP.json` (and any export you made).
3. **Never use "Clear History and Website Data"**; it would also clear your real sites.
4. Tier 2 only (not part of this hand-off): remove any CA profile in Settings > General > VPN & Device Management.

## 7. First five iPhone acceptance checks, in order

Do them in this order. Record PASS or FAIL, plus what you see, for each. Stop and tell me at once if anything loses or changes data, or if the page ever shows a real workout.

**Check 1: Launch, label, empty state (S1, S2).**
Open the printed URL in Safari. Expect: a red bar `TEST A • DISPOSABLE • id xxxx • BROWSER • NOT-SECURE • sw off • online`, the app loads (not a "TEST BUILD BLOCKED" page), Home shows no workout history. Write down the `id` value.

**Check 2: Mobile layout (L1, L2, L3).**
Rotate to landscape and back; tap into a weight box when you start a workout (Train > Giant A), and scroll a long workout. Expect: layout does not break, the keyboard does not hide the box or the set button, the bottom navigation stays in place, and nothing important is hidden under the status bar or the red label.

**Check 3: Import the synthetic backup (B4, then G6).**
In Safari open `http://<your-ip>:8787/DISPOSABLE_TEST_BACKUP.json` (the second URL the server printed). Safari offers a download; choose Download. Then in the app: MORE > Data & Backup > Import full backup > choose the file from Files > Downloads. Expect the preview `Backup from <today>. 7 lifting records; 4 sessions.` Tap RESTORE THIS BACKUP. The app reloads. Expect: Home shows an "Unfinished workouts" card with **RESUME Giant A**. Refresh the page; it is still there.

**Check 4: Resume, skip and finish a partial workout (W5, C2, plus the Phase 4 draft/evidence behaviour).**
Tap RESUME Giant A. Under Bench Press (BB), set 1 is already logged at 97.5 x 8. Log the next set (the "Paused back-off 1" row): weight 85, reps 8, RIR 2, tap its circle. On the second exercise (Chest-Supported Row (DB)) tap SKIP THIS EXERCISE. Scroll to the bottom and tap FINISH. Expect the Finish panel line to read exactly (this was reproduced in desktop Chrome, not on a phone):

`Prescription partial: 2 of 16 sets logged. Not logged: Chest-Supported Row (DB) (skipped), Hack Squat (not reached), Seated Leg Curl (not reached), Lateral Raise (Cable) (not reached), Weighted Pull-Up (not reached), Farmer Carry (DB) (not reached). Partly logged: Bench Press (BB) (2 of 3).`

Confirm and save. Expect the workout saves, and the skipped exercise does not appear as logged work. Both Bench sets remain in history (the back-off set is kept; it is only excluded from top-set comparisons).

**Check 5: Giant B intensifier logging (X1, X2 and the Rest-Pause block).**
Train > Giant B. Because Check 4 finished a Giant A and the seed contains one earlier Giant B, the app should offer the next rotation group: **Lat Pulldown with Rest-Pause** and **Triceps Pressdown with Myo-Reps** as the two intensifiers; the other movements show "ROTATED OFF TODAY" or straight sets. On Lat Pulldown, under FINAL SET • Rest-Pause, enter Initial effort, Extra effort 1 and Extra effort 2 (for example 100 x 8 each), completing each effort with its circle, then tap SAVE FINAL BLOCK. Repeat for Triceps Pressdown Myo-Reps (Activation plus mini-sets, then SAVE FINAL BLOCK). Expect: each block saves as one entry that keeps its individual efforts (in the desktop test, a Rest-Pause block of 3 x 8 at 100 saved as one record of 24 reps with 3 stages); decimals such as 97.5 are accepted with a numeric keypad. If the app offers a different pair of movements, write down which ones; that is a finding.

Then continue with the rest of `PHASE4_IPHONE_ACCEPTANCE_GUIDE.md` (G3 onward), only if you want to. This hand-off stops here.

## 8. What I could not test

- Windows itself (Git for Windows, PowerShell, Windows Firewall, Node on Windows): tested on Linux with Node 22.14 only.
- Any iPhone behaviour: nothing was run on a phone.
- Anything needing HTTPS (offline, update, true Home-Screen install, storage sharing between Safari and the installed app): Tier 2, not covered here.
