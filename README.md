# BBFS 2D

A mobile-first, side-view flight sim. Fly an Airbus A320, a Boeing 727-200 or a Boeing 747-400 between real airports: take off, climb, cruise, descend and land on a 3° glideslope, by hand or on autopilot, in four kinds of weather by day, at dusk or at night.

**Play it:** https://demonking2324.github.io/bbfs-2d/ (works on phones; add it to the home screen to install).

## Run

Open `index.html` in a modern browser, or serve this folder with any static file server. There is no build step and nothing to install. On a phone, landscape gives the best view. The fullscreen button locks to landscape where the browser allows it.

### Install as an app

The game is a Progressive Web App: it can be installed to the home screen and played offline. Installing needs the files served over **HTTPS** (or `localhost`); opening `index.html` from disk runs the game but cannot install it.

- Test locally: `python3 -m http.server 8000` in this folder, then open `http://localhost:8000`.
- On a phone: host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages). Then on Android tap **INSTALL APP** on the start screen (or browser menu → Install). On iPhone use Share → **Add to Home Screen**.
- After changing any file, bump `VERSION` in `sw.js` so installed copies pick up the update.

While a flight is running the game asks the phone to keep the screen awake.

## Aircraft

Pick the aircraft on the start screen. Each has its own handling, speeds, flaps and limits; the flight guidance, autopilot, landing and takeoff reports all follow the selected type.

| | A320 | 727-200 | 747-400 |
| --- | --- | --- | --- |
| Reference weight | 62 t | 76 t | 280 t |
| Engines | 2 | 3 (tail-mounted) | 4 |
| Takeoff flaps / rotate (reference weight) | 1 / 145 kt | 15 / 145 kt | 10 / 158 kt |
| Landing flaps / approach | FULL / 138 kt | 40 / 140 kt | 30 / 150 kt |
| Flap detents | 0, 1, 2, 3, FULL | 0, 2, 5, 15, 25, 30, 40 | 0, 1, 5, 10, 20, 25, 30 |
| Tail strike (from the art) | 12.2° | 10.7° (rotate to about 8°) | 12.1° |
| Takeoff roll, typical load (tested) | ~1,100 m | ~1,150 m (1,700 m full at Munich) | ~1,500 m |

Rotate and approach speeds scale with the actual weight from the load sheet. Larger aircraft are drawn larger on screen, and parked aircraft at the gates are a mix of all three types. The 727 is thrust-limited and thirsty (roughly twice the A320's fuel burn), with a nose-low approach on flaps 40; with one engine out it climbs only a few hundred feet per minute.

## Load sheet: fuel and weight

Before each flight you choose passengers and fuel. The sheet shows takeoff and estimated landing weight against the aircraft's limits (MTOW, MLW), trip fuel, reserve, and the resulting VR and approach speed. **AUTO FUEL** loads trip + 15% + reserve.

- Weight drives the physics: heavier means a longer takeoff roll, slower climb, and higher rotate, approach and minimum speeds (they scale with the square root of the weight).
- Fuel burns off in flight, per engine, more at high thrust and low altitude. FUEL is shown under N1. **LOW FUEL** appears below about half the reserve; if the tanks run dry, all engines flame out and you glide.
- Landing above the maximum landing weight costs points.

| | A320 | 727-200 | 747-400 |
| --- | --- | --- | --- |
| Empty / max takeoff / max landing | 42.6 / 78 / 66 t | 46.7 / 95 / 72.6 t | 178.8 / 396.9 / 285.8 t |
| Max passengers / fuel | 180 / 18.7 t | 189 / 24.6 t | 416 / 170 t |
| Reserve | 1.2 t | 2 t | 6 t |

## Challenges

Ten scenarios with 1–3 stars each, saved in the browser. Open **CHALLENGES** on the start screen.

| Challenge | Aircraft · place | What happens |
| --- | --- | --- |
| Engine failure | A320 · EGLL 27R | An engine fails at 100 ft; climb to 1,500 ft |
| Heavy, one engine down | 747 · EHAM 24 at night | One of four engines fails at 100 ft |
| Trijet, two good engines | 727 · EDDM 26L | Full 727 at 1,500 ft elevation; the tail engine fails at 100 ft |
| Go around | A320 · EGGD 27 | A go-around is called at 200 ft; don't touch the runway |
| Too high, too fast | A320 · EGGD 27 | Start 750 ft high at 205 kt, flaps 1, gear up |
| Storm at night | A320 · EGGD 27 | Rain, gusts and darkness |
| Fog minimums | A320 · EGLL 27L | Runway visible only at the last moment |
| Into the valley | A320 · LOWI 26 at dusk | Mountain approach to a short, high runway |
| Heavy on a short runway | 747 · EGGD 27 | Stop with 500–700 m to spare |
| Butter the jumbo | 747 · EGPF 23 | Touch down under 100 ft/min |

## Routes

Pick the route on the start screen. Runway lengths and airport elevations are real; altitudes are shown above sea level, with radio altitude (RA) above the ground below 2,500 ft.

| Route | Runways | Distance | Cruise | Time at 1× |
| --- | --- | --- | --- | --- |
| Edinburgh → Glasgow | EGPH 24 → EGPF 23 | 58 km | 4,000 ft | ~13 min |
| Heathrow → Bristol | EGLL 27R → EGGD 27 | 150 km | FL100 | ~24 min |
| Heathrow → Manchester | EGLL 27L → EGCC 23R | 243 km | FL150 | ~35 min |
| Schiphol → Heathrow | EHAM 24 → EGLL 27L | 371 km | FL200 | ~50 min |
| Munich → Innsbruck | EDDM 26L → LOWI 26 | 125 km | FL120 | ~21 min |

Each route has a real terrain profile you can fly into:

- **Munich → Innsbruck**: Bavarian farmland, then the Alps. A 1,650 m ridge sits under the descent and the approach runs down the Inn valley between snow-capped peaks. The glideslope is intercepted 5,000 ft above the field.
- **Schiphol → Heathrow** crosses the North Sea (ships, open water; coming down there is a ditching) and finishes with the approach over London.
- **City skylines** at London, Manchester, Glasgow and Edinburgh, lit up at night; hills on the UK routes.
- A **TERRAIN · PULL UP** warning (with voice) sounds when the flight path is closing on rising ground within 20 seconds.

Time speed-up (2×, 4×, 8×) is available above 2,500 ft.

## Modes

- **Full flight**: the selected route from runway to runway.
- **Takeoff practice**: lined up at the departure airport. The run ends climbing through 1,500 ft and gives a takeoff report: rotation and liftoff speed, maximum pitch on the runway against the 12.2° tail-strike limit, gear-up height, runway used and climb rate.
- **Landing practice**: starts 9 km out on the arrival airport's glideslope, trimmed at 140 kt with flaps FULL and gear down, approach mode armed. Fly the glideslope, flare and stop for a landing report.

Each mode keeps its own best score. Restart the current mode or return to the main menu from the pause menu or the result screen.

## Weather and time of day

| Weather | What changes |
| --- | --- |
| Clear | Few clouds, light wind |
| Cloudy | Scattered clouds, moderate wind |
| Storm | Heavy dark cloud, rain, strong gusty wind and turbulence |
| Fog | A fog layer about 600 ft deep: you see its top from above, descend into it and break out near the ground |

**Day**, **dusk** or **night**. At dusk and night the runway edge, centreline, approach and PAPI lights glow, towns light up, and the aircraft shows navigation, beacon, strobe, logo, landing and cabin-window lights.

## Autopilot and autothrust

Tap **AP** in the top bar to open the autopilot panel.

- **SPD, ALT, V/S**: hold − or + to set the target speed, the target altitude and the climb or descent rate.
- **AP**: climbs or descends at the selected V/S to the selected altitude and levels off (FMA shows V/S, ALT* while capturing, then ALT). It won't trade the last knots of speed for altitude.
- **A/THR**: holds the selected speed, kept between the lowest safe speed (VLS) and the flap/gear limits. It pulls to idle ("RETARD") at 30 ft on landing.
- **APPR**: arms the glideslope. The autopilot captures it and flies it down to 100 ft, then disconnects with a triple chime so you flare by hand.
- Moving the stick disconnects the autopilot; moving the throttle disconnects autothrust, like the real aircraft.

The active modes stay visible above the objective line when the panel is closed.

## Landing replay

After a landing, takeoff or crash, tap **▶ REPLAY** on the result screen. It plays the moments around touchdown (or impact) again with the instruments live: pause, restart, play at 1×, ½× or ¼×, and switch between follow, tower and close-up cameras. **REPORT** goes back to the result.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Pitch | Drag on the left PITCH pad (up = nose up; invert and sensitivity in the pause menu) | W / S |
| Throttle | Drag the right THR lever (detents: IDLE, CL, TOGA) | ↑ / ↓ |
| Flaps | FLAPS ▼ / ▲ | F / R |
| Landing gear | GEAR | G |
| Speedbrake | SPD BRK | Z |
| Wheel brakes | Hold BRAKES (autobrake works at idle on the ground) | B |
| Autopilot panel / AP / A/THR / APPR | AP button, then the panel | P / A / Q / L |
| Time speed-up | 1× button, above 2,500 ft only | T |
| Pause / sound | Pause and speaker buttons | Space / M |

On phones that support it, buttons, throttle detents, touchdowns and autopilot disconnects give a short vibration. Stick sensitivity (gentle, normal, sharp) is in the pause menu.

## How the flight works

- **Fly-by-wire pitch.** The stick commands pitch rate. When you let go, the aircraft holds its current flight path. Below 50 ft it holds pitch attitude instead, so you flare by hand. Alpha protection and alpha floor (automatic TOGA thrust near the stall) work like on the real A320.
- **Physics.** Lift, drag, thrust and weight come from real A320 figures: wing area, thrust, flap lift and drag, gear drag, spoilers, ground effect, air density, headwind and turbulence. On the ground the aircraft pivots on its main wheels, and the tail strikes at 12.2°, measured from the sprite.
- **Navigation aids.** The objective line tells you the next step. The PROFILE panel shows the planned climb, top of descent (T/D), the level-off 3,000 ft above the arrival airport, the glideslope and the headwind. On approach, a G/S indicator and PAPI lights appear.
- **Landing report.** Graded on sink rate, touchdown point, speed, pitch, bounces and penalties (tail strike, nose wheel first, overspeed). Your best score is saved in the browser.
- **Crashes.** Gear-up landing, hard impact (more than 1,100 ft/min), off-runway touchdown, runway excursion and hard tail strikes all end the flight.

The aircraft numbers are simplified for a game. This is not a training tool.

## Aircraft art

To add another type, add its sprites and an entry in `AIRCRAFT` in `game.js` (pixel landmarks plus performance numbers), and list the sprites in `sw.js`.

Sprites live in `assets/aircraft/<type>/`. Each aircraft needs two PNGs with transparent backgrounds, one gear-up and one gear-down. Both must have the same canvas size and be aligned at the top, so toggling the gear doesn't shift the plane. Draw the art nose-left (side profile); the game mirrors it to fly right. The original sheet is kept in `source/`.

The `aircraft` object in `game.js` holds the sprite's pixel landmarks: main-wheel contact, nose wheel, tail bumper, engine nozzle, wingtip, cabin windows and light positions. Physics and rendering both use them, so the ground contact, tail-strike angle and night lighting match the drawing. App icons in `icons/` are generated from the sprite.

## Testing

`window.BBFS` exposes the simulation (`sim`, `step`, `startFlight`, `applyRoute`, `startReplay`, and others) for console debugging and automated flight checks.
