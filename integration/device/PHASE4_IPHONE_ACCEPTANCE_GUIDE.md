# Phase 4: iPhone acceptance guide (private network first)

**Status: no iPhone test has been performed.** Nothing is running that your phone can reach. This guide is what you use to run the test; every result below is to be filled in by you on the phone.
Results already obtained are desktop-Chrome only and are labelled as such in `integration/PHASE4_REPORT.md`.

## 1. Why the test server has to run on your computer (not in the cloud)

The agent that prepared this runs in a cloud VM (address 172.30.0.2, not on your Wi-Fi). Your phone cannot reach it, and I did not open a tunnel to change that. So the server in this branch is started by **you, on your own computer**, with one command. Everything is private to your Wi-Fi.

| Question | Answer |
|---|---|
| Where does it run? | On your computer, bound to your computer's private Wi-Fi address only (e.g. `192.168.x.y`). It refuses to bind to a public address or `0.0.0.0`. |
| Is it publicly exposed? | No. It listens only on the private address, and it answers only clients with private, link-local or loopback addresses (anything else gets 403 and is logged). |
| What protects it? | (1) the private-network binding, (2) the client-address check, (3) it serves only a test bundle (a folder with `TEST_BUNDLE.json`), (4) the app's own origin guard (blocks any host not on the allow list; `--forbid` your real host), (5) it contains only synthetic data, (6) it logs every request so you can see which devices connected. There is no password because the content has no real data and is not reachable off your network. |
| How does it stop? | Automatically after `--ttl` minutes (default 120), on Ctrl+C, or when you close the terminal. Then delete the Home-Screen icon and Website Data (section K). |

### Why plain local HTTP is not enough for everything

iOS only runs a service worker, offline mode, Home-Screen "app" behaviour and the update flow on **HTTPS** (a secure context). `http://192.168.x.y:8787` is not one. So there are two private tiers:

| Tier | What it needs | What you can test | What you cannot test |
|---|---|---|---|
| **1. LAN over HTTP** (start here) | one command | Safari launch and layout, full workout, every intensifier, skip, interrupted recovery, completion text, history and budget, backup export/import, refresh/persistence, the storage-sharing probe in Safari | service worker, offline, update/cache, true standalone install (the label shows `NOT-SECURE`, `sw off`) |
| **2. LAN over HTTPS** (for offline, install, update) | `mkcert` on your computer, plus a CA profile on the phone that you remove afterwards | everything, including offline, Home-Screen install and the update test | nothing extra |
| 3. Public tunnel (e.g. cloudflared) | **your separate approval; not requested, not started** | same as tier 2 | would expose the test app at a public, unguessable URL with no login; shut down with Ctrl+C |

I recommend tier 1, then tier 2 on the same Wi-Fi. A tunnel should not be necessary.

**Tier 2 setup (once):**
```bash
brew install mkcert            # or: apt install mkcert / choco install mkcert
mkcert -install                # creates a local CA on THIS computer only
mkcert 192.168.x.y             # your Wi-Fi address; writes 192.168.x.y.pem and 192.168.x.y-key.pem
# send "$(mkcert -CAROOT)/rootCA.pem" to the iPhone (AirDrop), open it, then:
#   Settings > Profile Downloaded > Install
#   Settings > General > About > Certificate Trust Settings > enable full trust for the mkcert root
```
That root can vouch for any site on the phone, so **remove it afterwards**: Settings > General > VPN & Device Management > the mkcert profile > Remove Profile. The CA's private key never leaves your computer.

## 2. Start the environment (on your computer)

```bash
git fetch origin cursor/phase4-iphone-evidence-qa-75d6 && git checkout cursor/phase4-iphone-evidence-qa-75d6
# Tier 1 (HTTP):
integration/device/lan_up.sh --forbid YOUR-REAL-APP-HOST.example
# Tier 2 (HTTPS), after the mkcert step above:
integration/device/lan_up.sh --forbid YOUR-REAL-APP-HOST.example --https 192.168.x.y.pem 192.168.x.y-key.pem
```
`lan_up.sh` builds the two disposable builds (A and B), verifies each differs from the candidate only by the labelled guard/label/title/cache name/manifest name, generates the synthetic backup and starts the server. It **prints the exact URL** (for example `http://192.168.1.23:8787/`) and a second URL for the synthetic backup file. Use those, not a URL from this document. The computer and the phone must be on the same Wi-Fi (not a guest network that isolates devices).
Use `--bind <ip>` if the computer has several private addresses.

Safety rules (unchanged): never open your real app's address in this test, never use a real backup, never tap RESTORE on your real app. The test origin has its own storage, so it cannot see your real data. The red label at the top reads `TEST A • DISPOSABLE • id xxxx • BROWSER|HOME-SCREEN • https|NOT-SECURE • sw on|off • online|OFFLINE`.

## 3. How to report

After each group, reply with one line per item, for example: `G1: S1 PASS, L1 PASS, L2 FAIL (nav bar covers the Finish button), S2 PASS`. Include any screenshot of a failure. Anything that loses or changes data: stop and tell me immediately.

## 4. The checklist in groups (existing 41 items plus clearly marked Phase 4 additions)

Order follows your priorities. IDs match `DEVICE_TEST_PROCEDURE.md`; **(new)** items were added in this phase.

### G1. Safari launch and mobile layout (Tier 1)
| ID | Step | Expected |
|---|---|---|
| S1 | Open the printed URL in Safari | Red `TEST A • DISPOSABLE …` label; app loads; no blocked page |
| S2 | Look at Home | Empty history |
| L1 (new) | Rotate to landscape and back | Layout does not break; label still readable |
| L2 (new) | Tap into a weight box | Keyboard opens; the box and the set button stay visible |
| L3 (new) | Scroll a long workout | Bottom nav stays put; nothing important hidden under the status bar or the red label |
| L4 (new) | Settings > Display > Text Size larger | Text readable; no overlap that blocks buttons |

### G2. Storage sharing and Home-Screen install (storage probe works in both tiers)
| ID | Step | Expected |
|---|---|---|
| I1 | Safari: note the label's `id` (call it ID1) and mode `BROWSER`. Share > Add to Home Screen | Name proposed "PA TEST A" |
| I2 | Open from the Home Screen | Label says `HOME-SCREEN` (standalone); note its `id` (ID2) |
| ST1 (new) | Compare ID1 and ID2 | **Equal = shared storage; different = separate storage.** Record exactly what you see; do not assume |
| ST2 (new) | In Safari import the synthetic backup (G6 steps) so it has data; then open the Home-Screen app | Does the data appear? Record yes/no |
| ST3 (new) | In the Home-Screen app log one set; then look in Safari (pull to refresh) | Does it appear? Record yes/no |
| I3 | Check data in the installed app | Record what you see (see ST1/ST2) |
| I4 | In the installed app import the disposable backup | Same result as in Safari |
Over HTTP the Home-Screen entry may be a plain web clip (browser chrome visible); record whether the label says `HOME-SCREEN` or `BROWSER`.

### G3. Full workout selection, intensifiers, skip, completion (Tier 1)
First import the synthetic backup (G6, B4) so you start from known data, or start empty.
| ID | Step | Expected |
|---|---|---|
| X1 | Train > Giant B | Two intensifiers presented (e.g. Myo-Reps, DC Rest-Pause), the rest straight sets |
| X2 | Myo-Reps: enter efforts, SAVE FINAL BLOCK | Saves one cluster |
| X3 | DC Rest-Pause: all stages, save | Saves |
| X4 | Widowmaker (when it is presented; it appears in the third rotation group) | Single set saves |
| X7 | Enter a weight like 97.5 | Numeric keypad; decimal kept |
| (new) Other intensifiers | Wherever the app offers Rest-Pause, FST-7, Myo-Reps etc. as a final-set choice on an exercise (More > Methods lists them): log one of each you can reach | Each saves a block and shows its stages |
| W5 | Giant A: log the first exercise, tap SKIP on the second, tap FINISH | The Finish panel line reads like `Prescription partial: N of M sets logged. Not logged: <exercise> (skipped) …`, not "not marked" for the skipped one |
| C1 (new) | Finish a workout where you did everything | `Prescription full: M of M sets logged.` |
| C2 (new) | Finish after doing only one exercise | `Prescription partial`; other exercises "not reached" |
| X5 | Finish Giant B with the intensifiers performed, start another Giant B | Next rotation group offered |
| X6 | Giant B, straight sets only, finish; start another | Same group again, with a repeat note |

### G4. Interrupted workout recovery (Tier 1)
| ID | Step | Expected |
|---|---|---|
| W1 | Log 2 sets, swipe the app away | |
| W2 | Reopen; Home shows RESUME | Both sets present; can log set 3 |
| W3 | Lock the phone for 2 minutes mid-workout; unlock | Workout and rest timer intact |
| W4 | Switch apps for 5 minutes; return | Intact |
| R3 | Log a set, force-quit immediately | Set present on reopen |

### G5. History and Training Budget accuracy (Tier 1)
| ID | Step | Expected |
|---|---|---|
| R4 | More > Training Budget (after the synthetic backup or your test workouts) | Each bar has a "logged exposure" line: full/partial/none sessions; sets and checklist items shown separately; no combined number |
| H1 (new) | Compare the budget lines with what you actually did | A partial Giant A reads as partial, not as a full session |
| H2 (new) | Progress tab | Logged sets and sessions you entered appear; nothing you skipped appears |
| H3 (new) | Giant A bench press: log a top set (say 135 lb) then a lighter back-off (115 lb), finish, start Giant A again | The bench "NEXT • THIS METHOD" line starts with **135 lb** (the top set), not 115 lb |

### G6. Backup, export and import (Tier 1)
| ID | Step | Expected |
|---|---|---|
| B4 | Download the synthetic backup from the printed second URL (Safari saves it to Files), then More > Backup > Import > choose it > RESTORE THIS BACKUP | Accepted (it includes cardio text `easy <Z2> 30 min`, shown as plain text); page reloads; data appears |
| B1 | EXPORT FULL BACKUP; save to Files; rename it `TEST_...` | Share sheet / download works |
| B2 | Open the exported file in Files | Valid JSON, only disposable data |
| B3 | Remove the test site's data (section K), reopen, import your export | Same session counts; data identical |
| B5 | Import a corrupted copy | Refused with a clear message; data unchanged |
| B6 | DOWNLOAD PRE-RESTORE SNAPSHOT | A file downloads |

### G7. Offline (Tier 2 only; HTTPS)
| ID | Step | Expected |
|---|---|---|
| O1 | Installed app: wait for "Ready offline"; label shows `sw on` | |
| O2 | Airplane Mode; quit the app; reopen | Opens with your data; label shows `OFFLINE` |
| O3 | Start a workout, log two sets | Saved |
| O4 | Finish a workout | Finishes |
| O5 | Airplane Mode off; reopen | Data unchanged |

### G8. PWA update and cache (Tier 2 only; HTTPS)
| ID | Step | Expected |
|---|---|---|
| U1 | With A installed, start a workout and log one set | |
| U2 | In the server terminal type `swap integration/device/dist/B` + Enter | "now serving …B" |
| U3 | Phone: open/close the app once, wait up to a minute | Update prompt on Home only; label still `TEST A`; workout undisturbed |
| U4 | Home > Update | Reloads; label `TEST B` |
| U5 | Check data and the unfinished workout | All still present |
| U6 | Airplane Mode, relaunch | B works offline |

### G9. Refresh and persistence (Tier 1)
| ID | Step | Expected |
|---|---|---|
| R1 | Pull down to refresh | Data unchanged |
| R2 | If the test lasts days: reopen in Safari and the installed app | Data persists; note any eviction |

### K. Clean-up (always)
1. Remove the "PA TEST" Home-Screen icon. 2. Safari > Settings > Advanced > Website Data: remove the computer's address. 3. Ctrl+C the server (or let the TTL end). 4. Delete `TEST_*` and `DISPOSABLE_TEST_BACKUP.json` from Files. 5. If you used Tier 2: remove the mkcert profile (Settings > General > VPN & Device Management). 6. Look at your real app (do not change anything).

## 5. Result record

| Group | Items | Result (PASS/FAIL, notes) |
|---|---|---|
| G1 | S1 S2 L1-L4 | |
| G2 | I1 I2 ST1-ST3 I3 I4 | |
| G3 | X1-X7 intensifiers W5 C1 C2 | |
| G4 | W1-W4 R3 | |
| G5 | R4 H1-H3 | |
| G6 | B1-B6 | |
| G7 | O1-O5 | |
| G8 | U1-U6 | |
| G9 | R1 R2 | |
| Device / iOS version / tier used | | |
