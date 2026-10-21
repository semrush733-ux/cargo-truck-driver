# Cargo Truck Driver

A 2D side-view cargo delivery game built with HTML5 Canvas and vanilla JavaScript. No frameworks and no image files: the truck, the cranes, the warehouses and the scenery are all drawn in code.

**Level 1 (Tutorial)** is fully playable. You load 3 boxes with the depot crane, drive about 120 m to the Delivery Hub, stop inside the green zone, and the hub crane unloads the boxes. The game then shows the win screen with 3 stars. Levels 2 to 4 are locked placeholders marked "Coming soon".

---

## 1. Run it in a browser

Any static web server works. Pick one:

```bash
# Option A: Node
npx http-server www -p 8080 -c-1
# then open http://localhost:8080

# Option B: Python
cd www && python -m http.server 8080
```

On Windows you can also copy the `www` folder into your local server (XAMPP `htdocs`, Laragon `www`, LocalWP) and open it from there.

You can also double-click `www/index.html`, because the game works from `file://` too. The offline service worker only turns on when the game is served over http(s).

**One-file version:** `dist/cargo-truck-driver.html` contains everything in a single file. Upload it anywhere or open it directly. To rebuild it after you change the code, run `node tools/build-single.js`.

### Controls

| Action | Touch | Keyboard |
|---|---|---|
| Accelerate | **GAS** pedal (right) | → or D |
| Brake / stop | **BRAKE** pedal | ← or A, Space |
| Reverse | **REVERSE** button | ↓ or S |
| Load / Deliver | big centre button | E or Enter |
| Pause | ⏸ top-right | P or Esc |

Pedals work while you hold them and stop as soon as you let go. Multi-touch works, so you can hold brake and tap reverse at the same time.

---

## 2. Project structure

```
cargo-truck-driver/
├── www/                      ← the game (this is Capacitor's webDir)
│   ├── index.html            screens: menu, HUD, pause, win, settings
│   ├── css/style.css         all UI styling + responsive rules
│   ├── js/storage.js         progress + settings in localStorage
│   ├── js/audio.js           WebAudio sounds (engine, crane, chimes) — no sound files
│   ├── js/controls.js        touch pedals (pointer capture) + keyboard
│   ├── js/draw.js            canvas helpers, seeded RNG
│   ├── js/truck.js           truck physics + truck artwork
│   ├── js/cargo.js           cargo items, counting, bed physics, box artwork
│   ├── js/crane.js           pick-and-place crane (loading + unloading)
│   ├── js/world.js           sky, hills, props, warehouses, road, delivery zone
│   ├── js/effects.js         dust, exhaust, sparkles, confetti, floating text
│   ├── js/levels.js          level registry + config format (docs inside)
│   ├── js/level1.js          Level 1 config
│   ├── js/game.js            state machine, update loop, camera, rendering
│   ├── js/ui.js              DOM screens and buttons
│   ├── js/main.js            boot, single rAF loop, pause on background
│   ├── sw.js                 offline cache
│   ├── manifest.webmanifest
│   └── assets/icon-192.png, icon-512.png
├── dist/cargo-truck-driver.html   single-file build
├── tools/build-single.js
├── capacitor.config.json
└── package.json
```

### Game states

`MAIN_MENU → LOADING → READY_TO_DRIVE → DRIVING ⇄ ARRIVED → DELIVERING → LEVEL_COMPLETE`, plus `PAUSED`, which can be entered from any play state.

- The pedals are locked until all 3 boxes are loaded and strapped.
- DELIVER only becomes active when the whole truck is inside the green zone, it is nearly stopped and no pedal is held.
- The win screen fires once (it is guarded by a flag). Restart rebuilds every object from scratch.
- A box is counted through a `Set` of ids, so the same box is never counted twice.
- Pause freezes physics, the cranes, the timers and the particles. Moving the app to the background pauses it automatically, and the single rAF loop is guarded so it can never run twice.

### Level 1 is forgiving

The road is flat and has no obstacles. If you overshoot the zone, you just reverse back. If you hit the road-end barrier, the truck gently bounces back, the cargo shifts a little and you see a hint. You can never fail. The pause menu also has **Reset truck to start**.

---

## 3. Adding more levels later

1. Copy `www/js/level1.js` to `www/js/level2.js`, change `id: 2`, and adjust its config: cargo count and weight, truck stats, road `start`/`end`, `terrain` points (for hills), zone position, signs and stars mode.
2. Add `<script src="js/level2.js"></script>` after `level1.js` in `index.html`, and add the file to `FILES` in `sw.js`.
3. Remove `2` from the placeholder list at the bottom of `levels.js`.

Level 2 unlocks automatically once Level 1 is completed. The full config format is documented at the top of `levels.js`. The truck physics already follows `terrain` slopes, and `cargo.secured: false` lets boxes slide more for harder levels.

---

## 4. Android app (Capacitor)

What you need: Node 18 or newer, Android Studio with an SDK, and JDK 17.

```bash
cd cargo-truck-driver
npm install
npx cap add android
npx cap sync android
npx cap open android        # opens Android Studio
```

Then, in Android Studio:

1. **Lock landscape.** Open `android/app/src/main/AndroidManifest.xml` and add this to the `<activity>` tag:
   `android:screenOrientation="sensorLandscape"`
2. **Fullscreen (optional).** In `MainActivity.java`, after `super.onCreate(...)`, hide the system bars with `WindowInsetsControllerCompat`. The game already respects safe-area insets.
3. **App icon.** Right-click `res` → New → Image Asset, then pick `www/assets/icon-512.png`.
4. **Test build.** Use Build → Build APK(s). The APK ends up in `android/app/build/outputs/apk/debug/`.
5. **Play Store build.** Use Build → Generate Signed Bundle (AAB).

Each time you change the game code, run `npx cap sync android` again.

The `@capacitor/app` plugin is already wired up in `main.js`. The game pauses when the app goes to the background, and the Android back button pauses the game, closes the win screen, or exits from the menu.

### Fonts offline

The headings use *Lilita One* and *Nunito* from Google Fonts. Without internet they fall back to system fonts and everything still works. To bundle them inside the APK, download the `.woff2` files into `www/assets/fonts/`, replace the Google Fonts `<link>` in `index.html` with `@font-face` rules in `style.css`, and add the files to `sw.js`.

---

## 5. Test checklist (all verified)

- [x] All 3 boxes load. Each tap loads one box, and taps made while the crane is busy are queued.
- [x] Driving is locked until loading and strapping are complete.
- [x] The truck accelerates, brakes to a full stop, reverses, and coasts when you let go.
- [x] Cargo stays on the truck for the whole tutorial road.
- [x] The zone is detected, and DELIVER is only active inside the zone with the truck stopped.
- [x] The win screen appears once, after the 3rd box lands on the hub dock.
- [x] Restart returns everything to the starting state.
- [x] Progress (completed, 3 stars, best time) survives a reload.
- [x] Touch pedals and keyboard both work. Pause/resume, auto-pause on background, P and Esc keys all work.
- [x] No JavaScript errors in desktop, phone-landscape, phone-portrait or single-file runs.
