# Cargo Truck Driver

A cargo-delivery truck game in HTML5 + vanilla JavaScript, packaged for Android with Capacitor.

There are two ways to play, and both use the same save, cash, garage, missions and achievements:

- **2D campaign:** 50 side-view levels on a Canvas. It has drag-and-drop or worker loading, fuel, road surfaces, potholes, traffic, weather, and cargo that can fall off and be recovered.
- **3D mode:** real 3D built with Babylon.js 8.33.2, shipped inside the app with no internet needed. It has 6 levels:
  - a very easy tutorial;
  - a valley road;
  - a river bridge with rain and mud;
  - roadworks in the desert;
  - a high **mountain road** with drops and no rail in places, where the truck can fall off;
  - a snow pass with fog and ice.

The 3D mode also includes:
- the **engine-upgrade workshop** cinematic;
- the **premium electric truck** "Volt Ranger EV", with 3 free demo drives and a one-time Google Play unlock.

No ads or ad SDKs are included.

---

## 1. Run in a browser

```bash
cd www
python3 -m http.server 8080      # or: npx http-server www -p 8080 -c-1
# open http://localhost:8080
```

Open the page from a web server, not as a `file://` URL. The 3D scripts are loaded on demand.

**3D controls:**

| Action | Touch | Keyboard |
|---|---|---|
| Accelerate | GAS | W or ↑ |
| Brake | BRAKE | S, ↓ or Space |
| Reverse | R | R or X |
| Steer | ◀ / ▶ | A / D or ← / → |
| Load / Deliver / Recover | the big button | E or Enter |
| Camera (TPP / HIGH / FPP) | camera button | C |
| Pause | pause button | P or Esc |
| Horn | – | H |

**Gyro steering** is optional and is set in the Pause menu:
- an on/off switch;
- a sensitivity slider (6–30° for full lock);
- a CALIBRATE button that sets the current phone angle as "straight".

On iOS the game asks for permission. If the device has no gyro, or permission is denied, the game says so and the ◀ ▶ buttons keep working.

## 2. Files

| Folder / file | What it is |
|---|---|
| `www/index.html`, `css/style.css` | All screens: menu, HUDs, result popup, garage, missions, achievements, 3D level select |
| `www/js/storage.js` | Versioned save (schema 3) with per-field validation. It adds 3D progress, the truck choice and premium demo/ownership. Old saves load fine. |
| `www/js/rewards.js` | The only place that adds cash. Every grant is de-duplicated by a key, so one delivery can never pay twice. |
| `www/js/progress.js` | Daily missions (the same 3 per date) and 13 achievements |
| `www/js/garage.js` | Upgrades, paint, wheels and accessories. Also holds the engine-level table `ENGINE_LEVELS` and the 3D truck physics `truckConfig3d()`. |
| `www/js/game.js`, `ui.js`, `world.js`, `truck.js`, `cargo.js`, `workers.js`, `traffic.js`, `levels.js` | The 2D game |
| `www/js/load3d.js` | Loads `vendor/babylon.js` and `js3d/*` the first time a 3D feature opens, with a loading screen |
| `www/js/store.js` | Google Play Billing (cordova-plugin-purchase, which wraps the official Play Billing Library). In a desktop browser it shows a labelled DEVELOPMENT MOCK instead. |
| `www/js/premium.js` | Premium truck cards, demo-drive counting, showroom and purchase screen |
| `www/js3d/levels3d.js` | 3D level **data**: road segments with turn, rise, cliff, rail and type (mud / ice / rough / bridge / narrow), plus obstacles, weather, cargo and par time |
| `www/js3d/kit.js` | Material cache, primitives and procedural textures (no image or model files) |
| `www/js3d/trucks3d.js` | Original low-poly trucks built in code: Classic Hauler and Volt Ranger EV |
| `www/js3d/road3d.js` | Road, terrain, cliffs, guard rails, bridges, signs, trees, warehouses, delivery bay, rain and fog |
| `www/js3d/drive3d.js` | Truck controller: steering, weight-dependent acceleration and braking, slopes, surfaces, sprung body, soft road edges, falling off unrailed drops |
| `www/js3d/cargo3d.js` | 3D boxes, drag-and-drop, forklift loading and unloading, cargo inertia, damage, fall-off and recovery |
| `www/js3d/game3d.js` | 3D level state machine, HUD, tutorial, camera, fuel, scoring, rewards, pause, restart |
| `www/js3d/mode3d.js` | One Babylon engine for the whole app, driven by the single main loop. Handles resize, quality settings and WebGL context loss. |
| `www/js3d/workshop3d.js` | Engine-upgrade workshop cinematic (a 7-state machine) |
| `www/js3d/showroom3d.js` | Rotating 3D showroom for the premium truck |
| `www/vendor/babylon.js` | Babylon.js 8.33.2 (Apache-2.0), fetched from npm by `.github/workflows/fetch-vendor.yml` |

The **3D models are original and built from code**, so there are no missing model or texture files. They are deliberately simple low-poly models.

To use licensed GLB models later:
1. Put them in `www/models/`.
2. Add `vendor/babylonjs.loaders.min.js`.
3. Replace the builder in `trucks3d.js` with `BABYLON.SceneLoader.ImportMeshAsync`. Keep the same API: `root`, `body`, `wheels`, `slots`, `bed`, `cabCam`.

## 3. How things work

**3D Level 1 tutorial:** the truck parks at the depot. Three boxes sit on pallets beside it. You can either:
- drag a box onto the bed (it snaps into a free slot; a wrong drop flies back with a message), or
- tap **LOAD** and the forklift loads the rest, with a timer.

Driving stays locked until 3/3 are loaded. Then:
1. Drive the short flat road.
2. Stop in the green bay under "DELIVER HERE".
3. Tap **DELIVER**. The forklift unloads, then the result screen shows the outcome.

Level 1 cannot break cargo and has no drops.

**Mountain roads:** segments marked `cliff` have a steep drop on one side.
- With `rail: true`, a guard rail holds the truck.
- Without a rail, red-white posts mark the edge. If the outer wheels go over, the truck tips and falls.
- After a fall, the truck is put back at the last safe spot. The cargo takes a knock but stays on.
- Three falls fail the level. The same applies whether you steer with the buttons or with gyro.

**Cargo physics:**
- Each load is sprung to the bed. It shifts with braking, acceleration and steering; light loads shift more, and Cargo-strap upgrades hold them tighter.
- Bumps make loads hop. Hard hits damage them according to their sensitivity: glass > fridge > box > steel.
- Big hits can throw a load off the truck. You can **RECOVER** it when you stop next to it.

**Rewards:** each delivery grants cash once (key `l3d:<level>:<attempt>`). Missions and achievements are keyed and saved, so they can only be claimed once.

**Engine upgrade:** in the garage, ENGINE shows a confirm screen with:
- the price, your cash, and the benefit (+% acceleration, top speed and hill power).

On confirm, the cash is taken **once** and the new level is **saved before** the cinematic starts. Repeated taps are ignored. If the app is interrupted, nothing is lost or doubled.

The workshop runs `PURCHASE_CONFIRMED → WORKSHOP_ENTERING → SHUTTER_CLOSING → ENGINE_UPGRADING (3–5 s) → SHUTTER_OPENING → TRUCK_EXITING → UPGRADE_COMPLETE`. Your own truck (model, paint, wheels and accessories) drives in. The shutter closes, steam, sparks and flashes play, then the same truck drives out. It ends with a before/after stats card. A SKIP button is available.

The engine values are in `CT.Garage.ENGINE_LEVELS`. They change the real 3D driving (`truckConfig3d`); the 2D game already scales with the engine level.

**Premium truck:**
- **Demos:** TRY FREE starts a normal 3D delivery with the Volt Ranger.
  - A demo is counted only when the truck **starts driving**, once per attempt id.
  - Opening the garage or showroom, or restarting during loading, costs nothing.
  - The count lives in the save and survives a progress reset, so a reset does not give free demos.
- **Purchase screen:** after demo 3 the purchase screen opens. It shows:
  - the **price returned by Google Play**;
  - "One-time purchase · not a subscription";
  - UNLOCK TRUCK, NOT NOW and RESTORE PURCHASES.
- **Ownership:** set only from Google Play's `approved → verified → finished` events. The purchase is acknowledged by `finish()`, and ownership is re-checked on every start.
- **Browser mock:** in a browser the mock is clearly labelled and **never** counts inside the Android app.

## 4. Android (Capacitor) and Google Play

The GitHub Actions workflow `.github/workflows/build-apk.yml` builds and signs `CargoTruckDriver.apk` and `.aab` on every push. It publishes them under Releases (`v1.<run>`). Each build has a higher `versionCode`, so it installs as an update.

To build locally (JDK 17, Android SDK):
```bash
npm install                 # Capacitor 6 + @capacitor/app + cordova-plugin-purchase
npx cap add android
python3 android-overrides/patch_android.py
npx cap sync android
cd android && ./gradlew assembleRelease bundleRelease
```

**Google Play Console setup for the premium truck (you must do this once):**
1. Upload the `.aab` to an Internal testing track. Billing only works for apps installed from Play.
2. Go to Monetize → Products → In-app products, and create a product with the ID **`premium_electric_truck_unlock`**:
   - set the price to about US$0.99 (Play converts it to local prices);
   - activate it.
3. Go to Setup → License testing and add your Gmail as a licence tester. Test purchases are then free.
4. Install from the testing link, then:
   - play 3 demos;
   - press UNLOCK TRUCK and complete the Play sheet;
   - check that "PURCHASE SUCCESSFUL" appears.
5. Reinstall and press RESTORE PURCHASES. The truck should come back.
6. Also try: cancelling the sheet, a declined card, and "slow test card" (which gives a pending purchase).

The billing plugin adds the `com.android.vending.BILLING` permission.

## 5. Verified in this build

The checks below were run in headless Chromium (software WebGL):
- **2D:** all 50 levels pass the autopilot with the base truck.
- **3D:** all 6 levels pass the autopilot, including the mountain and snow levels.
- **3D loading:**
  - a real mouse drag puts a box on the bed;
  - a wrong drop returns the box;
  - LOAD runs the forklift;
  - driving stays locked until 3/3.
- **3D driving:**
  - falling off a drop → respawn, and the fall is counted;
  - the gyro tilt is mapped to steering;
  - pause freezes the game;
  - resume, restart (a new attempt with one scene), and quitting to the menu all work, and the scenes are disposed.
- **Rewards and saves:**
  - delivery cash is granted once;
  - a duplicate or negative grant is refused;
  - a corrupt save is repaired field by field.
- **Workshop:**
  - all 7 states run once and in order;
  - a triple tap charges once;
  - with too little cash, a clear message appears and no show starts;
  - the engine level is saved and stays after a reload;
  - `truckConfig3d` speed and acceleration rise.
- **Premium truck:**
  - opening the showroom or garage costs no demo;
  - demos count 1/2/3 when driving starts, and the same attempt is never counted twice;
  - a 4th demo is refused;
  - mock cancel and fail leave the truck locked;
  - mock success unlocks, survives a reload, and is ignored inside the native app.
- Small screen (640×360) layout checked.

## 6. Not finished / limitations

- **Not yet tested on a real Android phone.** The 3D loop works in a desktop browser; the APK's 3D performance and the Play purchase still have to be checked on a device.
- **Google Play Billing:**
  - It needs the Play Console product above and a Play-installed build.
  - Without it the truck stays locked and the screen says the store is unavailable.
  - Purchases are verified on the device by the Play Billing library; there is no own receipt-validation server. Add a server validator for stronger anti-fraud.
- The 3D trucks, forklift and buildings are simple low-poly placeholder models, not high-detail licensed assets.
- The 3D mode has 6 levels and **no traffic yet**. The 2D campaign has the 50 levels with traffic.
- The premium truck drives only in the 3D mode. The 2D side view always uses the classic truck art. Paint is not applied to the steel Volt body.
- Gyro calibration and sensitivity were tested with simulated tilt events, not on a real device.
