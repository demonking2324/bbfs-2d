"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const game = $("#game");
  const canvas = $("#world");
  const ctx = canvas.getContext("2d");
  const vdCanvas = $("#vd");
  const vdCtx = vdCanvas.getContext("2d");

  // ---------- units & helpers ----------
  const G = 9.81;
  const RHO0 = 1.225;
  const KT = 1.943844; // m/s → kt
  const FT = 3.28084; // m → ft
  const FPM = 196.8504; // m/s → ft/min
  const DEG = Math.PI / 180;
  const PHYSICS_DT = 1 / 120;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (value, target, maxStep) => (value < target ? Math.min(target, value + maxStep) : Math.max(target, value - maxStep));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hash2 = (a, b) => hash(a * 157.31 + b * 13.77);
  const pad = (value, length) => String(Math.round(Math.abs(value))).padStart(length, "0");
  const signed = (value, length) => `${value < 0 ? "−" : "+"}${pad(value, length)}`;
  const km = (meters) => `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} KM`;
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const feet = (ft) => (Math.round(ft / 100) * 100).toLocaleString("en-US");
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* vibration unsupported */ } };

  // ---------- aircraft ----------
  // Source art faces left. Points are pixels on each type's shared gear-up/gear-down sprite canvas.
  // flapSchedule: [distance to touchdown in m, flap index wanted inside it] for the approach guidance.
  const AIRCRAFT = {
    a320: {
      id: "a320",
      name: "A320",
      sprites: { gearUp: "assets/aircraft/a320/a320-gear-up.png", gearDown: "assets/aircraft/a320/a320-gear-down.png" },
      art: {
        width: 567, height: 181, mainWheel: [269, 178.5], noseWheel: 76, tailBumper: [475, 134], nozzles: [[246, 157]],
        beacon: [252, 88], bellyBeacon: [300, 154], tailStrobe: [565, 104], wingtip: [347, 105], landingLight: [84, 163],
        windows: [{ y: 111, from: 91, to: 419, step: 8.13, r: 2.1 }], fin: [515, 48],
      },
      length: 37.57,
      span: 34.1,
      wingArea: 122.6,
      mass: 62000,
      maxThrust: 236000,
      idleThrust: 0.04,
      cl0: 0.2,
      clAlpha: 5.2,
      cd0: 0.023,
      inducedK: 0.045,
      gearCd: 0.018,
      spoilerCd: 0.07,
      spoilerLift: 0.55,
      rollMu: 0.016,
      brakeMu: 0.3,
      flaps: [
        { label: "0", cl: 0, cd: 0, clMax: 1.45, vfe: 350, speed: 250 },
        { label: "1", cl: 0.35, cd: 0.008, clMax: 1.95, vfe: 230, speed: 200 },
        { label: "2", cl: 0.6, cd: 0.02, clMax: 2.2, vfe: 200, speed: 180 },
        { label: "3", cl: 0.8, cd: 0.035, clMax: 2.4, vfe: 185, speed: 160 },
        { label: "FULL", cl: 1.0, cd: 0.05, clMax: 2.6, vfe: 177, speed: 138 },
      ],
      flapSchedule: [[30000, 1], [21000, 2], [15000, 3], [11000, 4]],
      takeoffFlap: 1,
      vmo: 350,
      vle: 280,
      vr: 145,
      vapp: 138,
      rotatePitch: 10,
      climbPitch: 12,
      // Weights in kg; fuel flow per engine in kg/s at idle and full thrust (sea level).
      engines: 2,
      oew: 42600,
      maxPax: 180,
      maxFuel: 18700,
      mtow: 78000,
      mlw: 66000,
      ffIdle: 0.11,
      ffMax: 1.25,
      burnPerKm: 6.5,
      climbFuel: 400,
      reserveFuel: 1200,
      gearTransit: 7,
      flapTransit: 3.5,
    },
    // Boeing 747-400; handling numbers are referenced to 280 t. Four engines, Boeing flap detents.
    b744: {
      id: "b744",
      name: "747-400",
      sprites: { gearUp: "assets/aircraft/b744/b744-gear-up.png", gearDown: "assets/aircraft/b744/b744-gear-down.png" },
      art: {
        width: 613, height: 167, mainWheel: [310, 165.5], noseWheel: 70, tailBumper: [517, 121], nozzles: [[262, 146], [337, 140]],
        beacon: [300, 88], bellyBeacon: [330, 150], tailStrobe: [611, 96], wingtip: [427, 100], landingLight: [82, 152],
        windows: [{ y: 113.5, from: 25, to: 476, step: 4.55, r: 1.3 }, { y: 91, from: 82, to: 185, step: 4.5, r: 1.3 }], fin: [565, 42],
      },
      length: 70.6,
      span: 64.4,
      wingArea: 525,
      mass: 280000,
      maxThrust: 870000,
      idleThrust: 0.035,
      cl0: 0.2,
      clAlpha: 5.0,
      cd0: 0.018,
      inducedK: 0.05,
      gearCd: 0.016,
      spoilerCd: 0.065,
      spoilerLift: 0.55,
      rollMu: 0.016,
      brakeMu: 0.3,
      flaps: [
        { label: "0", cl: 0, cd: 0, clMax: 1.5, vfe: 365, speed: 250 },
        { label: "1", cl: 0.15, cd: 0.004, clMax: 1.65, vfe: 280, speed: 230 },
        { label: "5", cl: 0.3, cd: 0.01, clMax: 1.8, vfe: 260, speed: 210 },
        { label: "10", cl: 0.45, cd: 0.016, clMax: 2.0, vfe: 240, speed: 190 },
        { label: "20", cl: 0.6, cd: 0.026, clMax: 2.15, vfe: 230, speed: 175 },
        { label: "25", cl: 0.75, cd: 0.038, clMax: 2.25, vfe: 205, speed: 160 },
        { label: "30", cl: 0.85, cd: 0.05, clMax: 2.35, vfe: 180, speed: 150 },
      ],
      flapSchedule: [[34000, 1], [30000, 2], [24000, 3], [18000, 4], [13000, 5], [10500, 6]],
      takeoffFlap: 3,
      vmo: 365,
      vle: 270,
      vr: 158,
      vapp: 150,
      rotatePitch: 10,
      climbPitch: 12,
      engines: 4,
      oew: 178800,
      maxPax: 416,
      maxFuel: 170000,
      mtow: 396900,
      mlw: 285800,
      ffIdle: 0.27,
      ffMax: 2.25,
      burnPerKm: 26,
      climbFuel: 1000,
      reserveFuel: 6000,
      gearTransit: 10,
      flapTransit: 3,
    },
  };
  // Boeing 727-200 Advanced: three tail engines, triple-slotted flaps, thrust-limited with a long takeoff roll.
  AIRCRAFT.b722 = {
    id: "b722",
    name: "727-200",
    sprites: { gearUp: "assets/aircraft/b722/b722-gear-up.png", gearDown: "assets/aircraft/b722/b722-gear-down.png" },
    art: {
      width: 617, height: 132, mainWheel: [315, 130.5], noseWheel: 62, tailBumper: [529, 90], nozzles: [[477, 80], [543, 80]],
      beacon: [300, 60], bellyBeacon: [250, 115], tailStrobe: [545, 79], wingtip: [413, 97], landingLight: [70, 120],
      windows: [{ y: 80.5, from: 82, to: 371, step: 6.62, r: 1.6 }], fin: [515, 50],
    },
    length: 46.7,
    span: 32.9,
    wingArea: 157.9,
    mass: 76000,
    maxThrust: 204000,
    idleThrust: 0.04,
    cl0: 0.2,
    clAlpha: 5.0,
    cd0: 0.02,
    inducedK: 0.058,
    gearCd: 0.018,
    spoilerCd: 0.07,
    spoilerLift: 0.55,
    rollMu: 0.016,
    brakeMu: 0.3,
    flaps: [
      { label: "0", cl: 0, cd: 0, clMax: 1.35, vfe: 390, speed: 250 },
      { label: "2", cl: 0.15, cd: 0.006, clMax: 1.55, vfe: 250, speed: 220 },
      { label: "5", cl: 0.3, cd: 0.012, clMax: 1.75, vfe: 230, speed: 200 },
      { label: "15", cl: 0.55, cd: 0.025, clMax: 2.2, vfe: 215, speed: 180 },
      { label: "25", cl: 0.75, cd: 0.04, clMax: 2.4, vfe: 200, speed: 165 },
      { label: "30", cl: 0.85, cd: 0.05, clMax: 2.5, vfe: 185, speed: 150 },
      { label: "40", cl: 1.0, cd: 0.07, clMax: 2.66, vfe: 162, speed: 140 },
    ],
    flapSchedule: [[32000, 1], [28000, 2], [22000, 3], [17000, 4], [13000, 5], [10500, 6]],
    takeoffFlap: 3,
    vmo: 390,
    vle: 270,
    vr: 145,
    vapp: 140,
    rotatePitch: 8,
    climbPitch: 12,
    engines: 3,
    oew: 46700,
    maxPax: 189,
    maxFuel: 24600,
    mtow: 95000,
    mlw: 72600,
    ffIdle: 0.12,
    ffMax: 1.1,
    burnPerKm: 12.5,
    climbFuel: 500,
    reserveFuel: 2000,
    gearTransit: 9,
    flapTransit: 3,
  };
  // Boeing 737-300: short-haul twin with CFM56-3 engines slung close under the wing; handling numbers are referenced to 52 t.
  AIRCRAFT.b733 = {
    id: "b733",
    name: "737-300",
    sprites: { gearUp: "assets/aircraft/b733/b733-gear-up.png", gearDown: "assets/aircraft/b733/b733-gear-down.png" },
    art: {
      width: 511, height: 177, mainWheel: [245.5, 174.5], noseWheel: 58.5, tailBumper: [386, 146.5], nozzles: [[214, 151]],
      beacon: [184, 95], bellyBeacon: [285, 156], tailStrobe: [484, 112], wingtip: [328, 116], landingLight: [58, 156],
      windows: [{ y: 117, from: 89, to: 346, step: 7.34, r: 1.9 }], fin: [455, 50],
    },
    length: 33.4,
    span: 28.9,
    wingArea: 105.4,
    mass: 52000,
    maxThrust: 178000,
    idleThrust: 0.04,
    cl0: 0.2,
    clAlpha: 5.0,
    cd0: 0.024,
    inducedK: 0.052,
    gearCd: 0.018,
    spoilerCd: 0.07,
    spoilerLift: 0.55,
    rollMu: 0.016,
    brakeMu: 0.3,
    flaps: [
      { label: "0", cl: 0, cd: 0, clMax: 1.45, vfe: 340, speed: 250 },
      { label: "1", cl: 0.15, cd: 0.004, clMax: 1.8, vfe: 230, speed: 210 },
      { label: "5", cl: 0.3, cd: 0.01, clMax: 2.05, vfe: 225, speed: 190 },
      { label: "10", cl: 0.45, cd: 0.016, clMax: 2.15, vfe: 210, speed: 175 },
      { label: "15", cl: 0.6, cd: 0.026, clMax: 2.3, vfe: 195, speed: 160 },
      { label: "25", cl: 0.82, cd: 0.042, clMax: 2.5, vfe: 190, speed: 150 },
      { label: "30", cl: 1.0, cd: 0.058, clMax: 2.65, vfe: 185, speed: 140 },
    ],
    flapSchedule: [[30000, 1], [26000, 2], [21000, 3], [16000, 4], [12500, 5], [10500, 6]],
    takeoffFlap: 2,
    vmo: 340,
    vle: 270,
    vr: 140,
    vapp: 135,
    rotatePitch: 9,
    climbPitch: 12,
    engines: 2,
    oew: 32700,
    maxPax: 149,
    maxFuel: 16200,
    mtow: 62800,
    mlw: 51700,
    ffIdle: 0.1,
    ffMax: 1.05,
    burnPerKm: 6.8,
    climbFuel: 380,
    reserveFuel: 1100,
    gearTransit: 7,
    flapTransit: 3,
  };
  // Airbus A340-300: long-haul quad on four modest CFM56-5Cs, so heavy takeoffs are long; referenced to 200 t.
  AIRCRAFT.a343 = {
    id: "a343",
    name: "A340-300",
    sprites: { gearUp: "assets/aircraft/a343/a343-gear-up.png", gearDown: "assets/aircraft/a343/a343-gear-down.png" },
    art: {
      width: 613, height: 157, mainWheel: [303, 154.5], noseWheel: 64.5, tailBumper: [468, 127.5], nozzles: [[272, 130], [335, 125]],
      beacon: [258, 80], bellyBeacon: [360, 134], tailStrobe: [610, 88], wingtip: [405, 84], landingLight: [64, 140],
      windows: [{ y: 98, from: 72.5, to: 473, step: 5, r: 1.3 }], fin: [575, 40],
    },
    length: 63.7,
    span: 60.3,
    wingArea: 361.6,
    mass: 200000,
    maxThrust: 604000,
    idleThrust: 0.035,
    cl0: 0.2,
    clAlpha: 5.2,
    cd0: 0.019,
    inducedK: 0.042,
    gearCd: 0.016,
    spoilerCd: 0.065,
    spoilerLift: 0.55,
    rollMu: 0.016,
    brakeMu: 0.3,
    flaps: [
      { label: "0", cl: 0, cd: 0, clMax: 1.45, vfe: 330, speed: 250 },
      { label: "1", cl: 0.35, cd: 0.008, clMax: 1.95, vfe: 240, speed: 210 },
      { label: "2", cl: 0.6, cd: 0.02, clMax: 2.2, vfe: 196, speed: 185 },
      { label: "3", cl: 0.8, cd: 0.035, clMax: 2.4, vfe: 186, speed: 165 },
      { label: "FULL", cl: 1.05, cd: 0.05, clMax: 2.65, vfe: 180, speed: 145 },
    ],
    flapSchedule: [[32000, 1], [23000, 2], [16000, 3], [11500, 4]],
    takeoffFlap: 2,
    vmo: 330,
    vle: 250,
    vr: 150,
    vapp: 142,
    rotatePitch: 8,
    climbPitch: 11,
    engines: 4,
    oew: 129800,
    maxPax: 295,
    maxFuel: 111000,
    mtow: 276500,
    mlw: 192000,
    ffIdle: 0.12,
    ffMax: 1.05,
    burnPerKm: 15,
    climbFuel: 900,
    reserveFuel: 4500,
    gearTransit: 9,
    flapTransit: 3.5,
  };
  const REFERENCE_MPP = AIRCRAFT.a320.length / AIRCRAFT.a320.art.width; // light sizes are tuned for the A320 art
  for (const type of Object.values(AIRCRAFT)) {
    type.mpp = type.length / type.art.width;
    type.images = Object.fromEntries(Object.entries(type.sprites).map(([key, src]) => {
      const image = new Image();
      image.src = src;
      return [key, image];
    }));
  }
  let aircraft;
  let MPP;
  let MAIN_X;
  let MAIN_Y;
  let geo;
  let TAIL_STRIKE;
  let sprites;
  function applyAircraft(id) {
    aircraft = AIRCRAFT[id] || AIRCRAFT.a320;
    MPP = aircraft.mpp;
    [MAIN_X, MAIN_Y] = aircraft.art.mainWheel;
    const bodyPoint = (ax, ay) => ({ x: (MAIN_X - ax) * MPP, y: (MAIN_Y - ay) * MPP }); // meters from the main wheels, x forward
    geo = { nose: bodyPoint(aircraft.art.noseWheel, MAIN_Y), tail: bodyPoint(...aircraft.art.tailBumper) };
    TAIL_STRIKE = Math.atan2(geo.tail.y, -geo.tail.x);
    sprites = aircraft.images;
  }
  const lastFlap = () => aircraft.flaps.length - 1;
  // Speeds in the tables are for the reference mass; they scale with the square root of the actual weight.
  const PAX_MASS = 100; // kg per passenger with bags
  const speedScale = () => Math.sqrt((sim.mass || aircraft.mass) / aircraft.mass);
  const vrKt = () => Math.round(aircraft.vr * speedScale());
  const vappKt = () => Math.round(aircraft.vapp * speedScale());
  const flapSpeed = (index) => (index === 0 ? aircraft.flaps[0].speed : Math.min(aircraft.flaps[index].vfe - 5, Math.round(aircraft.flaps[index].speed * speedScale())));
  const tripFuel = (distance) => aircraft.climbFuel + aircraft.burnPerKm * distance / 1000;
  function defaultLoad(type = aircraft) {
    const pax = Math.round(type.maxPax * 0.82);
    const fuel = Math.round(((type.climbFuel + type.burnPerKm * route.distance / 1000) * 1.15 + type.reserveFuel) / 100) * 100;
    return { pax, fuel: Math.min(fuel, type.maxFuel, type.mtow - type.oew - pax * PAX_MASS) };
  }

  // ---------- airports & routes ----------
  // Real runway lengths and field elevations; route distances are threshold to threshold.
  const AIRPORTS = {
    EGLL: { name: "Heathrow", elevFt: 83, tower: 87 },
    EGGD: { name: "Bristol", elevFt: 622, tower: 36 },
    EGCC: { name: "Manchester", elevFt: 257, tower: 60 },
    EGPH: { name: "Edinburgh", elevFt: 136, tower: 57 },
    EGPF: { name: "Glasgow", elevFt: 26, tower: 35 },
    EHAM: { name: "Schiphol", elevFt: -11, tower: 101 },
    EDDM: { name: "Munich", elevFt: 1487, tower: 78 },
    LOWI: { name: "Innsbruck", elevFt: 1907, tower: 38 },
    LEBL: { name: "Barcelona", elevFt: 12, tower: 62 },
    LEPA: { name: "Palma", elevFt: 27, tower: 40 },
    LEMG: { name: "Málaga", elevFt: 53, tower: 38 },
    LXGB: { name: "Gibraltar", elevFt: 15, tower: 18 },
  };
  // terrain: [km from the departure threshold, ground elevation m, scenery theme, mountain factor 0–1].
  // The ground follows these points (smoothly) between the flat airport areas; themes pick the scenery.
  const ROUTES = [
    {
      from: ["EGPH", "24", 2556], to: ["EGPF", "23", 2665], distance: 58000, cruiseFt: 4000, decel: 7000,
      terrain: [[-16, 45, "city"], [-4, 41, "farm"], [12, 110, "hills", 0.25], [28, 210, "hills", 0.35], [44, 40, "city"], [55, 8, "farm"]],
    },
    {
      from: ["EGLL", "27R", 3902], to: ["EGGD", "27", 2011], distance: 150000, cruiseFt: 10000, decel: 14000,
      terrain: [[-30, 20, "city"], [-4, 25, "farm"], [40, 110, "farm"], [80, 230, "hills", 0.2], [112, 160, "farm"], [140, 170, "farm"]],
    },
    {
      from: ["EGLL", "27L", 3660], to: ["EGCC", "23R", 3048], distance: 243000, cruiseFt: 15000, decel: 14000,
      terrain: [[-30, 20, "city"], [-4, 25, "farm"], [120, 140, "farm"], [190, 330, "hills", 0.35], [212, 460, "hills", 0.45], [226, 110, "city"], [238, 78, "farm"]],
    },
    {
      from: ["EHAM", "24", 3500], to: ["EGLL", "27L", 3660], distance: 371000, cruiseFt: 20000, decel: 16000,
      terrain: [[-20, 0, "city"], [-3, -3, "farm"], [22, 0, "sea"], [206, 5, "farm"], [328, 35, "city"], [365, 25, "farm"]],
    },
    {
      from: ["EDDM", "26L", 4000], to: ["LOWI", "26", 2000], distance: 125000, cruiseFt: 12000, decel: 14000, interceptFt: 5000,
      terrain: [[-24, 520, "city"], [-4, 453, "farm"], [34, 600, "farm"], [52, 880, "hills", 0.35], [66, 1250, "alps", 1], [80, 1650, "alps", 1], [90, 1200, "alps", 1], [99, 720, "alps", 1], [110, 600, "alps", 1], [119, 585, "alps", 1]],
    },
    {
      from: ["LEBL", "07L", 3552], to: ["LEPA", "24L", 3000], distance: 203000, cruiseFt: 15000, decel: 14000,
      terrain: [[-18, 30, "city"], [-3, 4, "farm"], [5, 0, "sea"], [160, 30, "farm"], [174, 260, "hills", 0.3], [188, 110, "farm"], [198, 35, "city"]],
    },
    // Gibraltar's runway crosses the isthmus with water at both ends; Algeciras' hills lie across the bay.
    {
      from: ["LEMG", "13", 3200], to: ["LXGB", "27", 1829], distance: 100000, cruiseFt: 7000, decel: 9000,
      terrain: [[-16, 40, "city"], [-3, 15, "farm"], [4, 0, "sea"], [104.5, 30, "hills", 0.5]],
    },
  ];
  const START_X = 70;
  const TAN_GS = Math.tan(3 * DEG);
  let route;
  let runways;
  let TOUCHDOWN_X;
  let INTERCEPT_X;
  let DESCENT_LENGTH;
  let TOD_X;
  let TOC_X;

  function applyRoute(index) {
    const def = ROUTES[index];
    const runway = ([code, designator, length], start) => {
      const airport = AIRPORTS[code];
      return { code, ...airport, runway: designator, length, start, end: start + length, zone: [start - 1100, start + length + 600], elev: airport.elevFt / FT };
    };
    route = { ...def, from: runway(def.from, 0), to: runway(def.to, def.distance), cruiseAlt: def.cruiseFt / FT, aim: 300 };
    route.interceptAlt = route.to.elev + (def.interceptFt || 3000) / FT;
    // Terrain control points in meters, anchored to the flat airport areas at both ends.
    const anchors = [[route.from.zone[0], route.from.elev], [route.from.zone[1], route.from.elev], [route.to.zone[0], route.to.elev], [route.to.zone[1], route.to.elev]];
    const points = (def.terrain || []).map(([xKm, elev, theme, mountains = 0]) => ({ x: xKm * 1000, elev, theme, mountains }))
      .filter((p) => !(p.x >= route.from.zone[0] && p.x <= route.from.zone[1]) && !(p.x >= route.to.zone[0] && p.x <= route.to.zone[1]));
    route.themes = points.slice().sort((a, b) => a.x - b.x);
    route.terrain = [...points, ...anchors.map(([x, elev]) => ({ x, elev, mountains: null }))].sort((a, b) => a.x - b.x);
    route.cruiseLabel = def.cruiseFt >= 10000 ? `FL${def.cruiseFt / 100}` : `${feet(def.cruiseFt)} FT`;
    runways = [route.from, route.to];
    TOUCHDOWN_X = route.to.start + route.aim;
    INTERCEPT_X = TOUCHDOWN_X - (route.interceptAlt - route.to.elev) / TAN_GS;
    DESCENT_LENGTH = Math.max(0, route.cruiseAlt - route.interceptAlt) / TAN_GS;
    TOD_X = INTERCEPT_X - def.decel - DESCENT_LENGTH;
    TOC_X = route.from.start + 1800 + (route.cruiseAlt - route.from.elev) / Math.tan(5 * DEG);
  }
  const runwayAt = (x) => runways.find((runway) => x >= runway.start && x <= runway.end) || null;
  const glidepathAlt = (x) => route.to.elev + Math.max(0, (TOUCHDOWN_X - x) * TAN_GS);
  function profileAlt(x) {
    if (x < TOD_X) return route.cruiseAlt;
    if (x < TOD_X + DESCENT_LENGTH) return route.cruiseAlt - (x - TOD_X) * TAN_GS;
    return Math.min(route.interceptAlt, glidepathAlt(x));
  }
  // Ground elevation under the track: flat at each airport, smooth between the route's terrain points.
  function groundAt(x) {
    for (const runway of runways) if (x >= runway.zone[0] && x <= runway.zone[1]) return runway.elev;
    const points = route.terrain;
    if (x <= points[0].x) return points[0].elev;
    const last = points[points.length - 1];
    if (x >= last.x) return last.elev;
    let i = 0;
    while (points[i + 1].x < x) i += 1;
    const a = points[i];
    const b = points[i + 1];
    const t = (x - a.x) / (b.x - a.x);
    return lerp(a.elev, b.elev, t * t * (3 - 2 * t));
  }
  // Scenery theme and how mountainous the side ridges are, from the route's terrain points.
  function themeAt(x) {
    let theme = "farm";
    for (const point of route.themes) {
      if (point.x > x) break;
      theme = point.theme;
    }
    return theme;
  }
  function mountainsAt(x) {
    const points = route.themes;
    if (!points.length) return 0;
    if (x <= points[0].x) return points[0].mountains;
    for (let i = 0; i < points.length - 1; i += 1) {
      if (x < points[i + 1].x) return lerp(points[i].mountains, points[i + 1].mountains, clamp((x - points[i].x) / (points[i + 1].x - points[i].x), 0, 1));
    }
    return points[points.length - 1].mountains;
  }
  const routeMinutes = () => Math.round(route.distance / 8400 + 6);

  // ---------- weather & time of day ----------
  const WEATHER = {
    clear: { label: "CLEAR", cloud: 0.45, wind: 3, gust: 0.6, gustX: 1, rain: 0, fog: 0, dark: 0, gray: 0 },
    cloudy: { label: "CLOUDY", cloud: 1, wind: 5, gust: 1, gustX: 1, rain: 0, fog: 0, dark: 0.06, gray: 0.12 },
    storm: { label: "STORM", cloud: 1.6, wind: 9, gust: 2.4, gustX: 2.6, rain: 1, fog: 0, dark: 0.32, gray: 0.62 },
    fog: { label: "FOG", cloud: 0.2, wind: 1.5, gust: 0.3, gustX: 0.5, rain: 0, fog: 1, dark: 0.12, gray: 0.5 },
  };
  const TIMES = {
    day: {
      label: "DAY", ambient: [1, 1, 1], skyTop: [84, 146, 206], skyHorizon: [206, 228, 236], highTop: [44, 98, 176], highHorizon: [186, 212, 232],
      haze: [192, 208, 206], fog: [214, 218, 220], sun: [0.8, 0.16, [255, 250, 228], 0.32], cloudTint: 0, shadow: 1, glow: 1, stars: 0,
    },
    dusk: {
      label: "DUSK", ambient: [0.82, 0.64, 0.56], skyTop: [52, 66, 124], skyHorizon: [248, 158, 92], highTop: [36, 46, 104], highHorizon: [232, 148, 98],
      haze: [196, 142, 118], fog: [176, 146, 138], sun: [0.86, 0.45, [255, 170, 92], 0.55], cloudTint: 0.35, shadow: 0.45, glow: 1.8, stars: 0.15,
    },
    night: {
      label: "NIGHT", ambient: [0.2, 0.24, 0.36], skyTop: [5, 9, 24], skyHorizon: [26, 38, 66], highTop: [3, 5, 16], highHorizon: [18, 28, 52],
      haze: [34, 44, 64], fog: [44, 52, 66], moon: [0.2, 0.18], cloudTint: 0, shadow: 0, glow: 3, stars: 1,
    },
  };
  const SENSITIVITY = {
    gentle: { label: "GENTLE", curve: 1.8, gain: 0.7 },
    normal: { label: "NORMAL", curve: 1.4, gain: 1 },
    sharp: { label: "SHARP", curve: 1.1, gain: 1 },
  };
  const FOG_TOP = 190; // meters above the ground

  const settings = { aircraft: "a320", route: 1, weather: "cloudy", time: "day", invert: false, sensitivity: "normal" };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem("bbfs2d.settings") || "{}"));
    if (localStorage.getItem("bbfs2d.invert") === "1") settings.invert = true;
  } catch { /* storage unavailable */ }
  if (!ROUTES[settings.route]) settings.route = 1;
  if (!WEATHER[settings.weather]) settings.weather = "cloudy";
  if (!TIMES[settings.time]) settings.time = "day";
  if (!SENSITIVITY[settings.sensitivity]) settings.sensitivity = "normal";
  if (!AIRCRAFT[settings.aircraft]) settings.aircraft = "a320";
  const saveSettings = () => { try { localStorage.setItem("bbfs2d.settings", JSON.stringify(settings)); } catch { /* storage unavailable */ } };
  const run = { weather: settings.weather, time: settings.time };
  const syncRun = () => Object.assign(run, { weather: settings.weather, time: settings.time });
  const weather = () => WEATHER[run.weather];
  applyRoute(settings.route);
  applyAircraft(settings.aircraft);

  // ---------- atmosphere ----------
  const density = (h) => RHO0 * Math.pow(1 - 2.25577e-5 * clamp(h, 0, 11000), 4.2559);
  const headwind = (agl) => weather().wind * (1 + Math.min(Math.max(agl, 0), 3500) / 1450);

  const CLOUD_LAYERS = [
    { d: 0.012, cell: 9000, size: [2500, 6000], alt: [800, 2600], alpha: 0.85, chance: 0.8 },
    { d: 0.035, cell: 3800, size: [900, 2400], alt: [700, 2800], alpha: 0.88, chance: 0.7 },
    { d: 0.14, cell: 1600, size: [260, 700], alt: [500, 3000], alpha: 0.9, chance: 0.6 },
    { d: 0.45, cell: 900, size: [90, 260], alt: [450, 3100], alpha: 0.86, chance: 0.5 },
    { d: 1, cell: 1100, size: [70, 200], alt: [450, 2900], alpha: 0.72, chance: 0.45, front: true },
  ];
  const cloudCache = new Map();
  function cloudAt(layerIndex, cell) {
    const key = layerIndex * 1e7 + cell;
    if (cloudCache.has(key)) return cloudCache.get(key);
    if (cloudCache.size > 800) cloudCache.clear();
    const layer = CLOUD_LAYERS[layerIndex];
    const seed = layerIndex * 31 + 7;
    let cloud = null;
    if (hash2(cell, seed) < Math.min(0.95, layer.chance * weather().cloud)) {
      const size = lerp(layer.size[0], layer.size[1], hash2(cell, seed + 1));
      const count = 5 + Math.floor(hash2(cell, seed + 2) * 4);
      const puffs = [];
      for (let i = 0; i < count; i += 1) {
        const t = i / (count - 1) - 0.5;
        const r = size * (0.16 + 0.14 * hash2(cell * 9 + i, seed + 3)) * (1 - Math.abs(t) * 0.9);
        puffs.push({ dx: t * size * 0.8 + (hash2(cell * 9 + i, seed + 4) - 0.5) * size * 0.08, dy: r * (0.3 + 0.4 * hash2(cell * 9 + i, seed + 5)), r });
      }
      cloud = { x: (cell + 0.15 + hash2(cell, seed + 6) * 0.7) * layer.cell, alt: lerp(layer.alt[0], layer.alt[1], hash2(cell, seed + 7)), size, puffs };
    }
    cloudCache.set(key, cloud);
    return cloud;
  }
  function insideCloud(x, y) {
    const layerIndex = CLOUD_LAYERS.length - 1;
    const layer = CLOUD_LAYERS[layerIndex];
    const cell = Math.floor(x / layer.cell);
    for (let c = cell - 1; c <= cell + 1; c += 1) {
      const cloud = cloudAt(layerIndex, c);
      if (cloud && Math.abs(x - cloud.x) < cloud.size * 0.42 && y > cloud.alt - cloud.size * 0.05 && y < cloud.alt + cloud.size * 0.22) return true;
    }
    return false;
  }
  function turbulence(x, msl, agl, t) {
    const w = weather();
    const inCloud = insideCloud(x, msl);
    const amp = (inCloud ? 1.6 : msl < 2600 ? 0.45 : 0.25) * w.gust * clamp(agl / 60, 0.25, 1);
    const vertical = Math.sin(x * 0.0031 + t * 0.37) * 0.55 + Math.sin(x * 0.0113 + t * 1.21 + 1.7) * 0.3 + Math.sin(x * 0.037 + t * 2.3 + 4.1) * 0.15;
    const horizontal = Math.sin(x * 0.0017 + t * 0.29 + 2.2) * 0.6 + Math.sin(x * 0.0071 + t * 0.83) * 0.25 + Math.sin(t * 1.9 + x * 0.019) * 0.15;
    return { x: horizontal * amp * 0.8 * w.gustX, y: vertical * amp, inCloud };
  }

  // ---------- aerodynamics ----------
  function flapConfig(position) {
    const index = Math.min(Math.floor(position), aircraft.flaps.length - 2);
    const t = position - index;
    const a = aircraft.flaps[index];
    const b = aircraft.flaps[index + 1];
    return { cl: lerp(a.cl, b.cl, t), cd: lerp(a.cd, b.cd, t), clMax: lerp(a.clMax, b.clMax, t) };
  }
  const stallAlpha = (flap) => (flap.clMax - aircraft.cl0 - flap.cl) / aircraft.clAlpha;
  function liftCoefficient(alpha, flap) {
    const stall = stallAlpha(flap);
    if (alpha <= stall) return Math.max(aircraft.cl0 + flap.cl + aircraft.clAlpha * alpha, -1.1);
    return Math.max(flap.clMax * 0.62, flap.clMax - (alpha - stall) * 3.2);
  }
  const currentVfe = () => aircraft.flaps[Math.ceil(sim.flapPos - 0.01)].vfe;
  // Lowest selectable speed: 1.23 × the 1 g stall speed for the current flap setting.
  const vlsKt = () => 1.23 * Math.sqrt((2 * (sim.mass || aircraft.mass) * G) / (RHO0 * aircraft.wingArea * flapConfig(sim.flapPos).clMax)) * KT;
  function speedLimits() {
    let max = aircraft.vmo - 10;
    if (sim.flapPos > 0.05) max = Math.min(max, currentVfe() - 5);
    if (sim.gearPos > 0.05) max = Math.min(max, aircraft.vle - 10);
    return [vlsKt() + 3, max];
  }

  // ---------- state ----------
  const sim = {};
  const input = { pitch: 0, touchPitch: 0, keyPitch: 0, keys: new Set() };
  const particles = [];
  const MODES = {
    flight: { kicker: "LANDING REPORT", restart: "RESTART FLIGHT" },
    takeoff: { kicker: "TAKEOFF PRACTICE", restart: "RESTART TAKEOFF" },
    landing: { kicker: "LANDING PRACTICE", restart: "RESTART APPROACH" },
  };
  const TAKEOFF_GOAL_FT = 1500;
  const FINAL_DISTANCE = 9000;
  let mode = "flight";
  let challenge = null;

  // ---------- challenges ----------
  // Fixed scenarios with 1–3 stars. Each sets the aircraft, route, conditions and load, plus optional events.
  const check = (label, ok) => ({ label, ok: !!ok });
  const landingStars = (r, two, three) => [check("Land and stop on the runway", r), check(`Landing score ${two}+`, r && r.score >= two), check(`Landing score ${three}+`, r && r.score >= three)];
  const CHALLENGES = [
    {
      id: "engine-out", title: "ENGINE FAILURE", aircraft: "a320", route: 1, weather: "cloudy", time: "day", mode: "takeoff",
      blurb: "Full A320 out of Heathrow. An engine fails at 100 ft: gear up, hold speed, climb to 1,500 ft.",
      load: (t) => ({ pax: t.maxPax, fuel: 9000 }), failAtFt: 100,
      stars: (r) => [check("Climb to 1,500 ft", r), check(`Never slower than VR − 5 (lowest ${Math.round(sim.minIasAfterFailure ?? 0)} kt)`, r && (sim.minIasAfterFailure ?? 0) >= sim.takeoffVr - 5), check("Takeoff score 80+", r && r.score >= 80)],
    },
    {
      id: "heavy-engine-out", title: "HEAVY, ONE ENGINE DOWN", aircraft: "b744", route: 3, weather: "cloudy", time: "night", mode: "takeoff",
      blurb: "Night departure from Schiphol in a heavy 747. One of four engines quits at 100 ft.",
      load: (t) => ({ pax: t.maxPax, fuel: 60000 }), failAtFt: 100,
      stars: (r) => [check("Climb to 1,500 ft", r), check(`Never slower than VR − 5 (lowest ${Math.round(sim.minIasAfterFailure ?? 0)} kt)`, r && (sim.minIasAfterFailure ?? 0) >= sim.takeoffVr - 5), check("Takeoff score 80+", r && r.score >= 80)],
    },
    {
      id: "go-around", title: "GO AROUND", aircraft: "a320", route: 1, weather: "cloudy", time: "day", mode: "landing", goAroundFt: 200,
      blurb: "Normal approach into Bristol, until the tower calls a go-around at 200 ft. Don't touch the runway.",
      stars: (r) => {
        const g = sim.goAround || {};
        return [
          check("Climb back to 1,500 ft without touching down", r && !g.touched),
          check(`Climbing within 5 s, never below 100 ft (lowest ${Math.round(g.minAgl ?? 0)} ft)`, r && !g.touched && g.climbDelay !== null && g.climbDelay <= 5 && g.minAgl >= 100),
          check("Gear up and one flap step up, no A.FLOOR", r && !g.touched && !sim.gearDown && sim.flapIndex < lastFlap() && !sim.sawAlphaFloor),
        ];
      },
    },
    {
      id: "too-high", title: "TOO HIGH, TOO FAST", aircraft: "a320", route: 1, weather: "cloudy", time: "day", mode: "landing",
      blurb: "13 km from Bristol, 750 ft above the glideslope at 205 kt, flaps 1, gear up. Save it.",
      setup: () => setupFinal(13000, 205, { flap: 1, gear: false, above: 230 }),
      stars: (r) => landingStars(r, 65, 85),
    },
    {
      id: "storm-night", title: "STORM AT NIGHT", aircraft: "a320", route: 1, weather: "storm", time: "night", mode: "landing",
      blurb: "Rain, gusts and darkness on final for Bristol. Fly the glideslope and find the lights.",
      stars: (r) => landingStars(r, 65, 85),
    },
    {
      id: "fog", title: "FOG MINIMUMS", aircraft: "a320", route: 3, weather: "fog", time: "day", mode: "landing",
      blurb: "Heathrow 27L in thick fog. The runway appears only in the last few hundred feet.",
      stars: (r) => landingStars(r, 65, 85),
    },
    {
      id: "valley", title: "INTO THE VALLEY", aircraft: "a320", route: 4, weather: "cloudy", time: "dusk", mode: "landing",
      blurb: "Innsbruck at dusk, mountains on both sides and a short 2,000 m runway at 1,900 ft.",
      stars: (r) => landingStars(r, 65, 85),
    },
    {
      id: "trijet-out", title: "TRIJET, TWO GOOD ENGINES", aircraft: "b722", route: 4, weather: "cloudy", time: "day", mode: "takeoff",
      blurb: "A full 727 out of Munich at 1,500 ft elevation. The tail engine fails at 100 ft: two left, little margin.",
      load: (t) => ({ pax: t.maxPax, fuel: 12000 }), failAtFt: 100,
      stars: (r) => [check("Climb to 1,500 ft", r), check(`Never slower than VR − 5 (lowest ${Math.round(sim.minIasAfterFailure ?? 0)} kt)`, r && (sim.minIasAfterFailure ?? 0) >= sim.takeoffVr - 5), check("Takeoff score 80+", r && r.score >= 80)],
    },
    {
      id: "heavy-short", title: "HEAVY ON A SHORT RUNWAY", aircraft: "b744", route: 1, weather: "cloudy", time: "dusk", mode: "landing",
      blurb: "A heavy 747 into Bristol's 2,011 m runway. Touch down early and stop with room to spare.",
      load: (t) => ({ pax: t.maxPax, fuel: 45000 }),
      stars: (r) => {
        const left = r ? r.runway.end - sim.x : 0;
        return [check("Land and stop on the runway", r), check(`500 m of runway left (${Math.round(left)} m) and score 60+`, r && left >= 500 && r.score >= 60), check("700 m left and score 80+", r && left >= 700 && r.score >= 80)];
      },
    },
    {
      id: "butter", title: "BUTTER THE JUMBO", aircraft: "b744", route: 0, weather: "clear", time: "dusk", mode: "landing",
      blurb: "Calm evening at Glasgow. Grease the 747 on: the softer the better.",
      stars: (r) => {
        const fpm = r ? Math.round(-sim.touchdown.vsFpm) : 0;
        return [check(`Sink rate under 400 fpm (${fpm})`, r && fpm < 400), check("Under 200 fpm, in the touchdown zone", r && fpm < 200 && r.zone), check("Under 100 fpm, no bounce", r && fpm < 100 && !sim.bounces)];
      },
    },
    {
      id: "rock", title: "THE ROCK", aircraft: "b733", route: 6, weather: "cloudy", time: "day", mode: "landing",
      blurb: "Gibraltar's 1,829 m runway crosses the isthmus with water at both ends. Don't land short and stop on the tarmac.",
      stars: (r) => {
        const left = r ? r.runway.end - sim.x : 0;
        return [check("Land and stop on the runway", r), check(`400 m of runway left (${Math.round(left)} m) and score 60+`, r && left >= 400 && r.score >= 60), check("600 m left and score 80+", r && left >= 600 && r.score >= 80)];
      },
    },
    {
      id: "island-engine-out", title: "ENGINE OUT OVER THE SEA", aircraft: "b733", route: 5, weather: "cloudy", time: "night", mode: "takeoff",
      blurb: "A full 737 out of Barcelona at night, straight out over black water. An engine quits at 100 ft.",
      load: (t) => ({ pax: t.maxPax, fuel: 9000 }), failAtFt: 100,
      stars: (r) => [check("Climb to 1,500 ft", r), check(`Never slower than VR − 5 (lowest ${Math.round(sim.minIasAfterFailure ?? 0)} kt)`, r && (sim.minIasAfterFailure ?? 0) >= sim.takeoffVr - 5), check("Takeoff score 80+", r && r.score >= 80)],
    },
    {
      id: "mallorca-storm", title: "STORM OVER MALLORCA", aircraft: "b733", route: 5, weather: "storm", time: "dusk", mode: "landing",
      blurb: "A Mediterranean thunderstorm rolls over Palma at dusk. Hold the glideslope through the gusts.",
      stars: (r) => landingStars(r, 65, 85),
    },
  ];
  const challengeKey = (c) => `bbfs2d.challenge.${c.id}`;
  function readStars(c) {
    try { return Number(localStorage.getItem(challengeKey(c)) || 0); } catch { return 0; }
  }
  function saveStars(c, stars) {
    if (stars <= readStars(c)) return false;
    try { localStorage.setItem(challengeKey(c), String(stars)); } catch { return false; }
    return true;
  }
  const starText = (count) => `${"★".repeat(count)}${"☆".repeat(3 - count)}`;

  // ---------- daily challenge ----------
  // Everyone gets the same scenario on the same local date: aircraft, route, conditions, load and a possible twist.
  const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dayNumber = (key) => Math.round(Date.UTC(...key.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0))) / 86400000);
  function dailyChallenge(date = new Date()) {
    const key = dayKey(date);
    const day = dayNumber(key);
    const roll = (i) => hash2(day, i * 7.31);
    const weighted = (entries, r) => {
      let t = r * entries.reduce((sum, [, weight]) => sum + weight, 0);
      return entries.find(([, weight]) => (t -= weight) < 0)?.[0] ?? entries[0][0];
    };
    const ids = Object.keys(AIRCRAFT);
    const aircraftId = ids[Math.floor(roll(1) * ids.length)];
    const routeIndex = Math.floor(roll(2) * ROUTES.length);
    const takeoff = roll(3) < 0.3;
    const weatherKey = weighted([["clear", 3], ["cloudy", 4], ["storm", 2], ["fog", takeoff ? 0 : 2]], roll(4));
    const timeKey = weighted([["day", 5], ["dusk", 3], ["night", 3]], roll(5));
    const loadFactor = 0.55 + roll(6) * 0.45;
    const twist = roll(7);
    const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
    const c = {
      id: "daily", daily: key, title: `DAILY · ${label}`, aircraft: aircraftId, route: routeIndex, weather: weatherKey, time: timeKey, mode: takeoff ? "takeoff" : "landing",
      load: (t) => {
        const pax = Math.round(t.maxPax * loadFactor);
        return { pax, fuel: Math.min(defaultLoad(t).fuel, t.maxFuel, t.mtow - t.oew - pax * PAX_MASS) };
      },
    };
    const def = ROUTES[routeIndex];
    const place = takeoff ? `${AIRPORTS[def.from[0]].name} ${def.from[1]}` : `${AIRPORTS[def.to[0]].name} ${def.to[1]}`;
    if (takeoff && twist < 0.4) {
      c.failAtFt = 100;
      c.blurb = `Takeoff from ${place}. An engine fails at 100 ft.`;
      c.stars = (r) => [check("Climb to 1,500 ft", r), check(`Never slower than VR − 5 (lowest ${Math.round(sim.minIasAfterFailure ?? 0)} kt)`, r && (sim.minIasAfterFailure ?? 0) >= sim.takeoffVr - 5), check("Takeoff score 75+", r && r.score >= 75)];
    } else if (takeoff) {
      c.blurb = `Takeoff from ${place}, ${Math.round(loadFactor * 100)}% full.`;
      c.stars = (r) => [check("Climb to 1,500 ft", r), check("Takeoff score 70+", r && r.score >= 70), check("Takeoff score 90+", r && r.score >= 90)];
    } else if (twist < 0.25) {
      c.setup = () => setupFinal(13000, 200, { flap: 1, gear: false, above: 200 });
      c.blurb = `Into ${place}, but you're high and fast: 200 kt, flaps ${AIRCRAFT[aircraftId].flaps[1].label}, gear up.`;
      c.stars = (r) => landingStars(r, 60, 80);
    } else {
      c.blurb = `Approach into ${place}, ${Math.round(loadFactor * 100)}% full.`;
      c.stars = (r) => landingStars(r, 60, 80);
    }
    return c;
  }
  // Best daily score per date, for the score to beat and the streak.
  function readDaily() {
    try { return JSON.parse(localStorage.getItem("bbfs2d.daily") || "{}"); } catch { return {}; }
  }
  function saveDaily(key, score) {
    const log = readDaily();
    if (key in log && log[key] >= score) return false;
    log[key] = score;
    try { localStorage.setItem("bbfs2d.daily", JSON.stringify(log)); } catch { return false; }
    return true;
  }
  function dailyStreak(log, today) {
    let streak = 0;
    for (let day = dayNumber(today) - (today in log ? 0 : 1); ; day -= 1) {
      const date = new Date(day * 86400000);
      if (!(dayKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) in log)) return streak;
      streak += 1;
    }
  }

  function challengeTick() {
    const c = challenge;
    if (c.failAtFt && !sim.enginesOut && sim.airborne && sim.agl * FT >= c.failAtFt) {
      sim.enginesOut = 1;
      sim.failureTime = sim.time;
      flash("ENGINE FAILURE", 4);
      audio.chime(3);
      audio.say("engine failure");
      buzz([80, 50, 80]);
      recordEvent("failure");
    }
    if (sim.enginesOut && !sim.onGround) sim.minIasAfterFailure = Math.min(sim.minIasAfterFailure ?? 999, sim.ias);
    if (c.goAroundFt) {
      const g = (sim.goAround ??= { called: false, callTime: 0, minAgl: Infinity, climbDelay: null, touched: false });
      if (!g.called && !sim.onGround && sim.vy < 0 && sim.agl * FT <= c.goAroundFt) {
        g.called = true;
        g.callTime = sim.time;
        audio.say("go around, go around");
        buzz([60, 40, 60]);
      }
      if (g.called) {
        g.minAgl = Math.min(g.minAgl, sim.agl * FT);
        if (g.climbDelay === null && sim.vsFpm > 200) g.climbDelay = sim.time - g.callTime;
        if (sim.onGround) g.touched = true;
        if (sim.agl * FT >= TAKEOFF_GOAL_FT) {
          sim.state = "done";
          sim.endTimer = 0;
          sim.goalFpm = sim.vsFpm;
          sim.doneTime = sim.time;
          recordEvent("done");
        }
      }
    }
  }

  function goAroundReport() {
    const g = sim.goAround;
    return {
      score: 0, grade: "", copy: `Go-around from ${route.to.name} ${route.to.runway}: called at ${challenge.goAroundFt} ft, climbing through ${feet(TAKEOFF_GOAL_FT)} ft.`,
      stats: [
        ["LOWEST HEIGHT", `${Math.round(g.minAgl)} FT`, g.minAgl >= 100 ? "good" : "bad"],
        ["CLIMBING AFTER", g.climbDelay === null ? "—" : `${g.climbDelay.toFixed(1)} S`, g.climbDelay !== null && g.climbDelay <= 5 ? "good" : "meh"],
        ["GEAR", sim.gearDown ? "DOWN" : "UP", sim.gearDown ? "meh" : "good"],
        ["FLAPS", aircraft.flaps[sim.flapIndex].label, sim.flapIndex < lastFlap() ? "good" : "meh"],
        ["CLIMB RATE", `${Math.round(sim.goalFpm / 10) * 10} FPM`, sim.goalFpm > 1000 ? "good" : "meh"],
        ["RUNWAY CONTACT", g.touched ? "YES" : "NO", g.touched ? "bad" : "good"],
        ["A.FLOOR", sim.sawAlphaFloor ? "YES" : "NO", sim.sawAlphaFloor ? "bad" : "good"],
        ["TIME", clock(sim.time), ""],
      ],
    };
  }
  let fcuOpen = false;

  function resetSim() {
    Object.assign(sim, {
      state: "ready", x: START_X, y: route.from.elev, vx: 0, vy: 0, pitch: 0, pitchRate: 0,
      throttle: 0, n1: 0, flapIndex: 0, flapPos: 0, gearDown: true, gearPos: 1, speedbrake: false, spoilerPos: 0, brakesHeld: false, braking: true,
      onGround: true, airborne: false, maxAgl: 0, fpaHold: 0, gamma: 0, gammaRate: 0, flare: false, alphaFloor: false,
      alpha: 0, stall: 0.24, ias: 0, iasTrend: 0, tas: 0, gs: 0, agl: 0, vsFpm: 0, inCloud: false,
      time: 0, rate: 1, paused: false, touchdown: null, bounces: 0, tailStrike: false, tailStrikeTime: -99, overspeedTime: 0,
      crash: null, crashTime: 0, doneTime: 0, endTimer: 0, resultShown: false, callouts: new Set(), prevAglFt: 0, message: "", messageTimer: 0,
      rotateIas: null, liftoffIas: null, liftoffX: null, maxGroundPitch: 0, gearUpFt: null, sawAlphaFloor: false, goalFpm: 0,
      fg: { ap: false, athr: false, appr: false, vertical: "ALT", spd: 250, spdTarget: 250, alt: route.cruiseFt, vs: 1500, retard: false },
      enginesOut: 0, flameout: false, failureTime: null, minIasAfterFailure: null, goAround: null, lowFuelWarned: false,
    });
    setLoad(currentLoad());
    particles.length = 0;
    recorder.frames.length = 0;
    recorder.events.length = 0;
    input.touchPitch = 0;
    input.keyPitch = 0;
  }

  // Weight: empty aircraft + passengers + fuel. Fuel burns off in flight, so the mass keeps changing.
  function currentLoad() {
    if (challenge?.load) return challenge.load(aircraft);
    const saved = settings.loads?.[`${aircraft.id}|${settings.route}`];
    return saved ? { ...saved } : defaultLoad();
  }
  function setLoad(load) {
    sim.pax = clamp(Math.round(load.pax), 0, aircraft.maxPax);
    sim.fuel = clamp(load.fuel, 0, aircraft.maxFuel);
    sim.startFuel = sim.fuel;
    updateMass();
  }
  const updateMass = () => { sim.mass = aircraft.oew + sim.pax * PAX_MASS + sim.fuel; };

  function flash(message, seconds = 2.2) {
    sim.message = message;
    sim.messageTimer = seconds;
  }

  // ---------- replay recorder ----------
  const recorder = { frames: [], events: [], tick: 0 };
  const REPLAY_FIELDS = ["x", "y", "vx", "vy", "pitch", "gearPos", "flapPos", "n1", "spoilerPos", "ias", "vsFpm", "agl", "throttle", "alpha", "stall", "iasTrend", "gs", "gamma", "tas"];
  function record() {
    if (sim.resultShown || (recorder.tick += 1) % 4) return;
    const frame = { t: sim.time, state: sim.state, onGround: sim.onGround, speedbrake: sim.speedbrake, inCloud: sim.inCloud, braking: sim.braking };
    for (const field of REPLAY_FIELDS) frame[field] = sim[field];
    recorder.frames.push(frame);
    if (recorder.frames.length > 2400) recorder.frames.shift();
  }
  const recordEvent = (type, data = {}) => recorder.events.push({ t: sim.time, type, x: sim.x, ...data });

  // ---------- physics ----------
  function step(dt) {
    updateParticles(dt);
    if (sim.state === "crashed") {
      stepWreck(dt);
      record();
      return;
    }
    if (sim.state !== "flying" && sim.state !== "done") return;
    const ac = aircraft;
    const fg = sim.fg;
    sim.time += dt;
    const ground = groundAt(sim.x);
    const agl = sim.y - ground;

    if (fg.ap) {
      if (sim.onGround) disconnectAp(null);
      else if (Math.abs(input.pitch) > 0.25) disconnectAp("AP OFF · STICK INPUT");
      else if (sim.alphaFloor) disconnectAp("AP OFF · A.FLOOR");
      else if (fg.vertical === "G/S" && agl * FT < 100) disconnectAp("AP OFF · FLARE BY HAND");
    }
    if (fg.athr && sim.onGround) disconnectAthr(fg.retard ? null : "A/THR OFF");
    if (fg.athr) autothrust(dt);
    const cmd = fg.ap ? autopilotPitch() : input.pitch;

    sim.gearPos = approach(sim.gearPos, sim.gearDown ? 1 : 0, dt / ac.gearTransit);
    sim.flapPos = approach(sim.flapPos, sim.flapIndex, dt / ac.flapTransit);
    if (sim.throttle > 0.9 || sim.alphaFloor) sim.speedbrake = false;
    const groundSpoilers = sim.onGround && sim.throttle < 0.05 && sim.ias > 50;
    sim.spoilerPos = approach(sim.spoilerPos, groundSpoilers ? 1 : sim.speedbrake ? 0.55 : 0, dt * 1.2);

    const rho = density(sim.y);
    const gust = turbulence(sim.x, sim.y, agl, sim.time);
    const rvx = sim.vx + headwind(agl) + gust.x;
    const rvy = sim.vy - gust.y;
    const tas = Math.hypot(rvx, rvy);
    const gammaAir = tas > 3 ? Math.atan2(rvy, rvx) : 0;
    const alpha = sim.pitch - gammaAir;
    const flap = flapConfig(sim.flapPos);
    const stall = stallAlpha(flap);
    const groundEffect = (16 * (Math.max(0, agl) + 3.2) / ac.span) ** 2;
    const inducedFactor = groundEffect / (1 + groundEffect);
    const cl = liftCoefficient(alpha, flap) * (1 - ac.spoilerLift * sim.spoilerPos) * (1 + 0.1 * (1 - inducedFactor));
    const deadEngines = sim.flameout ? ac.engines : sim.enginesOut;
    const cd = ac.cd0 + flap.cd + ac.gearCd * sim.gearPos + ac.spoilerCd * sim.spoilerPos + ac.inducedK * cl * cl * inducedFactor + 0.0012 * deadEngines;
    const q = 0.5 * rho * tas * tas;
    const lift = q * ac.wingArea * cl;
    const drag = q * ac.wingArea * cd;
    const ias = tas * Math.sqrt(rho / RHO0) * KT;

    // Alpha floor: the A320 commands TOGA when the wing gets close to the stall.
    if (!sim.onGround && agl > 30 && alpha > stall - 2.5 * DEG) sim.alphaFloor = sim.sawAlphaFloor = true;
    else if (sim.alphaFloor && (sim.onGround || alpha < stall - 6 * DEG)) sim.alphaFloor = false;
    const lever = sim.flameout ? 0 : sim.alphaFloor ? 1 : sim.throttle;
    sim.n1 += (lever - sim.n1) * (1 - Math.exp(-dt / (lever > sim.n1 ? 2.2 : 1.5)));
    const running = (ac.engines - deadEngines) / ac.engines;
    const thrust = running * ac.maxThrust * (ac.idleThrust + (1 - ac.idleThrust) * sim.n1) * Math.pow(rho / RHO0, 0.75) * Math.max(0.5, 1 - 0.0026 * tas);
    const fuelFlow = (ac.engines - deadEngines) * (ac.ffIdle + (ac.ffMax - ac.ffIdle) * sim.n1) * (0.55 + 0.45 * rho / RHO0);
    sim.fuelFlow = fuelFlow;
    sim.fuel = Math.max(0, sim.fuel - fuelFlow * dt);
    updateMass();
    if (sim.fuel <= 0 && !sim.flameout) {
      sim.flameout = true;
      disconnectAthr(null);
      flash("FUEL EXHAUSTED · ALL ENGINES FLAMED OUT", 5);
      audio.chime(3);
      buzz([60, 40, 60, 40, 60]);
    }

    const cp = Math.cos(sim.pitch);
    const sp = Math.sin(sim.pitch);
    const cg = Math.cos(gammaAir);
    const sg = Math.sin(gammaAir);
    let fx = thrust * cp - drag * cg - lift * sg;
    let fy = thrust * sp - drag * sg + lift * cg - sim.mass * G;
    sim.braking = sim.onGround && (sim.brakesHeld || sim.throttle < 0.05);
    if (sim.onGround) {
      const friction = Math.max(0, -fy) * (sim.braking ? ac.brakeMu : ac.rollMu);
      if (sim.vx <= 0.05 && fx <= friction) {
        sim.vx = 0;
        fx = 0;
      } else {
        fx -= friction;
      }
      fy = Math.max(0, fy);
    }
    const vxBefore = sim.vx;
    sim.vx += (fx / sim.mass) * dt;
    if (sim.onGround && vxBefore > 0 && sim.vx < 0) sim.vx = 0;
    sim.vy += (fy / sim.mass) * dt;
    sim.x += sim.vx * dt;
    sim.y += sim.vy * dt;

    const previousIas = sim.ias;
    const previousGamma = sim.gamma;
    sim.alpha = alpha;
    sim.stall = stall;
    sim.tas = tas;
    sim.ias = ias;
    sim.iasTrend += ((ias - previousIas) / dt * 10 - sim.iasTrend) * (1 - Math.exp(-dt / 1.5));
    sim.gs = sim.vx * KT;
    sim.gamma = sim.vx > 15 ? Math.atan2(sim.vy, sim.vx) : 0;
    sim.gammaRate += ((sim.gamma - previousGamma) / dt - sim.gammaRate) * (1 - Math.exp(-dt / 0.15));
    sim.vsFpm = sim.vy * FPM;
    sim.agl = Math.max(0, sim.y - groundAt(sim.x));
    sim.maxAgl = Math.max(sim.maxAgl, sim.agl);
    sim.inCloud = gust.inCloud;

    updatePitch(dt, cmd);
    contacts();
    record();
    if (sim.state !== "flying") return;
    if (mode === "takeoff" && sim.agl * FT >= TAKEOFF_GOAL_FT) {
      sim.state = "done";
      sim.endTimer = 0;
      sim.goalFpm = sim.vsFpm;
      sim.doneTime = sim.time;
      recordEvent("done");
      return;
    }

    if ((sim.flapPos > 0.05 && ias > currentVfe() + 3) || (sim.gearPos > 0.05 && ias > ac.vle + 3) || ias > ac.vmo + 2) sim.overspeedTime += dt;
    if (challenge) challengeTick(dt);
    if (sim.touchdown && !sim.onGround && sim.agl > 30) {
      sim.touchdown = null;
      sim.bounces = 0;
      flash("GO-AROUND");
    }
    if (sim.onGround && sim.n1 > 0.6 && sim.vx > 8 && Math.random() < dt * 30) {
      spawn({ x: sim.x - aircraft.length * 0.6 - Math.random() * 6, y: 0.4, vx: -4 - Math.random() * 6, vy: 0.4 + Math.random(), life: 1.2, size: 1.2, grow: 2.5, color: [196, 182, 150], alpha: 0.22 });
    }
  }

  // Fly-by-wire: the stick commands pitch rate; released, it holds the flight path angle (attitude in the flare).
  function updatePitch(dt, cmd) {
    let rate = 0;
    if (sim.onGround) {
      const authority = clamp((sim.ias - 95) / 40, 0, 1);
      if (cmd > 0.02) rate = cmd * 3.4 * DEG * authority;
      if (sim.pitch > 0 && rate <= 1e-4) rate = -(1.6 + Math.max(0, -cmd) * 2.4) * DEG;
      sim.fpaHold = sim.gamma;
      sim.flare = false;
    } else {
      sim.flare = sim.maxAgl > 100 && sim.agl < 15;
      if (Math.abs(cmd) > 0.02) {
        rate = cmd * 5 * DEG;
        sim.fpaHold = sim.gamma;
      } else if (!sim.flare) {
        rate = clamp((sim.fpaHold - sim.gamma) * 1.0 - sim.gammaRate * 1.2, -3 * DEG, 3 * DEG);
      }
      const alphaProt = sim.stall - 3 * DEG;
      const alphaMax = sim.stall - 1 * DEG;
      if (sim.alpha > alphaProt - 1 * DEG) {
        const limit = (alphaProt + Math.max(0, cmd) * (alphaMax - alphaProt) - sim.alpha) * 2.5;
        if (rate > limit) {
          rate = limit;
          sim.fpaHold = sim.gamma;
        }
      }
      if (sim.pitch > 30 * DEG) rate = Math.min(rate, (30 * DEG - sim.pitch) * 2);
      if (sim.pitch < -15 * DEG) rate = Math.max(rate, (-15 * DEG - sim.pitch) * 2);
      if (sim.ias > aircraft.vmo + 6) {
        rate = Math.max(rate, 1.5 * DEG);
        sim.fpaHold = sim.gamma;
      }
    }
    sim.pitchRate += (rate - sim.pitchRate) * (1 - Math.exp(-dt * 5));
    sim.pitch += sim.pitchRate * dt;
    if (sim.onGround) {
      if (sim.pitch < 0) {
        sim.pitch = 0;
        sim.pitchRate = Math.max(0, sim.pitchRate);
      }
      if (sim.pitch > TAIL_STRIKE) {
        sim.pitch = TAIL_STRIKE;
        sim.pitchRate = 0;
        tailStrike();
      }
      if (!sim.airborne) {
        if (sim.rotateIas === null && sim.pitch > 0.5 * DEG) sim.rotateIas = sim.ias;
        sim.maxGroundPitch = Math.max(sim.maxGroundPitch, sim.pitch);
      }
    }
  }

  // ---------- autopilot & autothrust ----------
  // The autopilot flies a target flight path through the same fly-by-wire pitch law as the stick.
  function autopilotPitch() {
    const fg = sim.fg;
    const distTd = TOUCHDOWN_X - sim.x;
    const gsDev = sim.y - glidepathAlt(sim.x);
    if (fg.appr && fg.vertical !== "G/S" && distTd > 1500 && distTd < 30000 && sim.y < route.interceptAlt + 600 && Math.abs(gsDev) < 15 + distTd * 0.0015) {
      fg.vertical = "G/S";
      flash("G/S CAPTURED");
      audio.chime(1);
    }
    let vsTarget;
    if (fg.vertical === "G/S") {
      vsTarget = -sim.vx * TAN_GS - clamp(gsDev, -60, 60) * 0.15;
    } else {
      const err = fg.alt / FT - sim.y;
      const selected = fg.vs / FPM;
      vsTarget = clamp(err * 0.1, -selected, selected);
      fg.vertical = Math.abs(err) < 8 ? "ALT" : Math.abs(err * 0.1) < selected ? "ALT*" : err > 0 ? "CLB" : "DES";
    }
    // Speed comes first: never trade the last knots for altitude, and don't dive through the limits.
    const [vmin, vmax] = speedLimits();
    if (vsTarget > 0 && sim.ias < vmin + 5) vsTarget *= clamp((sim.ias - vmin) / 5, 0, 1);
    if (vsTarget < 0 && sim.ias > vmax) vsTarget *= clamp(1 - (sim.ias - vmax) / 8, 0, 1);
    const target = Math.atan2(vsTarget, Math.max(30, sim.vx));
    return clamp(9 * (target - sim.gamma) - 6 * sim.gammaRate, -0.6, 0.6);
  }

  function autothrust(dt) {
    const fg = sim.fg;
    const [vmin, vmax] = speedLimits();
    fg.spdTarget = clamp(fg.spd, vmin, vmax);
    if (!fg.retard && sim.maxAgl > 100 && sim.agl * FT < 30 && sim.vy < 0 && sim.flapIndex >= lastFlap() - 1) {
      fg.retard = true;
      audio.say("retard");
    }
    if (fg.retard) {
      sim.throttle = Math.max(0, sim.throttle - dt * 0.6);
      return;
    }
    const rate = clamp((fg.spdTarget - sim.ias) * 0.012 - (sim.iasTrend / 10) * 0.06, -0.15, 0.15);
    sim.throttle = clamp(sim.throttle + rate * dt, 0, 0.82);
  }

  function toggleAp() {
    const fg = sim.fg;
    if (fg.ap) return disconnectAp("AP OFF");
    if (sim.state !== "flying" || sim.onGround || sim.agl * FT < 100) return flash("AP: AIRBORNE ABOVE 100 FT ONLY");
    fg.ap = true;
    if (fg.vertical === "G/S" && !fg.appr) fg.vertical = "ALT";
    audio.chime(1);
    buzz(10);
  }
  function disconnectAp(message) {
    const fg = sim.fg;
    if (!fg.ap) return;
    fg.ap = false;
    if (fg.vertical === "G/S") fg.vertical = "ALT";
    sim.fpaHold = sim.gamma;
    if (message) {
      flash(message, 3);
      audio.chime(3);
      buzz([40, 60, 40]);
    }
  }
  function toggleAthr() {
    const fg = sim.fg;
    if (fg.athr) return disconnectAthr("A/THR OFF");
    if (sim.state !== "flying" || sim.onGround) return flash("A/THR: AIRBORNE ONLY");
    fg.athr = true;
    fg.retard = false;
    audio.chime(1);
    buzz(10);
  }
  function disconnectAthr(message) {
    const fg = sim.fg;
    if (!fg.athr) return;
    fg.athr = false;
    fg.retard = false;
    if (message) {
      flash(message, 2.5);
      audio.chime(2);
    }
  }
  function toggleAppr() {
    const fg = sim.fg;
    if (sim.state !== "flying") return;
    fg.appr = !fg.appr;
    if (!fg.appr && fg.vertical === "G/S") fg.vertical = "ALT";
    buzz(8);
  }
  function adjustKnob(knob, dir) {
    const fg = sim.fg;
    if (knob === "spd") fg.spd = clamp(fg.spd + dir * 5, 100, 340);
    if (knob === "alt") fg.alt = clamp(fg.alt + dir * ((dir > 0 ? fg.alt >= 5000 : fg.alt > 5000) ? 500 : 100), 0, 25000);
    if (knob === "vs") fg.vs = clamp(fg.vs + dir * 100, 300, 4000);
    buzz(4);
  }
  function fmaText() {
    const fg = sim.fg;
    const thrust = fg.athr ? (fg.retard ? "RETARD" : `SPEED ${Math.round(fg.spdTarget)}`) : "MAN THR";
    const labels = { ALT: `ALT ${feet(fg.alt)}`, "ALT*": `ALT* ${feet(fg.alt)}`, CLB: `V/S +${fg.vs}`, DES: `V/S −${fg.vs}`, "G/S": "G/S" };
    const vertical = fg.ap ? `AP · ${labels[fg.vertical]}` : "AP OFF";
    return `${thrust} | ${vertical}${fg.appr && fg.vertical !== "G/S" ? " | G/S ARMED" : ""}`;
  }

  const pointHeight = (point) => sim.y - groundAt(sim.x) + point.x * Math.sin(sim.pitch) + point.y * Math.cos(sim.pitch);

  function contacts() {
    const ground = groundAt(sim.x);
    if (!sim.onGround) {
      const noseHeight = pointHeight(geo.nose);
      if (sim.y <= ground || noseHeight <= 0) {
        touchdown(noseHeight < sim.y - ground);
      } else if (pointHeight(geo.tail) <= 0) {
        tailStrike();
        if (sim.vsFpm < -600) {
          crash("TAIL STRIKE", `The tail hit the runway hard at a high pitch attitude. Keep the ${aircraft.name} below ${Math.floor(TAIL_STRIKE / DEG)}° of pitch near the ground.`);
          return;
        }
        sim.vy = Math.max(sim.vy, 0);
        sim.pitchRate = Math.min(sim.pitchRate, -2 * DEG);
      }
      return;
    }
    if (sim.y < ground) {
      sim.y = ground;
      sim.vy = Math.max(0, sim.vy);
    }
    if (sim.y - ground > 0.15) {
      liftoff();
      return;
    }
    if (!runwayAt(sim.x) && sim.vx > 0.5) {
      crash("RUNWAY EXCURSION", `The aircraft ran off the end of the runway at ${Math.round(sim.gs)} kt.`);
      return;
    }
    if (sim.touchdown && sim.vx < 0.3) land();
  }

  function liftoff() {
    sim.onGround = false;
    sim.fpaHold = sim.gamma;
    if (!sim.airborne) {
      sim.airborne = true;
      sim.liftoffIas = sim.ias;
      sim.liftoffX = sim.x;
    } else if (sim.touchdown && sim.time - sim.touchdown.time < 8) {
      sim.bounces += 1;
    }
  }

  function touchdown(noseFirst) {
    const vsFpm = sim.vsFpm;
    const runway = runwayAt(sim.x);
    const strength = clamp(-vsFpm / 900, 0.08, 1);
    sim.onGround = true;
    sim.y = groundAt(sim.x);
    sim.vy = 0;
    if (noseFirst) sim.pitch = 0;
    if (!runway && themeAt(sim.x) === "sea") {
      crash("DITCHING", `The aircraft came down in the sea ${km(Math.min(Math.abs(sim.x - route.from.end), Math.abs(route.to.start - sim.x)))} from the nearest airport.`);
      return;
    }
    if (!runway && (sim.gearPos < 0.98 || vsFpm < -1100 || mountainsAt(sim.x) > 0.2)) {
      crash("TERRAIN IMPACT", `The aircraft flew into ${mountainsAt(sim.x) > 0.2 ? "the mountains" : "the ground"} at ${Math.round(sim.ias)} kt, ${km(Math.abs(route.to.start - sim.x))} from ${route.to.name}. Watch the TERRAIN warning and the profile display.`);
      return;
    }
    if (sim.gearPos < 0.98) {
      crash("GEAR-UP LANDING", `The aircraft hit the ground at ${Math.round(sim.ias)} kt with the landing gear ${sim.gearPos > 0.02 ? "still in transit" : "retracted"}.`);
      return;
    }
    if (!runway) {
      const nearest = runways.reduce((best, r) => (Math.abs(sim.x - r.start) < Math.abs(sim.x - best.start) ? r : best));
      const short = sim.x < nearest.start;
      crash("OFF-AIRPORT LANDING", `Touched down ${km(short ? nearest.start - sim.x : sim.x - nearest.end)} ${short ? "short of" : "past the end of"} runway ${nearest.runway} at ${nearest.name}.`);
      return;
    }
    if (vsFpm < -1100) {
      crash("HARD IMPACT", `Sink rate at touchdown was ${Math.round(-vsFpm)} ft/min. The landing gear collapsed.`);
      return;
    }
    if (noseFirst && vsFpm < -500) {
      crash("NOSE GEAR COLLAPSE", "The nose wheel hit the runway first. Raise the nose slightly in the flare so the main wheels touch first.");
      return;
    }
    touchdownEffects(sim.x, sim.vx, strength);
    recordEvent("touchdown", { strength });
    if (sim.maxAgl > 15 && !sim.touchdown) {
      sim.touchdown = { vsFpm, ias: sim.ias, pitch: sim.pitch, dist: sim.x - runway.start, runway, noseFirst, time: sim.time, flaps: sim.flapIndex, mass: sim.mass, vapp: vappKt() };
    }
  }

  function touchdownEffects(x, vx, strength) {
    for (let i = 0; i < 8 + strength * 30; i += 1) {
      spawn({ x: x + (Math.random() - 0.5) * 3, y: 0.3, vx: vx * 0.15 + (Math.random() - 0.5) * 4, vy: 0.4 + Math.random() * 1.6, life: 1.5 + Math.random() * 1.6, size: 0.8 + Math.random(), grow: 2.4, color: [232, 232, 226], alpha: 0.55 });
    }
    audio.thump(strength);
    buzz(Math.round(10 + strength * 50));
    view.shake = Math.max(view.shake, 1 + strength * 6);
  }

  function tailStrike() {
    if (sim.ias < 30) return;
    if (!sim.tailStrike) audio.scrape();
    if (sim.time - sim.tailStrikeTime > 0.3) {
      const tail = toWorld(geo.tail);
      sparks(tail.x, sim.vx);
      recordEvent("tail", { x: tail.x });
    }
    sim.tailStrike = true;
    sim.tailStrikeTime = sim.time;
  }
  function sparks(x, vx) {
    for (let i = 0; i < 12; i += 1) spawn({ x, y: 0.2, vx: -vx * 0.2 + (Math.random() - 0.5) * 8, vy: Math.random() * 3, life: 0.5, size: 0.25, grow: 0, color: [255, 190, 90], alpha: 1, glow: true, gravity: 1 });
  }

  function crash(title, copy) {
    sim.state = "crashed";
    sim.crash = { title, copy };
    sim.crashTime = sim.time;
    sim.endTimer = 0;
    sim.speedbrake = false;
    sim.fg.ap = false;
    sim.fg.athr = false;
    explosion(sim.x, sim.vx);
    recordEvent("crash");
  }
  function explosion(x, vx) {
    const spread = aircraft.length * 0.8;
    view.shake = 16;
    audio.crash();
    buzz([80, 40, 160]);
    for (let i = 0; i < 70; i += 1) {
      const fire = i % 2 === 0;
      spawn({
        x: x + (Math.random() - 0.3) * spread, y: 1 + Math.random() * 5, vx: vx * 0.3 + (Math.random() - 0.5) * 14, vy: 2 + Math.random() * 10,
        life: 1 + Math.random() * 2.2, size: fire ? 2 + Math.random() * 3 : 3 + Math.random() * 4, grow: fire ? 1 : 4,
        color: fire ? [255, 150 + Math.random() * 60, 60] : [70, 66, 62], alpha: fire ? 0.9 : 0.55, glow: fire,
      });
    }
    for (let i = 0; i < 26; i += 1) spawn({ x: x + (Math.random() - 0.5) * spread, y: 1, vx: vx * 0.5 + (Math.random() - 0.5) * 20, vy: 4 + Math.random() * 12, life: 2.5, size: 0.4 + Math.random() * 0.6, grow: 0, color: [40, 44, 46], alpha: 1, gravity: 1 });
  }

  function stepWreck(dt) {
    sim.time += dt;
    const ground = groundAt(sim.x);
    sim.n1 = Math.max(0, sim.n1 - dt * 0.5);
    sim.vx *= Math.exp(-dt * 1.4);
    sim.vy = sim.y > ground ? sim.vy - G * dt : 0;
    sim.x += sim.vx * dt;
    sim.y = Math.max(ground, sim.y + sim.vy * dt);
    sim.pitch = lerp(sim.pitch, -2 * DEG, 1 - Math.exp(-dt * 2));
    sim.ias = sim.vx * KT;
    sim.gs = sim.ias;
    sim.agl = sim.y - ground;
    sim.vsFpm = sim.vy * FPM;
    wreckSmoke(dt, sim.x);
  }
  function wreckSmoke(dt, x) {
    if (Math.random() >= dt * 26) return;
    const fire = Math.random() < 0.45;
    spawn({ x: x - 6 + (Math.random() - 0.5) * 20, y: 1 + Math.random() * 3, vx: -2 + Math.random() * 2, vy: 2 + Math.random() * 3, life: 2 + Math.random() * 2, size: fire ? 1.5 : 3, grow: fire ? 0.6 : 3.5, color: fire ? [255, 140, 50] : [64, 62, 60], alpha: fire ? 0.8 : 0.45, glow: fire });
  }

  function land() {
    sim.state = "landed";
    sim.endTimer = 0;
    recordEvent("stop");
  }

  function toWorld(point) {
    return { x: sim.x + point.x * Math.cos(sim.pitch) - point.y * Math.sin(sim.pitch), y: pointHeight(point) };
  }

  // ---------- particles (positions are meters above the local ground) ----------
  function spawn(particle) {
    if (particles.length > 700) particles.shift();
    particles.push({ gravity: 0, glow: false, ...particle, age: 0 });
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * G * dt;
      p.vx *= Math.exp(-dt * 0.8);
      p.x += p.vx * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      p.size += p.grow * dt;
    }
  }

  // ---------- guidance ----------
  function guidance() {
    const ac = aircraft;
    const fg = sim.fg;
    const agl = sim.agl * FT;
    const ias = sim.ias;
    if (replay.active) return `REPLAY · ${replay.cam.toUpperCase()} CAMERA · ${replay.speed}×`;
    if (sim.state === "ready") return "CHOOSE A FLIGHT";
    if (sim.state === "crashed") return `CRASH · ${sim.crash.title}`;
    if (sim.state === "landed") return "LANDED · AIRCRAFT STOPPED";
    if (sim.state === "done") return "TAKEOFF COMPLETE";
    if (sim.onGround && sim.touchdown) return sim.throttle >= 0.05 ? "THROTTLE TO IDLE TO BRAKE" : "AUTOBRAKE · STOPPING ON THE RUNWAY";
    if (sim.onGround) {
      if (sim.flapIndex < ac.takeoffFlap) return `SET FLAPS ${ac.flaps[ac.takeoffFlap].label} FOR TAKEOFF (FLAPS ▼ OR F)`;
      if (sim.throttle < 0.9) return sim.vx < 1 ? "PUSH THE THROTTLE UP TO TOGA" : "FULL THRUST FOR TAKEOFF";
      if (ias < vrKt()) return `TAKEOFF ROLL · ROTATE AT ${vrKt()} KT`;
      return `ROTATE · PULL GENTLY TO ${ac.rotatePitch}° (TAIL STRIKE AT ${Math.floor(TAIL_STRIKE / DEG)}°)`;
    }
    const distTd = TOUCHDOWN_X - sim.x;
    const cruise = route.cruiseLabel;
    if (sim.goAround?.called) {
      if (sim.throttle < 0.95 && !sim.alphaFloor) return "GO AROUND · THRUST TO TOGA, PITCH UP";
      if (sim.vsFpm < 300) return "GO AROUND · PITCH UP TO ABOUT 15° · CLIMB";
      if (sim.gearDown) return "POSITIVE CLIMB · GEAR UP (G)";
      if (sim.flapIndex >= lastFlap()) return "FLAPS ONE STEP UP (FLAPS ▲ OR R)";
      return `CLIMB TO ${feet(TAKEOFF_GOAL_FT)} FT · ${Math.max(0, Math.round((TAKEOFF_GOAL_FT - agl) / 10) * 10)} FT TO GO`;
    }
    if (sim.enginesOut && !sim.flameout && sim.x < TOD_X && agl < TAKEOFF_GOAL_FT + 500) {
      const target = vrKt() + 10;
      if (sim.gearDown) return `ENGINE FAILURE · GEAR UP · HOLD ${target} KT`;
      if (ias < vrKt()) return `ENGINE FAILURE · LOWER THE NOSE · SPEED ${target} KT`;
      return `ENGINE FAILURE · CLIMB AT ${target} KT TO ${feet(TAKEOFF_GOAL_FT)} FT`;
    }
    if (sim.flameout) return "ENGINES OUT · GLIDE AT 220 KT · FIND A RUNWAY";
    if (sim.x < TOD_X) {
      if (sim.gearDown && sim.vy > 0) return "POSITIVE CLIMB · GEAR UP (G)";
      if (mode === "takeoff") return `CLIMB TO ${feet(TAKEOFF_GOAL_FT)} FT · ABOUT ${ac.climbPitch}° PITCH · ${Math.max(0, Math.round((TAKEOFF_GOAL_FT - agl) / 10) * 10)} FT TO GO`;
      if (agl < 1500) return `CLIMB · HOLD ABOUT ${ac.climbPitch}° PITCH`;
      if (sim.flapIndex > 0) return "RETRACT FLAPS (FLAPS ▲ OR R)";
      if (sim.throttle > 0.9 && !fg.athr) return "PULL THRUST BACK TO THE CL DETENT";
      if (!fg.ap && sim.y < route.cruiseAlt - 90) return `CLIMB TO ${cruise} · OR TAP AP: ENGAGE AP + A/THR`;
      if (sim.y < route.cruiseAlt - 90) return `CLIMB TO ${cruise} · T/D IN ${km(TOD_X - sim.x)}`;
      if (Math.abs(sim.vsFpm) > 300) return `LEVEL OFF AT ${cruise}`;
      if (ias > 320) return "REDUCE THRUST · CRUISE AT 250–300 KT";
      return `CRUISE ${cruise} · T/D IN ${km(TOD_X - sim.x)}${sim.rate === 1 ? " · TAP 1× TO SPEED UP" : ""}`;
    }
    if (agl < 60 && runwayAt(sim.x + 250)) return agl < 35 ? "FLARE · PULL GENTLY · THROTTLE IDLE" : "STABLE · FLARE AT 30 FT";
    if (fg.ap && fg.vertical === "G/S" && agl < 500) return "AP DISCONNECTS AT 100 FT · GET READY TO FLARE";
    const intercept = `${feet(route.interceptAlt * FT)} FT`;
    const target = profileAlt(sim.x);
    if (distTd > 30000 || sim.y > route.interceptAlt + 300) {
      if (fg.ap && fg.alt / FT > route.interceptAlt + 150) return `SET AP ALT ${intercept} TO START THE DESCENT`;
      if (sim.y > target + 150) return sim.throttle > 0.08 && !fg.athr ? "DESCEND · THROTTLE TO IDLE, NOSE DOWN" : "ABOVE PROFILE · EXTEND SPEED BRAKE";
      if (sim.y < target - 150) return "BELOW PROFILE · LEVEL OFF";
      if (ias > 300) return "TOO FAST · LESS NOSE DOWN OR SPEED BRAKE";
      return `DESCEND TO ${intercept} · ABOUT −1,300 FPM · ${km(distTd)}`;
    }
    const wantFlaps = ac.flapSchedule.reduce((want, [dist, index]) => (distTd < dist ? index : want), 1);
    if (!sim.gearDown && (distTd < 16000 || agl < 2000)) return "GEAR DOWN (G)";
    if (sim.flapIndex < wantFlaps) {
      const next = ac.flaps[sim.flapIndex + 1];
      return ias > next.vfe - 3 ? `SLOW BELOW ${next.vfe} KT · THEN FLAPS ${next.label}` : `FLAPS ${next.label} (FLAPS ▼ OR F)`;
    }
    const speed = flapSpeed(sim.flapIndex);
    if (fg.ap && !fg.appr) return "ARM APPR TO CAPTURE THE GLIDESLOPE";
    if (sim.x < INTERCEPT_X - 500) return `HOLD ${intercept} · ${speed} KT · GLIDESLOPE IN ${km(INTERCEPT_X - sim.x)}`;
    const deviation = (sim.y - glidepathAlt(sim.x)) * FT;
    if (deviation > 120) return "ABOVE GLIDESLOPE · DESCEND MORE";
    if (deviation < -120) return "BELOW GLIDESLOPE · SHALLOWER DESCENT";
    if (ias > speed + 12) return `FAST · REDUCE THRUST · TARGET ${speed} KT`;
    if (ias < speed - 8) return `SLOW · ADD THRUST · TARGET ${speed} KT`;
    return `ON GLIDESLOPE · ${speed} KT · ${km(distTd)}`;
  }

  function warnings() {
    const list = [];
    if (sim.state !== "flying") return list;
    const agl = sim.agl * FT;
    if (!sim.onGround && sim.alpha > sim.stall - 0.5 * DEG) list.push(["STALL", "warn"]);
    if (sim.alphaFloor) list.push(["A.FLOOR", "caution"]);
    if (sim.ias > aircraft.vmo + 2) list.push(["OVERSPEED", "warn"]);
    else if (sim.flapPos > 0.05 && sim.ias > currentVfe() + 3) list.push(["FLAP OVERSPEED", "warn"]);
    else if (sim.gearPos > 0.05 && sim.ias > aircraft.vle + 3) list.push(["GEAR OVERSPEED", "warn"]);
    if (!sim.onGround && sim.airborne) {
      if (agl < 2500 && sim.vsFpm < -(900 + agl * 0.9)) list.push([agl < 1000 && sim.vsFpm < -(1500 + agl) ? "PULL UP" : "SINK RATE", "warn"]);
      if (sim.gearPos < 1 && agl < 750 && sim.vy < 0 && sim.maxAgl > 150) list.push(["TOO LOW · GEAR", "warn"]);
    }
    if (sim.tailStrike && sim.time - sim.tailStrikeTime < 4) list.push(["TAIL STRIKE", "caution"]);
    if (sim.flameout) list.push(["ALL ENGINES OUT", "warn"]);
    else if (sim.enginesOut) list.push([`ENG ${sim.enginesOut > 1 ? "FAIL ×" + sim.enginesOut : "1 FAIL"}`, "warn"]);
    if (!sim.flameout && sim.fuel < aircraft.reserveFuel * 0.6) list.push([sim.fuel < aircraft.reserveFuel * 0.25 ? "FUEL LOW · LAND NOW" : "LOW FUEL", "caution"]);
    if (terrainAhead()) list.push(["TERRAIN · PULL UP", "warn"]);
    if (sim.goAround?.called && sim.time - sim.goAround.callTime < 6) list.push(["GO AROUND", "warn"]);
    if (sim.speedbrake && !sim.onGround) list.push(["SPD BRK", "info"]);
    if (!replay.active && sim.messageTimer > 0) list.push([sim.message, sim.message.startsWith("AP OFF") ? "caution" : "info"]);
    return list;
  }

  // Ground proximity: look up to 20 s ahead along the current flight path for rising terrain.
  function terrainAhead() {
    if (sim.onGround || !sim.airborne || sim.agl > 900) return false;
    const nearRunway = runways.some((r) => sim.x > r.start - 9000 && sim.x < r.end) && sim.gearDown;
    if (nearRunway) return false;
    const clearance = sim.y - groundAt(sim.x);
    for (const t of [5, 10, 15, 20]) {
      const ahead = sim.y + sim.vy * t - groundAt(sim.x + sim.vx * t);
      if (ahead < 90 && ahead < clearance - 15) return true; // only while the gap to the ground is closing
    }
    return false;
  }

  const CALLOUTS = [[2500, "twenty five hundred"], [1000, "one thousand"], [500, "five hundred"], [100, "one hundred"], [50, "fifty"], [40, "forty"], [30, "thirty"], [20, "twenty"], [10, "ten"]];
  function callouts() {
    const aglFt = sim.agl * FT;
    const once = (key, text) => {
      if (sim.callouts.has(key)) return;
      sim.callouts.add(key);
      audio.say(text);
    };
    if (sim.state === "flying") {
      if (sim.onGround && !sim.airborne) {
        if (sim.ias >= 100) once("100kt", "one hundred knots");
        if (sim.ias >= vrKt()) once("rotate", "rotate");
      }
      if (!sim.onGround && sim.maxAgl > 300 && sim.vy < 0 && !sim.touchdown) {
        for (const [ft, text] of CALLOUTS) {
          if (aglFt <= ft && sim.prevAglFt > ft) once(`ra${ft}`, text);
        }
        if (aglFt < 22 && sim.throttle > 0.05) once("retard", "retard");
      }
    }
    if (sim.state === "flying" && terrainAhead() && sim.time - (sim.terrainCallTime ?? -99) > 4) {
      sim.terrainCallTime = sim.time;
      audio.say("terrain, terrain, pull up");
    }
    sim.prevAglFt = aglFt;
  }

  function landingReport() {
    const td = sim.touchdown;
    const runway = td.runway;
    const fpm = Math.max(0, -td.vsFpm);
    let score = 100;
    score -= clamp((fpm - 100) / 8, 0, 45);
    if (td.dist < 150) score -= (150 - td.dist) / 6;
    else if (td.dist > 650) score -= Math.min(25, (td.dist - 650) / 20);
    score -= clamp((Math.abs(td.ias - (td.vapp - 5)) - 10) * 0.8, 0, 15);
    const overweight = td.mass - aircraft.mlw;
    if (overweight > 0) score -= Math.min(15, 5 + overweight / aircraft.mlw * 100);
    if (td.flaps < lastFlap()) score -= 5;
    if (sim.tailStrike) score -= 25;
    if (td.noseFirst) score -= 15;
    score -= sim.bounces * 8;
    score -= Math.min(10, sim.overspeedTime);
    score = Math.round(clamp(score, 0, 100));
    const grade = fpm < 120 ? "BUTTER" : fpm < 250 ? "SMOOTH" : fpm < 420 ? "FIRM" : fpm < 700 ? "HARD" : "VERY HARD";
    const remaining = runway.end - sim.x;
    const notes = [];
    if (sim.tailStrike) notes.push("tail strike");
    if (td.noseFirst) notes.push("nose wheel first");
    if (sim.bounces) notes.push(`${sim.bounces} bounce${sim.bounces > 1 ? "s" : ""}`);
    if (td.flaps < lastFlap()) notes.push(`flaps not ${aircraft.flaps[lastFlap()].label}`);
    if (sim.overspeedTime > 1) notes.push(`${Math.round(sim.overspeedTime)} s overspeed`);
    if (overweight > 0) notes.push(`overweight landing, ${(overweight / 1000).toFixed(1)} t over the ${(aircraft.mlw / 1000).toFixed(0)} t limit`);
    return {
      score, grade,
      copy: `${runway === route.to ? "Brought the" : "Returned the"} ${aircraft.name} ${runway === route.to ? "into" : "to"} ${runway.name}, runway ${runway.runway}, in ${WEATHER[run.weather].label.toLowerCase()} conditions${run.time === "day" ? "" : ` at ${run.time}`}.${notes.length ? ` Penalties: ${notes.join(", ")}.` : " No extra penalties."}`,
      stats: [
        ["SINK RATE", `−${Math.round(fpm)} FPM`, fpm < 250 ? "good" : fpm < 500 ? "meh" : "bad"],
        ["SCORE", `${score} / 100`, score >= 80 ? "good" : score >= 55 ? "meh" : "bad"],
        ["TOUCHDOWN SPEED", `${Math.round(td.ias)} KT`, Math.abs(td.ias - (td.vapp - 5)) < 12 ? "good" : "meh"],
        ["TOUCHDOWN POINT", `${Math.round(td.dist)} M`, td.dist > 150 && td.dist < 650 ? "good" : "meh"],
        ["PITCH", `${(td.pitch / DEG).toFixed(1)}°`, td.pitch > 0 && td.pitch < TAIL_STRIKE ? "good" : "bad"],
        ["RUNWAY LEFT", `${Math.max(0, Math.round(remaining))} M`, remaining > 300 ? "good" : "meh"],
        ["FLIGHT TIME", clock(sim.time), ""],
        ["LANDING WEIGHT", `${(td.mass / 1000).toFixed(1)} T`, overweight > 0 ? "bad" : "good"],
      ],
    };
  }

  function takeoffReport() {
    const ac = aircraft;
    const rotate = sim.rotateIas ?? sim.liftoffIas ?? 0;
    const vr = sim.takeoffVr || vrKt();
    const clearance = (TAIL_STRIKE - sim.maxGroundPitch) / DEG;
    const runwayUsed = (sim.liftoffX ?? sim.x) - START_X;
    let score = 100;
    score -= clamp((Math.abs(rotate - vr) - 5) * 2, 0, 25);
    if (sim.tailStrike) score -= 40;
    else if (clearance < 1) score -= 10;
    if (sim.gearUpFt === null) score -= 15;
    else score -= clamp((sim.gearUpFt - 400) / 40, 0, 10);
    if (sim.sawAlphaFloor) score -= 20;
    score -= Math.min(10, sim.overspeedTime * 2);
    score = Math.round(clamp(score, 0, 100));
    const grade = score >= 90 ? "TEXTBOOK" : score >= 75 ? "GOOD" : score >= 55 ? "OK" : "ROUGH";
    const notes = [];
    if (Math.abs(rotate - vr) > 5) notes.push(rotate < vr ? `rotated early at ${Math.round(rotate)} kt` : `rotated late at ${Math.round(rotate)} kt`);
    if (sim.tailStrike) notes.push("tail strike");
    else if (clearance < 1) notes.push("tail came within 1° of the runway");
    if (sim.gearUpFt === null) notes.push("gear never retracted");
    else if (sim.gearUpFt > 400) notes.push(`gear up late at ${Math.round(sim.gearUpFt)} ft`);
    if (sim.sawAlphaFloor) notes.push("alpha floor: nose too high, too slow");
    if (sim.overspeedTime > 0.5) notes.push("flap or gear overspeed");
    return {
      score, grade,
      copy: `${aircraft.name} climbing through ${feet(TAKEOFF_GOAL_FT)} ft out of ${route.from.name} ${route.from.runway}.${notes.length ? ` Watch out: ${notes.join(", ")}.` : " Clean takeoff, no penalties."}`,
      stats: [
        ["ROTATE SPEED", `${Math.round(rotate)} KT`, Math.abs(rotate - vr) <= 5 ? "good" : "meh"],
        ["SCORE", `${score} / 100`, score >= 80 ? "good" : score >= 55 ? "meh" : "bad"],
        ["LIFTOFF SPEED", `${Math.round(sim.liftoffIas ?? 0)} KT`, ""],
        ["MAX PITCH ON RUNWAY", `${(sim.maxGroundPitch / DEG).toFixed(1)}° / ${(TAIL_STRIKE / DEG).toFixed(1)}°`, sim.tailStrike ? "bad" : clearance < 1 ? "meh" : "good"],
        ["GEAR UP AT", sim.gearUpFt === null ? "NEVER" : `${Math.round(sim.gearUpFt)} FT`, sim.gearUpFt !== null && sim.gearUpFt <= 400 ? "good" : "meh"],
        ["RUNWAY USED", `${Math.round(runwayUsed)} M`, ""],
        ["CLIMB RATE", `${Math.round(sim.goalFpm / 10) * 10} FPM`, sim.goalFpm > 1500 ? "good" : "meh"],
        ["TIME", clock(sim.time), ""],
      ],
    };
  }

  // Landing practice starts trimmed on the glideslope: solve lift = weight and thrust = drag for the requested speed.
  function setupFinal(distance, iasKt, { flap: flapIndex = lastFlap(), gear = true, above = 0 } = {}) {
    const ac = aircraft;
    const x = TOUCHDOWN_X - distance;
    const y = glidepathAlt(x) + above;
    const agl = y - route.to.elev;
    const rho = density(y);
    const tas = iasKt / KT / Math.sqrt(rho / RHO0);
    const wind = headwind(agl);
    const vx = tas - wind;
    const vy = -vx * TAN_GS;
    const gammaAir = Math.atan2(vy, vx + wind);
    const flap = flapConfig(flapIndex);
    const q = 0.5 * rho * tas * tas;
    const cl = sim.mass * G * Math.cos(gammaAir) / (q * ac.wingArea);
    const alpha = (cl - ac.cl0 - flap.cl) / ac.clAlpha;
    const drag = q * ac.wingArea * (ac.cd0 + flap.cd + (gear ? ac.gearCd : 0) + ac.inducedK * cl * cl);
    const thrust = drag + sim.mass * G * Math.sin(gammaAir);
    const available = ac.maxThrust * Math.pow(rho / RHO0, 0.75) * Math.max(0.5, 1 - 0.0026 * tas);
    const n1 = clamp((thrust / available - ac.idleThrust) / (1 - ac.idleThrust), 0, 1);
    Object.assign(sim, {
      x, y, vx, vy, pitch: alpha + gammaAir, throttle: n1, n1, flapIndex, flapPos: flapIndex,
      gearDown: gear, gearPos: gear ? 1 : 0, onGround: false, airborne: true, braking: false, maxAgl: agl, agl, ias: iasKt, tas,
      gamma: Math.atan2(vy, vx), fpaHold: Math.atan2(vy, vx), alpha, prevAglFt: agl * FT, vsFpm: vy * FPM,
    });
    Object.assign(sim.fg, { spd: vappKt(), spdTarget: vappKt(), alt: Math.round(route.interceptAlt * FT / 100) * 100, appr: true });
  }

  // ---------- view & camera ----------
  // The ground is drawn as a 2.5D plane: things further from the runway centreline sit at depth d < 1.
  // The renderer works in meters above the ground under the camera (view.ground).
  const LANE = 180; // camera distance to the runway centreline in meters
  const depthOf = (lateral) => LANE / (LANE + lateral);
  const view = { w: 1, h: 1, dpr: 1, dprCap: 2, frameMs: 0, ppm: 6, anchorX: 300, camX: 0, camY: 0, ground: 0, shake: 0, shakeX: 0, shakeY: 0, vdW: 1, vdH: 1 };
  const sx = (wx, d = 1) => view.anchorX + (wx - view.camX) * view.ppm * d + view.shakeX;
  const sy = (wy, d = 1) => view.h * 0.5 - (wy - view.camY) * view.ppm * d + view.shakeY;
  const worldXAt = (screenX, d) => view.camX + (screenX - view.anchorX) / (view.ppm * d);
  // Screen y of the terrain at world x (plus h meters), for something at depth d.
  const gy = (x, d = 1, h = 0) => sy(groundAt(x) - view.ground + h, d);
  const portrait = () => view.w < view.h;
  const basePpm = () => clamp(view.w * (portrait() ? 0.32 : 0.28), 120, 330) / (AIRCRAFT.a320.length * Math.sqrt(aircraft.length / AIRCRAFT.a320.length));

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, view.dprCap);
    view.w = Math.max(1, canvas.clientWidth);
    view.h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    view.vdW = Math.max(1, vdCanvas.clientWidth);
    view.vdH = Math.max(1, vdCanvas.clientHeight);
    vdCanvas.width = Math.round(view.vdW * view.dpr);
    vdCanvas.height = Math.round(view.vdH * view.dpr);
    view.ppm = basePpm();
  }

  function updateCamera(dt) {
    let zoom = sim.onGround ? 1 : lerp(1, 0.8, clamp(sim.agl / 400, 0, 1));
    let camX = sim.x;
    let anchor = portrait() ? 0.42 : 0.4;
    if (replay.active && replay.cam === "close") {
      zoom *= 1.7;
      anchor = 0.5;
    }
    if (replay.active && replay.cam === "tower") {
      zoom *= 0.65;
      camX = clamp(sim.x, replay.focusX - 40, replay.focusX + 60); // hold still while the aircraft crosses the frame
    }
    view.ppm += (basePpm() * zoom - view.ppm) * (1 - Math.exp(-dt * (replay.active ? 4 : 1.5)));
    view.anchorX = view.w * anchor;
    const groundFraction = portrait() ? 0.63 : 0.75;
    const minCamY = (groundFraction - 0.5) * view.h / view.ppm;
    view.camX = camX;
    view.ground = groundAt(camX);
    const agl = sim.y - view.ground;
    if (replay.active && replay.cam === "tower") view.camY = Math.max(minCamY, agl - 0.22 * view.h / view.ppm);
    else if (replay.active && replay.cam === "close") view.camY = Math.max(agl + 2, minCamY * 0.6);
    else view.camY = Math.max(agl + 4, minCamY);
    view.shake *= Math.exp(-dt * 5);
    view.shakeX = (Math.random() - 0.5) * view.shake;
    view.shakeY = (Math.random() - 0.5) * view.shake;
  }

  // ---------- environment: light, haze and colour for the chosen weather and time ----------
  const env = { ambient: [1, 1, 1], light: 1, haze: [192, 208, 206], hazeBoost: 1, glow: 1, paint: "", night: false, lightsOn: false };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
  const lit = (c) => [c[0] * env.ambient[0], c[1] * env.ambient[1], c[2] * env.ambient[2]];
  const grayOf = (c) => { const v = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return [v, v, v + 6]; };
  const hazeAt = (lateral) => clamp((Math.log10(Math.max(lateral, 150) / 150) / 2.6) * env.hazeBoost, 0, 0.95);
  const hazed = (color, lateral, alpha = 1) => rgb(mix(lit(color), env.haze, hazeAt(lateral)), alpha);
  const FIELD_COLORS = [[118, 156, 92], [138, 166, 96], [162, 168, 100], [108, 144, 86], [148, 158, 88], [96, 132, 80], [172, 160, 104]];
  const GRASS = [124, 160, 100];
  const WINDOW_LIGHT = [255, 208, 140];

  function updateEnv() {
    const time = TIMES[run.time];
    const w = weather();
    env.time = time;
    env.ambient = time.ambient.map((v) => v * (1 - w.dark));
    env.light = (env.ambient[0] + env.ambient[1] + env.ambient[2]) / 3;
    env.night = env.light < 0.45;
    env.lightsOn = run.time !== "day" || w.fog > 0 || w.rain > 0;
    const altitude = clamp((view.camY + view.ground) / 4000, 0, 1);
    const cloudGray = w.gray * (1 - altitude * 0.6);
    env.skyTop = mix(mix(time.skyTop, time.highTop, altitude), grayOf(time.skyTop), cloudGray);
    env.skyHorizon = mix(mix(time.skyHorizon, time.highHorizon, altitude), grayOf(time.skyHorizon), cloudGray);
    env.haze = mix(mix(time.haze, time.fog, w.fog ? 0.85 : w.rain ? 0.45 : 0), grayOf(time.haze), w.rain * 0.3);
    env.hazeBoost = w.fog ? 2.4 : w.rain ? 1.5 : 1;
    env.glow = time.glow * (w.fog ? 1.5 : 1) * (w.rain ? 1.2 : 1);
    env.shadow = time.shadow * (w.rain || w.fog ? 0.25 : w.cloud > 1.2 ? 0.6 : 1);
    env.paint = rgb(lit([236, 238, 232]), 0.92);
    const sunColor = time.sun ? time.sun[2] : [255, 255, 255];
    env.cloudShade = lit(w.rain ? [118, 126, 136] : [192, 205, 218]);
    env.cloudLight = mix(lit(w.rain ? [168, 174, 182] : [250, 251, 252]), lit(sunColor), time.cloudTint);
  }

  // ---------- world rendering ----------
  const glows = [];
  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    updateEnv();
    drawSky();
    drawTerrain();
    drawClouds(false);
    drawRunwayArea();
    drawShadow();
    drawFog();
    drawGlows();
    drawLandingLightSpot();
    drawAircraft();
    drawParticles();
    drawClouds(true);
    if (sim.inCloud) {
      ctx.fillStyle = rgb(lit([236, 240, 244]), 0.32);
      ctx.fillRect(0, 0, view.w, view.h);
    }
    drawRain();
  }

  function drawSky() {
    const { w, h } = view;
    const time = env.time;
    const horizonY = h * 0.5;
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, rgb(env.skyTop));
    sky.addColorStop(1, rgb(env.skyHorizon));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY + 1);
    const ground = ctx.createLinearGradient(0, horizonY, 0, h);
    ground.addColorStop(0, rgb(env.haze));
    ground.addColorStop(0.25, rgb(mix(env.haze, lit([128, 156, 110]), 0.6)));
    ground.addColorStop(1, rgb(lit([110, 146, 92])));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    const clearSky = 1 - weather().gray;
    if (time.stars && clearSky > 0.3) {
      const t = performance.now() / 1000;
      for (let i = 0; i < 140; i += 1) {
        const y = hash(i + 300) * horizonY * 0.95;
        const twinkle = 0.6 + 0.4 * Math.sin(t * (1 + hash(i) * 3) + i);
        ctx.fillStyle = `rgba(235,240,255,${time.stars * clearSky * twinkle * (0.3 + 0.7 * (1 - y / horizonY))})`;
        const size = hash(i + 700) < 0.85 ? 1 : 1.8;
        ctx.fillRect((((hash(i + 100) * (w + 200) - view.camX * view.ppm * 0.0004) % (w + 200)) + w + 200) % (w + 200) - 100, y, size, size);
      }
    }
    if (time.moon) {
      const mx = w * time.moon[0];
      const my = h * time.moon[1];
      const moon = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.16);
      moon.addColorStop(0, `rgba(230,236,255,${0.5 * clearSky})`);
      moon.addColorStop(1, "rgba(230,236,255,0)");
      ctx.fillStyle = moon;
      ctx.fillRect(mx - h * 0.16, my - h * 0.16, h * 0.32, h * 0.32);
      ctx.fillStyle = `rgba(240,242,250,${0.4 + 0.55 * clearSky})`;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(8, h * 0.028), 0, Math.PI * 2);
      ctx.fill();
    }
    if (time.sun) {
      const [fx, fy, color, size] = time.sun;
      const sunX = w * fx;
      const sunY = h * fy;
      const strength = clearSky;
      const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * size);
      sun.addColorStop(0, rgb(color, 0.95 * strength));
      sun.addColorStop(0.08, rgb(color, 0.7 * strength));
      sun.addColorStop(0.3, rgb(color, 0.14 * strength));
      sun.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, horizonY);
    }

    ctx.strokeStyle = rgb(lit([255, 255, 255]), 0.35 * clearSky);
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i += 1) {
      const span = w + 400;
      const x = (((hash(i + 40) * span - view.camX * view.ppm * 0.0015) % span) + span) % span - 200;
      const y = h * (0.08 + hash(i + 50) * 0.22);
      ctx.lineWidth = 1 + hash(i + 60) * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 80, y - 6, x + 160 + hash(i) * 120, y + 2);
      ctx.stroke();
    }
  }

  const BANDS = [40000, 18000, 9000, 4500, 2400, 1300, 700, 420, 260, 150, 60, 22.5];
  // mountain: extra ridge height where the route's terrain points are mountainous (the Alps).
  const RIDGES = [
    { lateral: 36000, amp: 420, mountain: 2000, color: [150, 172, 178], freq: 0.00009 },
    { lateral: 11000, amp: 170, mountain: 2300, color: [118, 148, 124], freq: 0.0003 },
    { lateral: 3200, amp: 46, mountain: 1300, color: [96, 134, 90], freq: 0.0011 },
    { lateral: 1400, amp: 0, mountain: 650, color: [92, 124, 86], freq: 0.0024 }, // valley walls, only in hills and mountains
  ];
  const ROCK = [92, 98, 110];
  const SNOW = [244, 247, 250];
  const SNOWLINE = 1900; // meters above sea level
  const WATER = [40, 88, 124];
  const WATER_FAR = [70, 116, 150];
  const ROWS = [
    { lateral: 4200, cell: 120, city: true },
    { lateral: 1800, cell: 70 }, { lateral: 1000, cell: 52 }, { lateral: 560, cell: 34 }, { lateral: 360, cell: 30 },
    { lateral: 230, cell: 26 }, { lateral: 130, cell: 24 }, { lateral: 75, cell: 22 },
  ];
  const AIRPORT_GROUND = 1300;
  const inAirportZone = (x) => runways.some((r) => x >= r.zone[0] && x <= r.zone[1]);
  const townness = (x) => 0.5 + 0.5 * Math.sin(x * 0.00042 + 1.3) * Math.sin(x * 0.00017 + 0.4);
  const visibleRange = (d, margin = 0) => [worldXAt(-margin, d), worldXAt(view.w + margin, d)];
  const apronOf = (runway) => [runway.start + runway.length * 0.18, runway.start + runway.length * 0.66];

  function groundQuad(x0, x1, farLateral, nearLateral) {
    const dF = depthOf(farLateral);
    const dN = depthOf(nearLateral);
    ctx.beginPath();
    ctx.moveTo(sx(x0, dF), gy(x0, dF));
    ctx.lineTo(sx(x1, dF), gy(x1, dF));
    ctx.lineTo(sx(x1, dN), gy(x1, dN));
    ctx.lineTo(sx(x0, dN), gy(x0, dN));
    ctx.closePath();
  }
  // 0 over open sea, rising to 1 within 5 km of the coast: flattens hills and ridges over water.
  function landFactor(x) {
    let distance = Infinity;
    const points = route.themes;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i].theme !== "sea") continue;
      const start = points[i].x;
      const end = points[i + 1] ? points[i + 1].x : Infinity;
      if (x >= start && x <= end) return 0;
      distance = Math.min(distance, Math.abs(x - start), Math.abs(x - end));
    }
    return clamp(distance / 5000, 0, 1);
  }
  const highestGround = () => Math.max(...route.terrain.map((p) => p.elev)) - view.ground;

  function subtractZones(x0, x1) {
    let segments = [[x0, x1]];
    for (const runway of runways) {
      const [z0, z1] = runway.zone;
      segments = segments.flatMap(([a, b]) => {
        if (b <= z0 || a >= z1) return [[a, b]];
        const parts = [];
        if (a < z0) parts.push([a, z0]);
        if (b > z1) parts.push([z1, b]);
        return parts;
      });
    }
    return segments;
  }

  // Terrain is painted far-to-near: field bands, ridges and scenery objects are sorted by distance from the runway.
  function drawTerrain() {
    const drawables = [];
    for (let i = 0; i < BANDS.length - 1; i += 1) drawables.push({ key: BANDS[i], draw: () => drawBand(BANDS[i], BANDS[i + 1]) });
    for (const ridge of RIDGES) drawables.push({ key: ridge.lateral, draw: () => drawRidge(ridge) });
    drawables.push({ key: AIRPORT_GROUND - 0.01, draw: drawAirportGround });
    for (const row of ROWS) collectRow(row, drawables);
    for (const runway of runways) collectAirportObjects(runway, drawables);
    drawables.sort((a, b) => b.key - a.key);
    for (const drawable of drawables) drawable.draw();
  }

  function drawBand(far, near) {
    const dF = depthOf(far);
    if (sy(Math.max(0, highestGround()), dF) > view.h + 2) return;
    const cell = clamp(near * 0.35, 120, 6000);
    const [x0, x1] = visibleRange(dF, 40);
    const first = Math.floor(x0 / cell);
    const last = Math.ceil(x1 / cell);
    if (last - first > 80) return;
    for (let c = first; c <= last; c += 1) {
      const a = c * cell;
      const theme = themeAt(a + cell / 2);
      const town = theme === "city" ? hash2(c, near) < 0.85 : theme === "farm" && townness(a) > 0.82 && hash2(c, near) < 0.5;
      const pick = (colors) => colors[Math.floor(hash2(c, far) * colors.length)];
      const color = theme === "sea" ? (far > 3000 ? WATER_FAR : WATER)
        : town ? pick([[150, 150, 138], [138, 136, 130], [160, 154, 142]])
        : theme === "alps" ? pick([[104, 140, 92], [92, 128, 84], [128, 142, 104], [116, 122, 112]])
        : theme === "hills" ? pick([[122, 140, 90], [138, 140, 98], [110, 128, 84], [146, 132, 96]])
        : pick(FIELD_COLORS);
      ctx.fillStyle = hazed(color, ((far + near) / 2) * (theme === "sea" ? 0.45 : 1));
      const segments = near < AIRPORT_GROUND ? subtractZones(a, a + cell) : [[a, a + cell]];
      for (const [s0, s1] of segments) {
        groundQuad(s0, s1 + 0.5, far, near);
        ctx.fill();
      }
      // Town and farm lights at night: dots on the band, brighter for towns.
      if (env.night && theme !== "sea" && (town || hash2(c, far + 3) < 0.25)) {
        const count = town ? (theme === "city" ? 30 : 14) : 2;
        for (let i = 0; i < count; i += 1) {
          const lateral = lerp(near, far, hash2(c * 31 + i, far));
          const d = depthOf(lateral);
          const x = a + hash2(c * 17 + i, near) * cell;
          if (segments.length !== 1 || inAirportZone(x)) continue;
          const px = sx(x, d);
          if (px < -4 || px > view.w + 4) continue;
          ctx.fillStyle = `rgba(255,${200 + hash2(i, c) * 40},140,${0.5 + hash2(c, i) * 0.4})`;
          ctx.fillRect(px, gy(x, d) - 1, 1.6, 1.6);
        }
      }
    }
  }

  // Side ridges sit on the terrain. In mountain areas the outline turns peaky (ridged noise) and the
  // fill fades from snow above the snowline through bare rock to forest at the base.
  const ridged = (f) => (1 - Math.abs(Math.sin(f))) ** 1.6;
  function drawRidge(ridge) {
    const d = depthOf(ridge.lateral);
    const tops = [];
    const bases = [];
    let highest = Infinity;
    let lowestBase = -Infinity;
    for (let x = -10; x <= view.w + 10; x += 5) {
      const wx = worldXAt(x, d);
      const f = wx * ridge.freq;
      const m = mountainsAt(wx);
      const soft = 0.55 + 0.3 * Math.sin(f + ridge.lateral) + 0.15 * Math.sin(f * 2.7 + 1.3) + 0.08 * Math.sin(f * 7.3);
      const peaks = 0.2 + 0.55 * ridged(f * 1.7 + ridge.lateral) + 0.3 * ridged(f * 4.3 + 1.1) + 0.12 * ridged(f * 11.7 + 2.3);
      const ground = groundAt(wx) - view.ground;
      const height = (ridge.amp * soft + m * ridge.mountain * peaks) * landFactor(wx);
      const top = sy(ground + height, d);
      const base = sy(ground, d) + 2;
      tops.push([x, top]);
      bases.push([x, base]);
      highest = Math.min(highest, top);
      lowestBase = Math.max(lowestBase, base);
    }
    if (highest > view.h || highest >= lowestBase - 1) return;
    const m = mountainsAt(view.camX);
    const rock = mix(ridge.color, ROCK, m);
    const span = Math.max(1, lowestBase - highest);
    if (m > 0.05) {
      const fill = ctx.createLinearGradient(0, highest, 0, lowestBase);
      const snowAt = clamp((sy(SNOWLINE - view.ground, d) - highest) / span, 0, 1);
      const haze = ridge.lateral * 0.4;
      if (snowAt > 0) {
        fill.addColorStop(0, hazed(SNOW, haze * 0.6));
        fill.addColorStop(Math.max(0, snowAt - 0.01), hazed(mix(SNOW, rock, 0.15), haze * 0.6));
        fill.addColorStop(Math.min(1, snowAt + 0.01), hazed(mix(rock, [150, 150, 156], 0.25), haze));
      } else {
        fill.addColorStop(0, hazed(mix(rock, [150, 150, 156], 0.25), haze));
      }
      fill.addColorStop(Math.max(snowAt + 0.02, 0.65), hazed(rock, haze));
      fill.addColorStop(1, hazed([62, 92, 64], haze));
      ctx.fillStyle = fill;
    } else {
      ctx.fillStyle = hazed(rock, ridge.lateral);
    }
    ctx.beginPath();
    tops.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = bases.length - 1; i >= 0; i -= 1) ctx.lineTo(bases[i][0], bases[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function drawAirportGround() {
    for (const runway of runways) {
      const [z0, z1] = runway.zone;
      ctx.fillStyle = hazed(GRASS, 300);
      groundQuad(z0, z1, AIRPORT_GROUND, 22.5);
      ctx.fill();
      const paved = (x0, x1, far, near) => {
        ctx.fillStyle = hazed([136, 140, 138], (far + near) / 2);
        groundQuad(x0, x1, far, near);
        ctx.fill();
      };
      paved(runway.start - 60, runway.end + 60, 108, 86);
      const dF = depthOf(86);
      const dN = depthOf(22.5);
      for (let x = runway.start + 400; x < runway.end - 200; x += 600) {
        ctx.beginPath();
        ctx.moveTo(sx(x + 60, dF), gy(x + 60, dF));
        ctx.lineTo(sx(x + 100, dF), gy(x + 100, dF));
        ctx.lineTo(sx(x + 40, dN), gy(x + 40, dN));
        ctx.lineTo(sx(x, dN), gy(x, dN));
        ctx.closePath();
        ctx.fill();
      }
      const [a0, a1] = apronOf(runway);
      paved(a0, a1, 290, 140);
      if (env.lightsOn) {
        for (let x = runway.start - 60; x <= runway.end + 60; x += 60) drawLight(x, 108, 0.3, [90, 150, 255], 0.2, 2);
      }
    }
  }

  function collectRow(row, drawables) {
    const d = depthOf(row.lateral);
    if (sy(Math.max(0, highestGround()) + 30, d) > view.h) return;
    const [x0, x1] = visibleRange(d, 60);
    const first = Math.floor(x0 / row.cell);
    const last = Math.ceil(x1 / row.cell);
    if (last - first > 120) return;
    for (let c = first; c <= last; c += 1) {
      const x = (c + hash2(c, row.lateral + 1) * 0.6) * row.cell;
      if (row.lateral < AIRPORT_GROUND && inAirportZone(x)) continue;
      const v = hash2(c, row.lateral);
      const theme = themeAt(x);
      const lateral = row.lateral + (hash2(c, row.lateral + 2) - 0.5) * row.cell * 0.8;
      const add = (draw) => drawables.push({ key: lateral, draw });
      if (row.city) {
        if (theme === "city" && v < 0.8) add(() => drawBuilding(x, lateral, c, true));
        continue;
      }
      if (theme === "sea") {
        if (v < 0.035) add(() => drawShip(x, lateral, c));
      } else if (theme === "city") {
        if (v < 0.78) add(() => drawBuilding(x, lateral, c, row.lateral > 900));
        else if (v < 0.86) add(() => drawTree(x, lateral, c));
      } else if (theme === "alps") {
        if (v < 0.04) add(() => drawHouse(x, lateral, c));
        else if (v < 0.62) add(() => drawTree(x, lateral, c, true));
      } else if (theme === "hills") {
        if (v < 0.04) add(() => drawHouse(x, lateral, c));
        else if (v < 0.3) add(() => drawTree(x, lateral, c));
      } else {
        const town = townness(x);
        if (v < 0.06 + town * 0.3) add(() => drawHouse(x, lateral, c));
        else if (v < 0.55 - town * 0.25) add(() => drawTree(x, lateral, c));
      }
    }
  }

  function collectAirportObjects(runway, drawables) {
    const [z0, z1] = runway.zone;
    const [v0, v1] = visibleRange(depthOf(400), 200);
    if (z1 < v0 || z0 > v1) return;
    const [a0, a1] = apronOf(runway);
    const terminalEnd = lerp(a0, a1, 0.62);
    drawables.push({ key: 330, draw: () => drawTerminal(a0 + 40, terminalEnd, 330) });
    drawables.push({ key: 340, draw: () => drawHangar(terminalEnd + 120, terminalEnd + 210, 340) });
    drawables.push({ key: 345, draw: () => drawHangar(terminalEnd + 240, terminalEnd + 330, 345) });
    drawables.push({ key: 300, draw: () => drawTower(lerp(a0, a1, 0.8), 300, runway.tower) });
    // A mixed fleet at the gates; each stand is as long as the aircraft parked on it.
    for (let x = a0 + 40, i = 0; x < terminalEnd - 30; i += 1) {
      const pick = hash2(i, runway.start + 9);
      const type = pick < 0.15 ? AIRCRAFT.b744 : pick < 0.27 ? AIRCRAFT.a343 : pick < 0.4 ? AIRCRAFT.b722 : pick < 0.62 ? AIRCRAFT.b733 : AIRCRAFT.a320;
      const parkedX = x + type.length / 2;
      x += type.length + 22;
      if (hash2(i, runway.start) < 0.22) continue;
      drawables.push({ key: 205, draw: () => drawParked(type, parkedX, 205, hash2(i, 3) < 0.5) });
    }
    drawables.push({ key: 70, draw: () => drawWindsock(runway.start + 280, 70) });
  }

  function offscreen(x, d, halfWidth) {
    const screenX = sx(x, d);
    const half = halfWidth * view.ppm * d;
    return screenX + half < -20 || screenX - half > view.w + 20;
  }

  function drawTree(x, lateral, seed, conifer = false) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 8)) return;
    const s = view.ppm * d;
    const baseX = sx(x, d);
    const baseY = gy(x, d);
    const height = 7 + hash2(seed, 5) * 9;
    const tone = [70 + hash2(seed, 6) * 30, 110 + hash2(seed, 7) * 30, 64 + hash2(seed, 8) * 20];
    if (conifer || hash2(seed, 9) < 0.3) {
      ctx.fillStyle = hazed(mix(tone, [40, 80, 60], 0.4), lateral);
      ctx.beginPath();
      ctx.moveTo(baseX - height * 0.28 * s, baseY);
      ctx.lineTo(baseX, baseY - height * 1.25 * s);
      ctx.lineTo(baseX + height * 0.28 * s, baseY);
      ctx.closePath();
      ctx.fill();
      return;
    }
    ctx.fillStyle = hazed([96, 78, 60], lateral);
    ctx.fillRect(baseX - 0.3 * s, baseY - height * 0.45 * s, 0.6 * s, height * 0.45 * s);
    ctx.fillStyle = hazed(tone, lateral);
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - height * 0.62 * s, height * 0.36 * s, height * 0.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hazed(mix(tone, [210, 230, 160], 0.18), lateral);
    ctx.beginPath();
    ctx.ellipse(baseX - height * 0.1 * s, baseY - height * 0.72 * s, height * 0.2 * s, height * 0.22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const WALLS = [[232, 222, 202], [212, 192, 170], [196, 202, 204], [226, 210, 186]];
  const ROOFS = [[150, 82, 62], [92, 92, 98], [122, 72, 56]];
  function drawHouse(x, lateral, seed) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 10)) return;
    const s = view.ppm * d;
    const width = (8 + hash2(seed, 11) * 7) * s;
    const wall = (5 + hash2(seed, 12) * 3) * s;
    const roof = (3 + hash2(seed, 13) * 2) * s;
    const baseX = sx(x, d);
    const baseY = gy(x, d);
    ctx.fillStyle = hazed(WALLS[Math.floor(hash2(seed, 14) * WALLS.length)], lateral);
    ctx.fillRect(baseX - width / 2, baseY - wall, width, wall);
    ctx.fillStyle = hazed(ROOFS[Math.floor(hash2(seed, 15) * ROOFS.length)], lateral);
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2 - 0.6 * s, baseY - wall);
    ctx.lineTo(baseX - width * 0.2, baseY - wall - roof);
    ctx.lineTo(baseX + width * 0.2, baseY - wall - roof);
    ctx.lineTo(baseX + width / 2 + 0.6 * s, baseY - wall);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 2; i += 1) {
      const lightOn = env.night && hash2(seed, 20 + i) < 0.6;
      ctx.fillStyle = lightOn ? rgb(WINDOW_LIGHT, 0.9) : hazed([70, 86, 96], lateral);
      ctx.fillRect(baseX - width * 0.3 + i * width * 0.42, baseY - wall * 0.7, width * 0.16, wall * 0.3);
    }
  }

  // City blocks; far rows get towers up to ~250 m. Lit windows at night.
  function drawBuilding(x, lateral, seed, tall) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 40)) return;
    const s = view.ppm * d;
    const r = hash2(seed, 31);
    const height = tall ? (r < 0.15 ? 120 + hash2(seed, 32) * 130 : 25 + r * 60) : 8 + r * 22;
    const width = (tall ? 22 + hash2(seed, 33) * 26 : 14 + hash2(seed, 33) * 18) * s;
    const baseX = sx(x, d);
    const baseY = gy(x, d);
    const tones = [[176, 178, 176], [150, 156, 162], [196, 190, 178], [128, 136, 146], [168, 160, 150]];
    ctx.fillStyle = hazed(tones[Math.floor(hash2(seed, 34) * tones.length)], lateral);
    ctx.fillRect(baseX - width / 2, baseY - height * s, width, height * s);
    if (tall && r < 0.15) {
      ctx.beginPath();
      ctx.moveTo(baseX - width / 2, baseY - height * s);
      ctx.lineTo(baseX, baseY - (height + 18) * s);
      ctx.lineTo(baseX + width / 2, baseY - height * s);
      ctx.fill();
    }
    if (env.night) {
      ctx.fillStyle = rgb(WINDOW_LIGHT, 0.75);
      const rows = Math.min(12, Math.floor(height / 8));
      for (let i = 0; i < rows; i += 1) {
        if (hash2(seed + i, 35) < 0.4) continue;
        ctx.fillRect(baseX - width * 0.35, baseY - (i + 0.7) * (height / rows) * s, width * 0.7 * (0.3 + hash2(seed, i) * 0.7), Math.max(1, 1.2 * s));
      }
    } else if (s > 0.6) {
      ctx.fillStyle = hazed([96, 120, 140], lateral, 0.5);
      for (let i = 1; i < Math.floor(height / 6); i += 2) ctx.fillRect(baseX - width * 0.4, baseY - i * 6 * s, width * 0.8, Math.max(1, 1.4 * s));
    }
  }

  function drawShip(x, lateral, seed) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 120)) return;
    const s = view.ppm * d;
    const length = (60 + hash2(seed, 41) * 160) * s;
    const baseX = sx(x, d);
    const baseY = gy(x, d);
    ctx.fillStyle = hazed([60, 64, 72], lateral);
    ctx.beginPath();
    ctx.moveTo(baseX - length / 2, baseY - 6 * s);
    ctx.lineTo(baseX + length / 2 + 6 * s, baseY - 6 * s);
    ctx.lineTo(baseX + length / 2 - 4 * s, baseY);
    ctx.lineTo(baseX - length / 2 + 4 * s, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hazed(hash2(seed, 42) < 0.5 ? [200, 70, 60] : [70, 110, 160], lateral);
    for (let i = 0; i < 4; i += 1) ctx.fillRect(baseX - length * 0.35 + i * length * 0.15, baseY - 12 * s, length * 0.12, 6 * s);
    ctx.fillStyle = hazed([230, 232, 228], lateral);
    ctx.fillRect(baseX + length * 0.3, baseY - 20 * s, length * 0.1, 14 * s);
    ctx.strokeStyle = rgb(lit([240, 248, 255]), 0.5);
    ctx.lineWidth = Math.max(1, 0.6 * s);
    ctx.beginPath();
    ctx.moveTo(baseX - length / 2 - 30 * s, baseY + 1);
    ctx.lineTo(baseX - length / 2, baseY + 1);
    ctx.stroke();
    if (env.night) glows.push([baseX + length * 0.35, baseY - 20 * s, 1.4, [255, 230, 190]]);
  }

  function drawTerminal(x0, x1, lateral) {
    const d = depthOf(lateral);
    const left = sx(x0, d);
    const right = sx(x1, d);
    if (right < -20 || left > view.w + 20) return;
    const s = view.ppm * d;
    const baseY = gy(x0, d);
    const height = 22 * s;
    ctx.fillStyle = hazed([214, 218, 214], lateral);
    ctx.fillRect(left, baseY - height, right - left, height);
    ctx.fillStyle = env.lightsOn ? rgb(mix(lit([120, 156, 178]), WINDOW_LIGHT, env.night ? 0.75 : 0.35)) : hazed([120, 156, 178], lateral);
    ctx.fillRect(left, baseY - height * 0.78, right - left, height * 0.42);
    ctx.fillStyle = hazed([170, 176, 174], lateral);
    ctx.fillRect(left - 3 * s, baseY - height - 2 * s, right - left + 6 * s, 2.4 * s);
    ctx.fillStyle = hazed([180, 186, 184], lateral);
    for (let x = x0 + 30; x < x1 - 10; x += 62) {
      const gateX = sx(x, d);
      ctx.fillRect(gateX, baseY - height * 0.42, 3 * s, height * 0.42);
      ctx.fillRect(gateX, baseY - height * 0.46, 26 * s, 3.2 * s);
    }
  }

  function drawHangar(x0, x1, lateral) {
    const d = depthOf(lateral);
    const left = sx(x0, d);
    const right = sx(x1, d);
    if (right < -20 || left > view.w + 20) return;
    const s = view.ppm * d;
    const baseY = gy(x0, d);
    const wall = 16 * s;
    ctx.fillStyle = hazed([170, 178, 182], lateral);
    ctx.fillRect(left, baseY - wall, right - left, wall);
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, baseY - wall, (right - left) / 2, 10 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = hazed([130, 138, 142], lateral);
    ctx.lineWidth = Math.max(1, 0.4 * s);
    ctx.beginPath();
    for (let x = left + (right - left) * 0.12; x < right; x += (right - left) * 0.19) {
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - wall * 0.85);
    }
    ctx.stroke();
    if (env.night) {
      ctx.fillStyle = rgb(WINDOW_LIGHT, 0.35);
      ctx.fillRect(left + (right - left) * 0.12, baseY - wall * 0.85, (right - left) * 0.76, wall * 0.85);
    }
  }

  function drawTower(x, lateral, height) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 12)) return;
    const s = view.ppm * d;
    const baseX = sx(x, d);
    const baseY = gy(x, d);
    ctx.fillStyle = hazed([222, 224, 218], lateral);
    ctx.fillRect(baseX - 3.5 * s, baseY - height * s, 7 * s, height * s);
    ctx.fillStyle = hazed([196, 200, 196], lateral);
    ctx.fillRect(baseX - 9 * s, baseY - (height + 2) * s, 18 * s, 3 * s);
    ctx.fillStyle = env.lightsOn ? rgb(mix(lit([60, 88, 104]), [150, 220, 200], env.night ? 0.6 : 0.2)) : hazed([60, 88, 104], lateral);
    ctx.beginPath();
    ctx.moveTo(baseX - 9 * s, baseY - (height + 2) * s);
    ctx.lineTo(baseX - 11 * s, baseY - (height + 9) * s);
    ctx.lineTo(baseX + 11 * s, baseY - (height + 9) * s);
    ctx.lineTo(baseX + 9 * s, baseY - (height + 2) * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hazed([200, 204, 200], lateral);
    ctx.fillRect(baseX - 10 * s, baseY - (height + 11) * s, 20 * s, 2 * s);
    ctx.fillRect(baseX - 0.3 * s, baseY - (height + 18) * s, 0.6 * s, 7 * s);
    if (Math.floor(performance.now() / 700) % 2) {
      const top = baseY - (height + 18) * s;
      ctx.fillStyle = "rgba(255,70,60,0.95)";
      ctx.beginPath();
      ctx.arc(baseX, top, Math.max(1.2, 0.7 * s), 0, Math.PI * 2);
      ctx.fill();
      glows.push([baseX, top, Math.max(1.2, 0.7 * s), [255, 70, 60]]);
    }
  }

  function drawParked(type, x, lateral, flip) {
    const d = depthOf(lateral);
    if (offscreen(x, d, type.length * 0.6)) return;
    ctx.save();
    ctx.globalAlpha = 1 - hazeAt(lateral) * 0.8;
    drawSprite(type, sx(x, d), gy(x, d), view.ppm * d, flip);
    ctx.restore();
  }

  function drawWindsock(x, lateral) {
    const d = depthOf(lateral);
    if (offscreen(x, d, 6)) return;
    const s = view.ppm * d;
    const baseX = sx(x, d);
    const top = gy(x, d, 6);
    ctx.strokeStyle = rgb(lit([220, 220, 220]), 0.9);
    ctx.lineWidth = Math.max(1, 0.25 * s);
    ctx.beginPath();
    ctx.moveTo(baseX, gy(x, d));
    ctx.lineTo(baseX, top);
    ctx.stroke();
    const strength = clamp(weather().wind / 8, 0.3, 1.2);
    const sway = Math.sin(performance.now() / (weather().gust > 2 ? 160 : 400)) * 0.12 * s * strength;
    for (let i = 0; i < 5; i += 1) {
      const half = (0.6 - i * 0.08) * s;
      const droop = (1.2 - strength) * 0.3 * s * i;
      ctx.fillStyle = rgb(lit(i % 2 ? [244, 241, 234] : [240, 122, 44]));
      ctx.beginPath();
      ctx.moveTo(baseX - i * 0.8 * s, top - half + sway * i + droop);
      ctx.lineTo(baseX - (i + 1) * 0.8 * s, top - half + 0.08 * s + sway * (i + 1) + droop);
      ctx.lineTo(baseX - (i + 1) * 0.8 * s, top + half - 0.08 * s + sway * (i + 1) + droop);
      ctx.lineTo(baseX - i * 0.8 * s, top + half + sway * i + droop);
      ctx.fill();
    }
  }

  // The strip nearest the camera follows the terrain profile; over the sea it is water.
  function drawRunwayArea() {
    const d = depthOf(22.5);
    const samples = [];
    for (let x = -12; x <= view.w + 12; x += 8) {
      const wx = worldXAt(x, d);
      samples.push({ x, y: gy(wx, d), sea: themeAt(wx) === "sea" && !inAirportZone(wx) });
    }
    if (Math.min(...samples.map((p) => p.y)) > view.h) return;
    for (const sea of [false, true]) {
      const fill = ctx.createLinearGradient(0, view.h * 0.5, 0, view.h);
      fill.addColorStop(0, rgb(lit(sea ? [70, 112, 140] : [120, 156, 98])));
      fill.addColorStop(1, rgb(lit(sea ? [44, 82, 110] : [96, 134, 78])));
      ctx.fillStyle = fill;
      let open = false;
      ctx.beginPath();
      samples.forEach((point, i) => {
        if (point.sea !== sea) {
          if (open) {
            ctx.lineTo(point.x, point.y);
            ctx.lineTo(point.x, view.h);
            ctx.lineTo(samples[i - 1].x, view.h);
            open = false;
          }
          return;
        }
        if (!open) {
          ctx.moveTo(point.x - 8, view.h);
          ctx.lineTo(point.x - 8, point.y);
          open = true;
        }
        ctx.lineTo(point.x, point.y);
      });
      if (open) {
        const last = samples[samples.length - 1];
        ctx.lineTo(last.x, view.h);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (samples.some((p) => p.sea)) drawWaves();
    for (const runway of runways) drawRunway(runway);
    drawForeground();
  }
  function drawWaves() {
    const t = performance.now() / 1000;
    ctx.strokeStyle = rgb(mix(lit([210, 226, 236]), [255, 250, 230], env.time.sun ? 0.3 : 0), 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [lateral, cell] of [[10, 9], [-30, 11], [-70, 14]]) {
      const d = depthOf(lateral);
      const [x0, x1] = visibleRange(d, 10);
      for (let c = Math.floor(x0 / cell); c <= Math.ceil(x1 / cell); c += 1) {
        const x = (c + hash2(c, lateral)) * cell;
        if (themeAt(x) !== "sea") continue;
        const px = sx(x + Math.sin(t + c) * 1.5, d);
        const py = gy(x, d) + (hash2(c, lateral + 1) - 0.5) * 6;
        ctx.moveTo(px, py);
        ctx.lineTo(px + (2 + hash2(c, 5) * 4) * view.ppm * d * 0.3, py);
      }
    }
    ctx.stroke();
  }

  function markQuad(x0, x1, far, near, color) {
    ctx.fillStyle = color;
    groundQuad(x0, x1, far, near);
    ctx.fill();
  }

  // Lights are emissive: drawn unlit, then given an extra bloom pass at night and in fog.
  function drawLight(x, lateral, height, color, radius = 0.32, glow = 2.6) {
    const d = depthOf(lateral);
    const screenX = sx(x, d);
    if (screenX < -10 || screenX > view.w + 10) return;
    const screenY = gy(x, d, height);
    const r = Math.max(1, radius * view.ppm * d);
    ctx.fillStyle = rgb(color, 0.25);
    ctx.beginPath();
    ctx.arc(screenX, screenY, r * glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(color);
    ctx.beginPath();
    ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
    ctx.fill();
    glows.push([screenX, screenY, r * Math.min(glow, 3), color]);
  }

  // One pre-rendered halo per light colour; scaling an image is far cheaper than a gradient per light.
  const glowSprites = new Map();
  function glowSprite(color) {
    const key = color.join();
    let sprite = glowSprites.get(key);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const c = sprite.getContext("2d");
      const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, rgb(color, 1));
      glow.addColorStop(0.12, rgb(color, 0.9));
      glow.addColorStop(0.35, rgb(color, 0.3));
      glow.addColorStop(1, rgb(color, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, 64, 64);
      glowSprites.set(key, sprite);
    }
    return sprite;
  }

  function drawGlows() {
    if (env.glow > 1.05 || weather().fog) {
      ctx.globalCompositeOperation = "lighter";
      const strength = clamp((env.glow - 1) / 2, 0, 1) * 0.6 + (weather().fog ? 0.25 : 0);
      ctx.globalAlpha = strength;
      for (const [x, y, r, color] of glows) {
        const radius = Math.min(r * 2.2 * env.glow, 28);
        ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    glows.length = 0;
  }

  function drawRunway(runway) {
    const dF = depthOf(30);
    const dN = depthOf(-30);
    if (Math.max(sx(runway.end + 100, dN), sx(runway.end + 100, dF)) < -50) return;
    if (Math.min(sx(runway.start - 950, dN), sx(runway.start - 950, dF)) > view.w + 50) return;
    const [vx0, vx1] = visibleRange(dF, 60);
    const visible = (x0, x1) => x1 >= vx0 && x0 <= vx1;
    const paint = env.paint;
    markQuad(runway.start - 60, runway.end + 60, 30, -30, rgb(lit([150, 160, 128]), 0.9));
    markQuad(runway.start, runway.end, 22.5, -22.5, rgb(lit([74, 80, 79])));
    if (weather().rain) markQuad(runway.start, runway.end, 22.5, -22.5, rgb(lit([140, 150, 165]), 0.12));
    markQuad(runway.start, runway.end, 21.6, 20.9, paint);
    markQuad(runway.start, runway.end, -20.9, -21.6, paint);
    for (const [x, dir] of [[runway.start, 1], [runway.end, -1]]) {
      if (!visible(x - 60, x + 60)) continue;
      const a = Math.min(x + dir * 6, x + dir * 36);
      const b = Math.max(x + dir * 6, x + dir * 36);
      for (let lane = -8; lane < 8; lane += 1) {
        const lateral = lane * 2.6 + (lane < 0 ? -1.2 : 1.2);
        markQuad(a, b, lateral + 0.9, lateral - 0.9, paint);
      }
      markQuad(Math.min(x, x + dir * 1.5), Math.max(x, x + dir * 1.5), 21, -21, paint);
    }
    const first = runway.start + 120 + Math.max(0, Math.floor((vx0 - runway.start - 120) / 50) * 50);
    for (let x = first; x < Math.min(runway.end - 120, vx1); x += 50) markQuad(x, x + 30, 0.45, -0.45, paint);
    for (const dist of [150, 450, 600, 750, 900]) {
      if (dist > runway.length * 0.45) continue;
      for (const [x0, x1] of [[runway.start + dist, runway.start + dist + 22.5], [runway.end - dist - 22.5, runway.end - dist]]) {
        if (!visible(x0, x1)) continue;
        markQuad(x0, x1, 12, 6, paint);
        markQuad(x0, x1, -6, -12, paint);
      }
    }
    for (const [x0, x1] of [[runway.start + 300, runway.start + 345], [runway.end - 345, runway.end - 300]]) {
      if (!visible(x0, x1)) continue;
      markQuad(x0, x1, 17, 9, paint);
      markQuad(x0, x1, -9, -17, paint);
    }
    drawDesignator(runway.start + 62, runway.runway, 1);
    drawDesignator(runway.end - 62, opposite(runway.runway), -1);

    const firstLight = runway.start + Math.max(0, Math.floor((vx0 - runway.start) / 60) * 60);
    for (let x = firstLight; x <= Math.min(runway.end, vx1); x += 60) {
      const color = x > runway.end - 600 ? [255, 214, 120] : [255, 246, 220];
      drawLight(x, 23.4, 0.3, color, 0.28);
      drawLight(x, -23.4, 0.3, color, 0.28);
    }
    if (env.lightsOn) {
      for (let x = runway.start + 15 + Math.max(0, Math.floor((vx0 - runway.start) / 15) * 15); x <= Math.min(runway.end - 300, vx1); x += 15) {
        drawLight(x, 0, 0.05, x > runway.end - 900 ? [255, 120, 100] : [240, 244, 255], 0.16, 1.6);
      }
    }
    if (visible(runway.start - 30, runway.start + 30)) for (let l = -21; l <= 21; l += 4.2) drawLight(runway.start - 2, l, 0.3, [120, 255, 150], 0.3);
    if (visible(runway.end - 30, runway.end + 30)) for (let l = -21; l <= 21; l += 4.2) drawLight(runway.end + 2, l, 0.3, [255, 80, 70], 0.3);
    // Approach lights with the sequenced "rabbit" strobe running toward the threshold.
    const rabbit = 30 - Math.floor(((performance.now() / 1000) * 2 % 1) * 30);
    for (let i = 1; i <= 30; i += 1) {
      const x = runway.start - i * 30;
      if (!visible(x, x)) continue;
      ctx.strokeStyle = rgb(lit([90, 96, 96]), 0.8);
      ctx.lineWidth = Math.max(1, 0.2 * view.ppm);
      ctx.beginPath();
      ctx.moveTo(sx(x), gy(x));
      ctx.lineTo(sx(x), gy(x, 1, 1.2));
      ctx.stroke();
      drawLight(x, 0, 1.2, [255, 250, 230], i === rabbit ? 0.6 : 0.3, i === rabbit ? 5 : 2.4);
      if (i === 10) for (let l = -15; l <= 15; l += 3) if (l) drawLight(x, l, 1.2, [255, 250, 230], 0.26);
    }
    if (runway === route.to) drawPapi(runway);
  }

  function opposite(designator) {
    const number = ((parseInt(designator, 10) + 17) % 36) + 1;
    const side = { L: "R", R: "L", C: "C" }[designator.slice(-1)] || "";
    return `${pad(number, 2)}${side}`;
  }

  function drawDesignator(x, text, dir) {
    const screenX = sx(x);
    if (screenX < -200 || screenX > view.w + 200) return;
    const squash = (sy(0, depthOf(-22.5)) - sy(0, depthOf(22.5))) / (45 * view.ppm);
    ctx.save();
    ctx.translate(screenX, gy(x));
    ctx.scale(1, squash);
    ctx.rotate(dir * Math.PI / 2);
    ctx.fillStyle = env.paint;
    ctx.font = `600 ${Math.round(16 * view.ppm)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // PAPI: four lights beside the touchdown zone, each white above its angle and red below.
  const PAPI_ANGLES = [2.5, 2.83, 3.17, 3.5];
  const papiState = () => {
    const angle = Math.atan2(sim.y - route.to.elev + 4, TOUCHDOWN_X - sim.x) / DEG;
    return PAPI_ANGLES.map((threshold) => angle > threshold);
  };
  function drawPapi(runway) {
    const x = runway.start + route.aim;
    if (offscreen(x, depthOf(40), 40)) return;
    papiState().forEach((white, i) => {
      const lateral = 59 - i * 9;
      const d = depthOf(lateral);
      ctx.fillStyle = rgb(lit([60, 64, 64]), 0.9);
      ctx.fillRect(sx(x, d) - 1.2 * view.ppm * d, gy(x, d, 1), 2.4 * view.ppm * d, view.ppm * d);
      drawLight(x, lateral, 1.4, white ? [255, 255, 250] : [255, 70, 56], 0.5, 3.4);
    });
  }

  function drawForeground() {
    for (const [lateral, cell] of [[-48, 7], [-95, 9]]) {
      const d = depthOf(lateral);
      if (gy(view.camX, d) > view.h + 40) continue;
      const [x0, x1] = visibleRange(d, 20);
      if (themeAt((x0 + x1) / 2) === "sea" && !inAirportZone((x0 + x1) / 2)) continue;
      ctx.strokeStyle = rgb(lit(lateral < -60 ? [70, 108, 58] : [84, 122, 66]), lateral < -60 ? 0.7 : 0.6);
      ctx.lineWidth = Math.max(1, 0.12 * view.ppm * d);
      ctx.beginPath();
      for (let c = Math.floor(x0 / cell); c <= Math.ceil(x1 / cell); c += 1) {
        const x = (c + hash2(c, lateral) * 0.8) * cell;
        const screenX = sx(x, d);
        const baseY = gy(x, d);
        const height = (0.5 + hash2(c, lateral + 1) * 0.6) * view.ppm * d;
        ctx.moveTo(screenX - height * 0.2, baseY);
        ctx.lineTo(screenX, baseY - height);
        ctx.lineTo(screenX + height * 0.3, baseY);
      }
      ctx.stroke();
    }
  }

  function drawClouds(front) {
    CLOUD_LAYERS.forEach((layer, layerIndex) => {
      if (!!layer.front !== front) return;
      const d = layer.d;
      const [x0, x1] = visibleRange(d, 0);
      const first = Math.floor((x0 - layer.size[1]) / layer.cell);
      const last = Math.ceil((x1 + layer.size[1]) / layer.cell);
      if (last - first > 60) return;
      const scale = view.ppm * d;
      for (let c = first; c <= last; c += 1) {
        const cloud = cloudAt(layerIndex, c);
        if (!cloud) continue;
        const cx = sx(cloud.x, d);
        const cy = sy(cloud.alt - view.ground, d);
        const extent = cloud.size * scale;
        if (cx + extent < 0 || cx - extent > view.w || cy - extent * 0.5 > view.h || cy + extent * 0.2 < 0) continue;
        ctx.globalAlpha = layer.alpha;
        for (const [color, grow, lift] of [[env.cloudShade, 1, -0.16], [env.cloudLight, 0.9, 0.04]]) {
          ctx.fillStyle = rgb(color);
          ctx.beginPath();
          for (const puff of cloud.puffs) {
            const px = cx + puff.dx * scale;
            const py = cy - (puff.dy + puff.r * lift) * scale;
            const r = puff.r * grow * scale;
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  // Fog: a layer FOG_TOP deep sitting on the ground. Above it you see its top; inside, it thins near the ground.
  function drawFog() {
    if (!weather().fog) return;
    const color = lit(env.time.fog).map((v, i) => Math.max(v, env.time.fog[i] * 0.35));
    const agl = sim.y - view.ground;
    if (agl < FOG_TOP) {
      const alpha = lerp(0.42, 0.86, clamp((agl - 20) / (FOG_TOP - 20), 0, 1));
      ctx.fillStyle = rgb(color, alpha);
      ctx.fillRect(0, 0, view.w, view.h);
    } else {
      const top = clamp(sy(FOG_TOP, 0.2), view.h * 0.5, view.h);
      const sea = ctx.createLinearGradient(0, top - 30, 0, view.h);
      sea.addColorStop(0, rgb(color, 0));
      sea.addColorStop(0.08, rgb(color, 0.9));
      sea.addColorStop(1, rgb(color, 0.97));
      ctx.fillStyle = sea;
      ctx.fillRect(0, top - 30, view.w, view.h - top + 30);
    }
  }

  function drawRain() {
    if (!weather().rain || view.camY + view.ground > 2700) return;
    const t = performance.now() / 1000;
    const speedX = 160 + sim.tas * view.ppm * 0.35;
    const speedY = 700;
    const span = view.w * 1.3;
    ctx.strokeStyle = rgb(mix([205, 214, 228], [120, 130, 150], 1 - env.light), 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 150; i += 1) {
      const fall = 0.8 + hash(i + 900) * 0.4;
      const x = (((hash(i) * span - t * speedX * fall) % span) + span) % span - view.w * 0.15;
      const y = (hash(i + 500) * view.h + t * speedY * fall) % view.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + speedX * 0.03, y - speedY * 0.03);
    }
    ctx.stroke();
  }

  function drawShadow() {
    const strength = env.shadow;
    if (sim.agl > 120 || strength <= 0) return;
    const groundY = gy(sim.x);
    if (groundY > view.h + 20) return;
    ctx.fillStyle = `rgba(20,28,24,${0.34 * strength * (1 - sim.agl / 120)})`;
    ctx.beginPath();
    ctx.ellipse(sx(sim.x - 4 - sim.agl * 0.6), groundY + 2, aircraft.length * 0.46 * view.ppm, Math.max(2, 0.65 * view.ppm), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Landing lights paint a bright patch on the runway ahead of the aircraft when low and gear down.
  function drawLandingLightSpot() {
    if (!env.lightsOn || sim.gearPos < 0.5 || sim.agl > 90 || sim.state === "crashed") return;
    const x = sim.x + 30 + sim.agl * 1.5;
    const strength = (1 - sim.agl / 90) * clamp(1.1 - env.light, 0.15, 0.9);
    const cx = sx(x);
    const cy = gy(x);
    const rx = (18 + sim.agl * 0.6) * view.ppm;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    glow.addColorStop(0, `rgba(255,246,220,${strength})`);
    glow.addColorStop(1, "rgba(255,246,220,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(cx, cy);
    ctx.scale(1, 0.12);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
    ctx.restore();
  }

  // Draws an aircraft sprite pivoting on its main wheels; flip keeps the art's native nose-left direction.
  function drawSprite(type, x, y, ppm, flip) {
    const shaded = shadedSprite(type.images.gearDown, (1 - env.light) * 0.85, false);
    if (!shaded) return;
    const scale = ppm * type.mpp;
    const [pivotX, pivotY] = type.art.mainWheel;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? scale : -scale, scale);
    ctx.drawImage(shaded, -pivotX, -pivotY);
    ctx.restore();
  }
  // Sprites are tinted on their own canvas so the darkening only touches the aircraft's pixels. Cached per tint step.
  // Works for the stock images and for painted (livery) canvases, which are keyed by an id instead of a src.
  const spriteCache = new Map();
  const spriteIds = new WeakMap();
  let nextSpriteId = 0;
  function shadedSprite(image, darkness, burnt) {
    if (image.complete === false || !(image.naturalWidth ?? image.width)) return null;
    const level = Math.round(clamp(darkness, 0, 1) * 20);
    if (!level && !burnt) return image;
    if (!spriteIds.has(image)) spriteIds.set(image, (nextSpriteId += 1));
    const key = `${spriteIds.get(image)}|${level}|${burnt}|${run.time}`;
    let shaded = spriteCache.get(key);
    if (!shaded) {
      if (spriteCache.size > 40) spriteCache.clear();
      shaded = document.createElement("canvas");
      shaded.width = image.naturalWidth ?? image.width;
      shaded.height = image.naturalHeight ?? image.height;
      const c = shaded.getContext("2d");
      c.drawImage(image, 0, 0);
      c.globalCompositeOperation = "source-atop";
      if (level) {
        c.fillStyle = rgb(mix([8, 12, 30], env.ambient.map((v) => v * 120), 0.3), level / 20);
        c.fillRect(0, 0, shaded.width, shaded.height);
      }
      if (burnt) {
        c.fillStyle = "rgba(30,24,20,0.5)";
        c.fillRect(0, 0, shaded.width, shaded.height);
      }
      spriteCache.set(key, shaded);
    }
    return shaded;
  }

  // Light radii are given in A320 art pixels so every type's lights are the same size in meters.
  function glowAt([ax, ay], color, size) {
    const gx = ax - MAIN_X;
    const gy = ay - MAIN_Y;
    const radius = Math.max(1, size * (REFERENCE_MPP / MPP));
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    glow.addColorStop(0, rgb(color));
    glow.addColorStop(0.25, rgb(color, 0.5));
    glow.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gx, gy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAircraft() {
    const set = aircraft.painted || sprites;
    const image = sim.gearPos >= 0.5 ? set.gearDown : set.gearUp;
    const scale = view.ppm * MPP;
    const art = aircraft.art;
    const crashed = sim.state === "crashed";
    ctx.save();
    ctx.translate(sx(sim.x), sy(sim.y - view.ground));
    ctx.rotate(-sim.pitch);
    ctx.scale(-scale, scale);
    if (sim.n1 > 0.15) {
      for (const [nx, ny] of art.nozzles) {
        const heat = ctx.createLinearGradient(nx - MAIN_X, 0, nx - MAIN_X + 220, 0);
        heat.addColorStop(0, rgb(lit([210, 200, 190]), 0.18 * sim.n1));
        heat.addColorStop(1, "rgba(210,200,190,0)");
        ctx.fillStyle = heat;
        ctx.fillRect(nx - MAIN_X, ny - MAIN_Y - 9, 220, 18);
      }
    }
    const shaded = shadedSprite(image, (1 - env.light) * 0.8, crashed);
    if (shaded) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(shaded, -MAIN_X, -MAIN_Y);
    }
    if (!crashed) {
      ctx.globalCompositeOperation = "lighter";
      const glowScale = Math.min(2, env.glow);
      if (env.lightsOn) {
        // Cabin windows, logo light on the fin, navigation light and landing light beam.
        const glowAmount = clamp(1.15 - env.light, 0, 1);
        ctx.fillStyle = rgb(WINDOW_LIGHT, 0.85 * glowAmount);
        for (const row of art.windows) {
          ctx.beginPath();
          for (let x = row.from; x <= row.to; x += row.step) {
            ctx.moveTo(x - MAIN_X + row.r, row.y - MAIN_Y);
            ctx.arc(x - MAIN_X, row.y - MAIN_Y, row.r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        glowAt(art.fin, [220, 230, 255], 40 * glowAmount + 1);
        glowAt(art.wingtip, [60, 255, 120], 10 * glowScale);
        if (sim.gearPos >= 0.5) {
          const [lx, ly] = art.landingLight;
          const beam = ctx.createLinearGradient(lx - MAIN_X, 0, lx - MAIN_X - 520, 0);
          beam.addColorStop(0, `rgba(255,248,225,${0.55 * glowAmount + 0.1})`);
          beam.addColorStop(1, "rgba(255,248,225,0)");
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(lx - MAIN_X, ly - MAIN_Y - 3);
          ctx.lineTo(lx - MAIN_X - 520, ly - MAIN_Y - 40);
          ctx.lineTo(lx - MAIN_X - 520, ly - MAIN_Y + 70);
          ctx.lineTo(lx - MAIN_X, ly - MAIN_Y + 3);
          ctx.closePath();
          ctx.fill();
          glowAt(art.landingLight, [255, 250, 230], 14 * glowScale);
        }
      }
      const t = performance.now() / 1000;
      if (t % 1.1 < 0.12) {
        glowAt(art.beacon, [255, 60, 50], 16 * glowScale);
        glowAt(art.bellyBeacon, [255, 60, 50], 16 * glowScale);
      }
      const strobe = t % 1.3;
      if (sim.n1 > 0.3 && (strobe < 0.06 || (strobe > 0.16 && strobe < 0.22))) {
        glowAt(art.tailStrobe, [255, 255, 255], 22 * glowScale);
        glowAt(art.wingtip, [255, 255, 255], 22 * glowScale);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const x = sx(p.x);
      const y = gy(p.x, 1, p.y);
      const r = Math.max(0.8, p.size * view.ppm);
      if (x + r < 0 || x - r > view.w || y + r < 0 || y - r > view.h) continue;
      ctx.globalCompositeOperation = p.glow ? "lighter" : "source-over";
      ctx.fillStyle = rgb(p.glow ? mix(p.color, [255, 60, 30], p.age / p.life) : lit(p.color), p.alpha * (1 - p.age / p.life));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- vertical display (route profile) ----------
  function drawVD() {
    const c = vdCtx;
    const W = view.vdW;
    const H = view.vdH;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const distTd = TOUCHDOWN_X - sim.x;
    const fullStart = route.from.start - 4000;
    const fullSpan = route.to.end + 8000 - fullStart;
    const span = clamp(distTd * 1.15 + 6000, 9000, fullSpan);
    const x0 = span >= fullSpan ? fullStart : sim.x - span * 0.12;
    const x1 = x0 + span;
    const floor = Math.min(route.from.elev, route.to.elev, 0);
    const top = span > 60000 ? route.cruiseAlt * 1.3 : clamp(Math.max(profileAlt(x0) * 1.15, sim.y * 1.35), route.to.elev + 450, route.cruiseAlt * 1.3);
    const left = 8;
    const right = W - 8;
    const bottom = H - 14;
    const ceiling = 14;
    const X = (wx) => left + (wx - x0) / (x1 - x0) * (right - left);
    const Y = (alt) => bottom - clamp((alt - floor) / (top - floor), -0.05, 1.05) * (bottom - ceiling);

    c.font = '9px "DM Mono", monospace';
    c.textBaseline = "middle";
    if (top > route.cruiseAlt) {
      c.strokeStyle = "rgba(255,255,255,0.12)";
      c.setLineDash([2, 3]);
      c.beginPath();
      c.moveTo(left, Y(route.cruiseAlt));
      c.lineTo(right, Y(route.cruiseAlt));
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.4)";
      c.fillText(route.cruiseLabel, left + 2, Y(route.cruiseAlt) + 7);
    }
    c.setLineDash([]);
    c.strokeStyle = "rgba(160,130,90,0.8)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const wx = lerp(x0, x1, i / 24);
      if (i) c.lineTo(X(wx), Y(groundAt(wx)));
      else c.moveTo(X(wx), Y(groundAt(wx)));
    }
    c.stroke();

    c.strokeStyle = "rgba(111,216,232,0.75)";
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(X(route.from.start + 1800), Y(route.from.elev));
    c.lineTo(X(TOC_X), Y(route.cruiseAlt));
    c.lineTo(X(TOD_X), Y(route.cruiseAlt));
    c.lineTo(X(TOD_X + DESCENT_LENGTH), Y(route.interceptAlt));
    c.lineTo(X(INTERCEPT_X), Y(route.interceptAlt));
    c.stroke();
    c.strokeStyle = "rgba(240,124,224,0.9)";
    c.beginPath();
    c.moveTo(X(INTERCEPT_X - 4000), Y(glidepathAlt(INTERCEPT_X - 4000)));
    c.lineTo(X(TOUCHDOWN_X), Y(route.to.elev));
    c.stroke();
    c.setLineDash([]);

    const fg = sim.fg;
    if (fg.ap && fg.vertical !== "G/S") {
      c.strokeStyle = "rgba(111,216,232,0.5)";
      c.beginPath();
      c.moveTo(X(sim.x), Y(fg.alt / FT));
      c.lineTo(right, Y(fg.alt / FT));
      c.stroke();
    }
    const todX = X(TOD_X);
    if (todX > left && todX < right) {
      c.fillStyle = "rgba(111,216,232,0.95)";
      c.beginPath();
      c.arc(todX, Y(route.cruiseAlt), 2.5, 0, Math.PI * 2);
      c.fill();
      c.fillText("T/D", todX + 4, Y(route.cruiseAlt) + 8);
    }
    c.lineWidth = 3;
    c.strokeStyle = "#d3ec73";
    c.fillStyle = "#d3ec73";
    c.textAlign = "center";
    for (const runway of runways) {
      const a = X(runway.start);
      const b = Math.max(a + 2, X(runway.end));
      if (b < left || a > right) continue;
      c.beginPath();
      c.moveTo(Math.max(left, a), Y(runway.elev));
      c.lineTo(Math.min(right, b), Y(runway.elev));
      c.stroke();
      c.fillText(runway.code, clamp(a, left + 13, right - 13), Math.min(H - 5, Y(runway.elev) + 8));
    }
    c.save();
    c.translate(X(sim.x), Y(sim.y));
    c.rotate(-clamp(sim.gamma * 3, -0.9, 0.9));
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(7, 0);
    c.lineTo(-5, -4);
    c.lineTo(-3, 0);
    c.lineTo(-5, 4);
    c.closePath();
    c.fill();
    c.restore();
    c.fillStyle = "rgba(255,255,255,0.45)";
    c.textAlign = "right";
    c.fillText(`${Math.round(span / 1000)} KM`, right, ceiling - 5);
    c.textAlign = "left";
    c.fillStyle = "#d3ec73";
    c.fillText("PROFILE", left, ceiling - 5);
    c.fillStyle = "rgba(111,216,232,0.85)";
    c.fillText(`HW ${Math.round(headwind(sim.agl) * KT)} KT`, left + 50, ceiling - 5);
  }

  // ---------- HUD ----------
  const hud = {
    ias: $("#ias"), speedTrend: $("#speed-trend"), speedSub: $("#speed-sub"), alt: $("#alt"), altTarget: $("#alt-target"), altSub: $("#alt-sub"),
    vs: $("#vs"), pitchSub: $("#pitch-sub"), n1: $("#n1"), thrSub: $("#thr-sub"), routeProgress: $("#route-progress"), routePlane: $("#route-plane"),
    routeFrom: $("#route-from"), routeTo: $("#route-to"), routeDist: $("#route-dist"), objective: $("#objective"), warnings: $("#warnings"),
    gs: $("#gs-indicator"), gsDiamond: $("#gs-diamond"), papi: [...document.querySelectorAll("#papi i")], gsDist: $("#gs-dist"),
    flaps: $("#flaps-state"), gear: $("#gear-state"), gearButton: $("#gear-button"), spoiler: $("#spoiler-state"), spoilerButton: $("#spoiler-button"),
    brake: $("#brake-state"), brakeButton: $("#brake-button"), knob: $("#stick-knob"), leverFill: $("#lever-fill"), leverHandle: $("#lever-handle"),
    thrLabel: $("#thr-label"), rate: $("#rate-button"), fcu: $("#fcu"), fcuButton: $("#fcu-button"), fma: $("#fma"), fcuFma: $("#fcu-fma"),
    apButton: $("#ap-button"), athrButton: $("#athr-button"), apprButton: $("#appr-button"), spd: $("#spd-value"), altValue: $("#alt-value"), vsValue: $("#vs-value"),
    replayTime: $("#replay-time"), replayProgress: $("#replay-progress"), replayMarker: $("#replay-marker"), replayPlay: $("#replay-play"),
    replaySpeed: $("#replay-speed"), replayCam: $("#replay-cam"),
  };
  hud.speedBox = hud.ias.closest(".readout");
  hud.vsBox = hud.vs.closest(".readout");
  hud.n1Box = hud.n1.closest(".readout");
  const textCache = new WeakMap();
  const setText = (element, text) => {
    if (textCache.get(element) === text) return;
    textCache.set(element, text);
    element.textContent = text;
  };
  const setClass = (element, name, on) => element.classList.toggle(name, !!on);
  const setPressed = (element, on) => element.setAttribute("aria-pressed", String(!!on));

  const detentLabel = () => (sim.alphaFloor ? "A.FLOOR" : sim.fg.athr ? (sim.fg.retard ? "RETARD" : "A/THR") : sim.throttle < 0.03 ? "IDLE" : sim.throttle > 0.97 ? "TOGA" : Math.abs(sim.throttle - 0.82) < 0.02 ? "CL" : `${Math.round(sim.throttle * 100)}%`);
  const rateAllowed = () => sim.state === "flying" && !sim.onGround && sim.agl * FT > 2500;

  function updateHud() {
    const fg = sim.fg;
    const ias = sim.ias;
    setText(hud.ias, pad(ias, 3));
    setText(hud.speedTrend, Math.abs(sim.iasTrend) > 2 ? `${sim.iasTrend > 0 ? "▲" : "▼"}${Math.round(Math.abs(sim.iasTrend))}` : "");
    const vfe = currentVfe();
    const speedInfo = sim.onGround ? `GS ${pad(Math.max(0, sim.gs), 3)}` : fg.athr ? `SPD ${Math.round(fg.spdTarget)} VLS ${Math.round(vlsKt())}` : `VLS ${Math.round(vlsKt())}`;
    setText(hud.speedSub, `${speedInfo}${sim.flapPos > 0.05 ? ` VFE ${vfe}` : ""}`);
    const overspeed = ias > aircraft.vmo || (sim.flapPos > 0.05 && ias > vfe) || (sim.gearPos > 0.05 && ias > aircraft.vle);
    setClass(hud.speedBox, "is-warning", sim.state === "flying" && (overspeed || (!sim.onGround && sim.alpha > sim.stall - 1.5 * DEG)));
    const altFt = sim.y * FT;
    const aglFt = sim.agl * FT;
    setText(hud.alt, pad(Math.round(altFt / 10) * 10, 5));
    setText(hud.altTarget, fg.ap && fg.vertical !== "G/S" ? `▸${fg.alt}` : "");
    setText(hud.altSub, aglFt < 2500 ? `RA ${Math.round(aglFt)}` : `WIND ${Math.round(headwind(sim.agl) * KT)} KT`);
    setText(hud.vs, signed(Math.abs(sim.vsFpm) < 20 ? 0 : Math.round(sim.vsFpm / 10) * 10, 4));
    setClass(hud.vsBox, "is-caution", !sim.onGround && aglFt < 2500 && sim.vsFpm < -1000);
    setText(hud.pitchSub, `PITCH ${sim.pitch < 0 ? "−" : "+"}${Math.abs(sim.pitch / DEG).toFixed(1)}°`);
    setText(hud.n1, pad(20 + sim.n1 * 72, 2));
    setText(hud.thrSub, `FUEL ${(sim.fuel / 1000).toFixed(sim.fuel < 10000 ? 1 : 0)} T`);
    setClass(hud.n1Box, "is-caution", sim.fuel < aircraft.reserveFuel * 0.6);

    const progress = clamp((sim.x - START_X) / (TOUCHDOWN_X - START_X), 0, 1);
    hud.routeProgress.style.width = `${progress * 100}%`;
    hud.routePlane.style.left = `${progress * 100}%`;
    setText(hud.routeFrom, route.from.code);
    setText(hud.routeTo, route.to.code);
    setText(hud.routeDist, km(Math.max(0, TOUCHDOWN_X - sim.x)));
    setText(hud.objective, guidance());
    const list = warnings();
    const warningKey = list.map(([text, level]) => `${level}:${text}`).join("|");
    if (textCache.get(hud.warnings) !== warningKey) {
      textCache.set(hud.warnings, warningKey);
      hud.warnings.replaceChildren(...list.map(([text, level]) => {
        const span = document.createElement("span");
        span.className = level;
        span.textContent = text;
        return span;
      }));
    }

    const distTd = TOUCHDOWN_X - sim.x;
    const showGs = (sim.state === "flying" || replay.active) && !sim.onGround && distTd > -200 && distTd < 26000 && sim.agl < 1500;
    hud.gs.hidden = !showGs;
    if (showGs) {
      const deviation = Math.atan2(sim.y - route.to.elev, Math.max(1, distTd)) / DEG - 3;
      hud.gsDiamond.style.top = `${50 + clamp(deviation / 0.7, -1, 1) * 46}%`;
      papiState().forEach((white, i) => setClass(hud.papi[i], "red", !white));
      setText(hud.gsDist, km(Math.max(0, distTd)));
    }

    const flapLabel = aircraft.flaps[sim.flapIndex].label;
    setText(hud.flaps, Math.abs(sim.flapPos - sim.flapIndex) > 0.02 ? `${flapLabel}…` : flapLabel);
    setText(hud.gear, sim.gearPos >= 1 ? "DOWN" : sim.gearPos <= 0 ? "UP" : "TRANSIT");
    setPressed(hud.gearButton, sim.gearDown);
    setClass(hud.gearButton, "is-transit", sim.gearPos > 0 && sim.gearPos < 1);
    setText(hud.spoiler, sim.speedbrake ? "EXT" : sim.spoilerPos > 0.5 ? "GND" : "RET");
    setPressed(hud.spoilerButton, sim.speedbrake || sim.spoilerPos > 0.5);
    setText(hud.brake, sim.brakesHeld ? "ON" : sim.braking ? "AUTO ●" : "AUTO");
    setPressed(hud.brakeButton, sim.braking);
    hud.leverHandle.style.bottom = `${sim.throttle * 100}%`;
    hud.leverFill.style.height = `${sim.throttle * 100}%`;
    setText(hud.thrLabel, detentLabel());
    setText(hud.rate, `${sim.rate}×`);
    hud.rate.disabled = !rateAllowed() && sim.rate === 1;
    setClass(hud.rate, "is-fast", sim.rate > 1);

    const flying = sim.state === "flying" && !replay.active;
    hud.fcu.hidden = !(fcuOpen && flying);
    game.classList.toggle("fcu-open", fcuOpen && flying);
    hud.fcuButton.setAttribute("aria-expanded", String(fcuOpen && flying));
    setClass(hud.fcuButton, "is-engaged", fg.ap || fg.athr);
    setPressed(hud.apButton, fg.ap);
    setPressed(hud.athrButton, fg.athr);
    setPressed(hud.apprButton, fg.appr && fg.vertical === "G/S");
    setClass(hud.apprButton, "is-armed", fg.appr && fg.vertical !== "G/S");
    setText(hud.spd, String(fg.spd));
    setText(hud.altValue, String(fg.alt));
    setText(hud.vsValue, String(fg.vs));
    const fma = fmaText();
    setText(hud.fcuFma, fma);
    setClass(hud.fcuFma, "is-off", !fg.ap && !fg.athr);
    hud.fma.hidden = !(flying && !fcuOpen && (fg.ap || fg.athr));
    setText(hud.fma, fma);

    if (replay.active) {
      const total = Math.max(0.1, replay.end - replay.start);
      hud.replayProgress.style.width = `${((replay.t - replay.start) / total) * 100}%`;
      hud.replayMarker.style.left = `${((replay.focusT - replay.start) / total) * 100}%`;
      const rel = replay.t - replay.focusT;
      setText(hud.replayTime, `${replay.focusLabel} ${rel < 0 ? "T−" : "T+"}${Math.abs(rel).toFixed(1)} S`);
      setText(hud.replayPlay, replay.playing ? "❚❚" : "▶");
      setText(hud.replaySpeed, `${replay.speed}×`);
      setText(hud.replayCam, replay.cam.toUpperCase());
    }
  }

  // ---------- replay ----------
  const replay = { active: false, t: 0, lastT: 0, start: 0, end: 0, focusT: 0, focusX: 0, focusLabel: "", speed: 1, playing: true, cam: "follow", saved: null, savedParticles: null };
  const REPLAY_CAMS = ["follow", "tower", "close"];
  const REPLAY_SPEEDS = [1, 0.5, 0.25];
  const canReplay = () => recorder.frames.length > 30;

  function startReplay() {
    if (!canReplay()) return;
    const frames = recorder.frames;
    const events = recorder.events;
    const crashEvent = events.find((e) => e.type === "crash");
    const doneEvent = events.find((e) => e.type === "done");
    const touchdownEvent = sim.touchdown ? events.find((e) => e.type === "touchdown" && Math.abs(e.t - sim.touchdown.time) < 0.01) : null;
    const focus = crashEvent || touchdownEvent || doneEvent || events.at(-1) || { t: frames.at(-1).t, x: frames.at(-1).x };
    replay.focusT = focus.t;
    replay.focusX = focus.x;
    replay.focusLabel = crashEvent ? "IMPACT" : touchdownEvent ? "TOUCHDOWN" : doneEvent ? "1,500 FT" : "END";
    replay.start = Math.max(frames[0].t, focus.t - (doneEvent && !crashEvent ? 40 : 24));
    replay.end = Math.min(frames.at(-1).t, focus.t + (crashEvent ? 6 : touchdownEvent ? 14 : 3));
    replay.saved = { ...sim };
    replay.savedParticles = particles.slice();
    replay.active = true;
    replay.speed = 1;
    replay.cam = "follow";
    restartReplay();
    game.classList.add("is-replay");
    $("#result-overlay").hidden = true;
    $("#replay-bar").hidden = false;
  }
  function restartReplay() {
    replay.t = replay.start;
    replay.lastT = replay.start;
    replay.playing = true;
    particles.length = 0;
    applyReplayFrame();
    updateCamera(10);
  }
  function exitReplay() {
    if (!replay.active) return;
    replay.active = false;
    Object.assign(sim, replay.saved);
    particles.length = 0;
    particles.push(...replay.savedParticles);
    game.classList.remove("is-replay");
    $("#replay-bar").hidden = true;
    $("#result-overlay").hidden = false;
    updateCamera(10);
  }
  function applyReplayFrame() {
    const frames = recorder.frames;
    let lo = 0;
    let hi = frames.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t <= replay.t) lo = mid;
      else hi = mid;
    }
    const a = frames[lo];
    const b = frames[hi];
    const f = b.t > a.t ? clamp((replay.t - a.t) / (b.t - a.t), 0, 1) : 0;
    for (const field of REPLAY_FIELDS) sim[field] = lerp(a[field], b[field], f);
    const near = f < 0.5 ? a : b;
    Object.assign(sim, { state: near.state, onGround: near.onGround, speedbrake: near.speedbrake, inCloud: near.inCloud, braking: near.braking });
    sim.flapIndex = Math.round(sim.flapPos);
    sim.gearDown = sim.gearPos > 0.5;
    sim.alphaFloor = false;
    sim.messageTimer = 0;
  }
  function stepReplay(dt) {
    if (replay.playing) replay.t = Math.min(replay.end, replay.t + dt * replay.speed);
    if (replay.t >= replay.end) replay.playing = false;
    const delta = replay.t - replay.lastT;
    for (const event of recorder.events) {
      if (event.t <= replay.lastT || event.t > replay.t) continue;
      if (event.type === "touchdown") touchdownEffects(event.x, sim.vx, event.strength);
      if (event.type === "tail") sparks(event.x, 60);
      if (event.type === "crash") explosion(event.x, 60);
    }
    replay.lastT = replay.t;
    applyReplayFrame();
    if (delta > 0) {
      updateParticles(delta);
      if (sim.state === "crashed") wreckSmoke(delta, sim.x);
    }
  }

  // ---------- results ----------
  const bestKey = (key) => (key === "flight" ? "bbfs2d.best" : `bbfs2d.best.${key}`);
  function readBest(key) {
    try {
      return JSON.parse(localStorage.getItem(bestKey(key)) || "null");
    } catch {
      return null;
    }
  }
  function saveBest(key, report) {
    const best = readBest(key);
    if (best && best.score >= report.score) return false;
    try {
      localStorage.setItem(bestKey(key), JSON.stringify({ score: report.score, grade: report.grade }));
    } catch {
      return false;
    }
    return true;
  }
  function showBest() {
    for (const element of document.querySelectorAll("[data-best]")) {
      const best = readBest(element.dataset.best);
      element.textContent = best ? `BEST ${best.score}/100 · ${best.grade}` : "";
    }
  }

  function statRow([label, value, tone]) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    if (tone) dd.className = tone;
    row.append(dt, dd);
    return row;
  }

  function showResult() {
    sim.resultShown = true;
    fcuOpen = false;
    const card = $("#result-overlay .result-card");
    const stats = $("#result-stats");
    card.classList.toggle("is-challenge", !!challenge);
    if (challenge) {
      showChallengeResult(card, stats);
    } else if (sim.state === "crashed") {
      card.classList.add("is-crash");
      $("#result-kicker").textContent = "FLIGHT ENDED";
      $("#result-title").textContent = sim.crash.title;
      $("#result-copy").textContent = sim.crash.copy;
      stats.replaceChildren(...[
        ["DISTANCE FLOWN", km(Math.max(0, sim.x - START_X))], ["MAX HEIGHT", `${Math.round(sim.maxAgl * FT / 10) * 10} FT AGL`],
        ["FLIGHT TIME", clock(sim.time)], ["TO DESTINATION", km(Math.max(0, TOUCHDOWN_X - sim.x))],
      ].map(statRow));
    } else {
      const report = sim.state === "done" ? takeoffReport() : landingReport();
      const record = saveBest(mode, report);
      card.classList.remove("is-crash");
      $("#result-kicker").textContent = record ? `${MODES[mode].kicker} · NEW BEST` : MODES[mode].kicker;
      $("#result-title").textContent = report.grade;
      $("#result-copy").textContent = report.copy;
      stats.replaceChildren(...report.stats.map(statRow));
      showBest();
    }
    $("#replay-button").hidden = !canReplay();
    $("#result-overlay").hidden = false;
  }

  function showChallengeResult(card, stats) {
    const c = challenge;
    const crashed = sim.state === "crashed";
    const landedOnRunway = sim.state === "landed" && sim.touchdown;
    let report = null;
    if (!crashed) {
      if (c.goAroundFt) report = sim.state === "done" ? goAroundReport() : null;
      else if (c.mode === "takeoff") report = sim.state === "done" ? takeoffReport() : null;
      else if (landedOnRunway) {
        report = landingReport();
        report.runway = sim.touchdown.runway;
        report.zone = sim.touchdown.dist > 150 && sim.touchdown.dist < 650;
      }
    }
    const checks = c.stars(report);
    let stars = 0;
    for (const item of checks) {
      if (!item.ok) break;
      stars += 1;
    }
    card.classList.toggle("is-crash", stars === 0);
    if (c.daily) {
      const score = report?.score ?? 0;
      const record = saveDaily(c.daily, score);
      $("#result-kicker").textContent = `${c.title} · SCORE ${score}${record ? " · NEW BEST" : ` · BEST ${readDaily()[c.daily]}`}`;
    } else {
      const record = saveStars(c, stars);
      $("#result-kicker").textContent = `CHALLENGE · ${c.title}${record ? " · NEW BEST" : ""}`;
    }
    $("#result-title").textContent = starText(stars);
    const reason = crashed ? `${sim.crash.title}: ${sim.crash.copy}` : sim.goAround?.called && sim.state === "landed" ? "You landed instead of going around." : report ? report.copy : "";
    $("#result-copy").textContent = `${checks.map((item) => `${item.ok ? "✓" : "✗"} ${item.label}`).join("   ")}${reason ? `\n${reason}` : ""}`;
    stats.replaceChildren(...(report ? report.stats : [["DISTANCE FLOWN", km(Math.max(0, sim.x - START_X))], ["FLIGHT TIME", clock(sim.time)]]).map(statRow));
    updateChallengeMenu();
    updateDailyMenu();
  }

  // ---------- audio ----------
  const audio = {
    ctx: null,
    enabled: true,
    nodes: null,
    init() {
      if (this.ctx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ac = new AudioContextClass();
      this.ctx = ac;
      const master = ac.createGain();
      master.gain.value = this.enabled ? 0.8 : 0;
      master.connect(ac.destination);
      const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i += 1) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = brown * 3.5;
      }
      const white = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const whiteData = white.getChannelData(0);
      for (let i = 0; i < whiteData.length; i += 1) whiteData[i] = Math.random() * 2 - 1;
      const loop = (buffer, filterType, frequency) => {
        const source = ac.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        const gain = ac.createGain();
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(master);
        source.start();
        return { filter, gain };
      };
      const tone = (type, frequency) => {
        const oscillator = ac.createOscillator();
        const gain = ac.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.value = 0;
        oscillator.connect(gain).connect(master);
        oscillator.start();
        return { oscillator, gain };
      };
      this.nodes = {
        master, noise, engine: loop(noise, "lowpass", 400), wind: loop(noise, "bandpass", 900), rumble: loop(noise, "lowpass", 140),
        rain: loop(white, "highpass", 2400), whine: tone("triangle", 240), warn: tone("square", 880),
      };
    },
    setEnabled(on) {
      this.enabled = on;
      if (this.nodes) this.nodes.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
      if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
    },
    update(paused) {
      if (!this.nodes) return;
      if (paused && this.ctx.state === "running") this.ctx.suspend();
      if (!paused && this.ctx.state === "suspended") this.ctx.resume();
      const n = this.nodes;
      const now = this.ctx.currentTime;
      const active = sim.state !== "ready";
      const n1 = active ? sim.n1 : 0;
      const set = (param, value) => param.setTargetAtTime(value, now, 0.08);
      set(n.engine.gain.gain, active ? 0.05 + n1 * 0.3 : 0);
      set(n.engine.filter.frequency, 380 + n1 * 2400);
      set(n.whine.oscillator.frequency, 240 + n1 * 1500);
      set(n.whine.gain.gain, active ? 0.006 + n1 * 0.018 : 0);
      set(n.wind.gain.gain, active ? Math.min(0.3, (sim.ias / 300) ** 2 * 0.28) : 0);
      set(n.rumble.gain.gain, active && sim.onGround ? Math.min(0.5, sim.gs / 140 * 0.5) : 0);
      set(n.rain.gain.gain, weather().rain && sim.y < 2700 ? 0.035 + Math.min(0.04, sim.ias / 6000) : 0);
      const stall = sim.state === "flying" && !sim.onGround && sim.alpha > sim.stall - 0.5 * DEG;
      set(n.warn.gain.gain, stall && (now * 6) % 1 < 0.5 ? 0.05 : 0);
    },
    burst(duration, frequency, volume) {
      if (!this.nodes || !this.enabled) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.nodes.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = frequency;
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter).connect(gain).connect(this.nodes.master);
      source.start(now, Math.random());
      source.stop(now + duration);
    },
    // Short two-tone chimes: one for engage, two for autothrust off, three for the autopilot disconnect warning.
    chime(count) {
      if (!this.nodes || !this.enabled) return;
      const now = this.ctx.currentTime;
      for (let i = 0; i < count; i += 1) {
        for (const [frequency, offset] of [[1180, 0], [880, 0.09]]) {
          const oscillator = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = now + i * 0.24 + offset;
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.07, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
          oscillator.connect(gain).connect(this.nodes.master);
          oscillator.start(start);
          oscillator.stop(start + 0.2);
        }
      }
    },
    thump(strength) { this.burst(0.25 + strength * 0.3, 220, 0.4 + strength); },
    scrape() { this.burst(0.8, 2200, 0.5); },
    crash() { this.burst(2.6, 500, 2.2); },
    say(text) {
      if (!this.enabled || !this.ctx || !window.speechSynthesis || sim.rate > 1 || replay.active) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.15;
      utterance.pitch = 0.85;
      utterance.volume = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
  };

  // ---------- screen wake lock: keep the phone awake during long flights ----------
  const wake = {
    lock: null,
    async request() {
      if (this.lock || !navigator.wakeLock || document.visibilityState !== "visible") return;
      try {
        this.lock = await navigator.wakeLock.request("screen");
        this.lock.addEventListener("release", () => { this.lock = null; });
      } catch { /* wake lock refused, e.g. battery saver */ }
    },
    release() {
      this.lock?.release().catch(() => {});
      this.lock = null;
    },
  };

  // ---------- controls ----------
  function setThrottle(value, fromPilot = true) {
    let v = clamp(value, 0, 1);
    if (v < 0.03) v = 0;
    else if (v > 0.97) v = 1;
    else if (Math.abs(v - 0.82) < 0.025) v = 0.82;
    const detent = (t) => (t === 0 ? 0 : t === 1 ? 2 : t === 0.82 ? 1 : -1);
    if (detent(v) !== -1 && detent(v) !== detent(sim.throttle)) buzz(6);
    if (fromPilot && sim.fg.athr && Math.abs(v - sim.throttle) > 0.01) disconnectAthr("A/THR OFF · LEVERS MOVED");
    sim.throttle = v;
  }
  function toggleGear() {
    if (sim.state !== "flying") return;
    if (sim.onGround) {
      flash("WEIGHT ON WHEELS · GEAR LOCKED");
      return;
    }
    sim.gearDown = !sim.gearDown;
    if (!sim.gearDown && sim.gearUpFt === null) sim.gearUpFt = sim.agl * FT;
    buzz(10);
  }
  function moveFlaps(delta) {
    if (sim.state !== "flying") return;
    sim.flapIndex = clamp(sim.flapIndex + delta, 0, aircraft.flaps.length - 1);
    buzz(8);
  }
  function toggleSpeedbrake() {
    if (sim.state !== "flying") return;
    if (sim.onGround) {
      flash("GROUND SPOILERS ARE AUTOMATIC");
      return;
    }
    sim.speedbrake = !sim.speedbrake;
    buzz(8);
  }
  function cycleRate() {
    if (!rateAllowed()) {
      sim.rate = 1;
      flash("TIME SPEED-UP ABOVE 2,500 FT ONLY");
      return;
    }
    sim.rate = { 1: 2, 2: 4, 4: 8, 8: 1 }[sim.rate];
  }
  function setPaused(paused) {
    sim.paused = paused && sim.state === "flying" && !replay.active;
    $("#pause-overlay").hidden = !sim.paused;
  }
  // Regular flights use the start-screen settings; challenges bring their own.
  function useSettings() {
    challenge = null;
    applyAircraft(settings.aircraft);
    applyRoute(settings.route);
    syncRun();
    cloudCache.clear();
  }
  function startChallenge(c) {
    challenge = c;
    applyAircraft(c.aircraft);
    applyRoute(c.route);
    Object.assign(run, { weather: c.weather, time: c.time });
    cloudCache.clear();
    $("#challenge-overlay").hidden = true;
    startFlight(c.mode);
  }
  function startFlight(nextMode = mode) {
    mode = MODES[nextMode] ? nextMode : "flight";
    if (!challenge) syncRun();
    replay.active = false;
    game.classList.remove("is-replay");
    $("#replay-bar").hidden = true;
    audio.init();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    resetSim();
    sim.state = "flying";
    if (mode === "landing") setupFinal(FINAL_DISTANCE, vappKt() + 2);
    if (challenge) challenge.setup?.();
    sim.takeoffVr = vrKt();
    fcuOpen = false;
    updateCamera(10);
    $("#restart-button").textContent = challenge ? "RESTART CHALLENGE" : MODES[mode].restart;
    $("#start-overlay").hidden = true;
    $("#pause-overlay").hidden = true;
    $("#result-overlay").hidden = true;
    game.classList.add("is-started");
    accumulator = 0;
    wake.request();
  }
  function showMenu() {
    useSettings();
    replay.active = false;
    game.classList.remove("is-replay");
    $("#replay-bar").hidden = true;
    resetSim();
    showBest();
    updateMenu();
    fcuOpen = false;
    $("#pause-overlay").hidden = true;
    $("#result-overlay").hidden = true;
    $("#challenge-overlay").hidden = true;
    $("#load-overlay").hidden = true;
    $("#start-overlay").hidden = false;
    game.classList.remove("is-started");
    wake.release();
  }
  function updateMenu() {
    const label = `${route.from.code} → ${route.to.code}`;
    $("#route-label").textContent = label;
    $("#flight-title").textContent = label;
    $("#takeoff-plan").textContent = `${route.from.code} ${route.from.runway} · CLIMB TO ${feet(TAKEOFF_GOAL_FT)} FT`;
    $("#landing-plan").textContent = `${route.to.code} ${route.to.runway} · 9 KM FINAL, CONFIGURED`;
    $("#weather-label").textContent = WEATHER[settings.weather].label;
    $("#aircraft-label").textContent = aircraft.name;
    $("#start-plane").src = aircraft.paintedUrl || aircraft.sprites.gearDown;
    $("#plan-distance").textContent = `${aircraft.name} · ${km(TOUCHDOWN_X - START_X)} · ${route.cruiseLabel} · ~${routeMinutes()} MIN`;
    $("#time-label").textContent = TIMES[settings.time].label;
    updateChallengeMenu();
    updateDailyMenu();
  }
  function updateDailyMenu() {
    const c = dailyChallenge();
    const def = ROUTES[c.route];
    const airport = c.mode === "takeoff" ? def.from : def.to;
    const log = readDaily();
    const streak = dailyStreak(log, c.daily);
    $("#daily-plan").textContent = `${AIRCRAFT[c.aircraft].name} · ${airport[0]} ${airport[1]} · ${WEATHER[c.weather].label} · ${TIMES[c.time].label}\n${c.blurb}`;
    $("#daily-best").textContent = `${c.daily in log ? `BEST ${log[c.daily]}` : "NOT FLOWN"}${streak > 1 ? ` · ${streak} DAYS` : ""}`;
  }
  function updateChallengeMenu() {
    const total = CHALLENGES.reduce((sum, c) => sum + readStars(c), 0);
    $("#challenge-stars").textContent = `★ ${total} / ${CHALLENGES.length * 3}`;
    $("#challenge-list").replaceChildren(...CHALLENGES.map((c) => {
      const button = document.createElement("button");
      button.className = "challenge-card";
      const type = AIRCRAFT[c.aircraft];
      const def = ROUTES[c.route];
      const airport = c.mode === "takeoff" ? def.from : def.to;
      button.innerHTML = `<span class="challenge-stars"></span><b></b><span class="challenge-blurb"></span><small></small>`;
      button.querySelector(".challenge-stars").textContent = starText(readStars(c));
      button.querySelector("b").textContent = c.title;
      button.querySelector(".challenge-blurb").textContent = c.blurb;
      button.querySelector("small").textContent = `${type.name} · ${airport[0]} ${airport[1]} · ${WEATHER[c.weather].label} · ${TIMES[c.time].label}`;
      button.addEventListener("click", () => startChallenge(c));
      return button;
    }));
  }
  function cycleSetting(key, options) {
    const keys = Object.keys(options);
    settings[key] = keys[(keys.indexOf(settings[key]) + 1) % keys.length];
    saveSettings();
    syncRun();
    cloudCache.clear();
    updateMenu();
    buzz(6);
  }

  const pitchPad = $("#pitch-pad");
  const stickTrack = pitchPad.querySelector(".stick-track");
  let pitchPointer = null;
  let pitchOrigin = 0;
  function pitchFromPointer(event) {
    const range = Math.max(40, stickTrack.clientHeight * 0.4);
    const raw = clamp((pitchOrigin - event.clientY) / range, -1, 1);
    const feel = SENSITIVITY[settings.sensitivity];
    input.touchPitch = Math.sign(raw) * Math.abs(raw) ** feel.curve * feel.gain * (settings.invert ? -1 : 1);
    hud.knob.style.setProperty("--offset", `${-raw * (stickTrack.clientHeight / 2 - 22)}px`);
  }
  pitchPad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pitchPointer = event.pointerId;
    pitchOrigin = event.clientY;
    pitchPad.setPointerCapture(event.pointerId);
    pitchPad.classList.add("is-active");
    pitchFromPointer(event);
  });
  pitchPad.addEventListener("pointermove", (event) => { if (event.pointerId === pitchPointer) pitchFromPointer(event); });
  const releasePitch = (event) => {
    if (event.pointerId !== pitchPointer) return;
    pitchPointer = null;
    input.touchPitch = 0;
    hud.knob.style.setProperty("--offset", "0px");
    pitchPad.classList.remove("is-active");
  };
  pitchPad.addEventListener("pointerup", releasePitch);
  pitchPad.addEventListener("pointercancel", releasePitch);

  const throttleControl = $("#throttle");
  const leverTrack = $("#lever-track");
  let throttlePointer = null;
  const throttleFromPointer = (event) => {
    const rect = leverTrack.getBoundingClientRect();
    setThrottle(1 - (event.clientY - rect.top) / rect.height);
  };
  throttleControl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    throttlePointer = event.pointerId;
    throttleControl.setPointerCapture(event.pointerId);
    throttleFromPointer(event);
  });
  throttleControl.addEventListener("pointermove", (event) => { if (event.pointerId === throttlePointer) throttleFromPointer(event); });
  const releaseThrottle = (event) => { if (event.pointerId === throttlePointer) throttlePointer = null; };
  throttleControl.addEventListener("pointerup", releaseThrottle);
  throttleControl.addEventListener("pointercancel", releaseThrottle);

  $("#gear-button").addEventListener("click", toggleGear);
  $("#flaps-up").addEventListener("click", () => moveFlaps(-1));
  $("#flaps-down").addEventListener("click", () => moveFlaps(1));
  $("#spoiler-button").addEventListener("click", toggleSpeedbrake);
  const brakeButton = $("#brake-button");
  brakeButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    brakeButton.setPointerCapture(event.pointerId);
    sim.brakesHeld = true;
    buzz(8);
  });
  for (const type of ["pointerup", "pointercancel"]) brakeButton.addEventListener(type, () => { sim.brakesHeld = false; });
  $("#rate-button").addEventListener("click", cycleRate);
  $("#pause-button").addEventListener("click", () => setPaused(!sim.paused));
  $("#resume-button").addEventListener("click", () => setPaused(false));
  $("#restart-button").addEventListener("click", () => startFlight());
  $("#again-button").addEventListener("click", () => startFlight());
  $("#menu-button").addEventListener("click", showMenu);
  $("#result-menu-button").addEventListener("click", showMenu);
  for (const card of document.querySelectorAll(".mode-card")) card.addEventListener("click", () => openLoadSheet(card.dataset.mode));
  $("#challenge-button").addEventListener("click", () => {
    updateChallengeMenu();
    $("#challenge-overlay").hidden = false;
  });
  $("#challenge-back").addEventListener("click", () => { $("#challenge-overlay").hidden = true; });
  $("#daily-button").addEventListener("click", () => startChallenge(dailyChallenge()));

  // ---------- liveries ----------
  // A livery is a paint layer the size of the type's sprite canvas. It is multiplied onto the art, so panel lines,
  // windows and shading show through, and clipped to the aircraft's own pixels. Each type keeps its own, in the browser.
  // The editor shows the art mirrored, nose right, exactly as it flies; text is drawn mirrored into the layer to match.
  const liveryKey = (type) => `bbfs2d.livery.${type.id}`;
  const imageReady = (image) => (image.complete && image.naturalWidth ? Promise.resolve() : image.decode());
  function newLayer(type) {
    const layer = document.createElement("canvas");
    layer.width = type.art.width;
    layer.height = type.art.height;
    return layer;
  }
  function paintSprite(image, layer, canvas = document.createElement("canvas")) {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const c = canvas.getContext("2d");
    c.drawImage(image, 0, 0);
    c.globalCompositeOperation = "multiply";
    c.drawImage(layer, 0, 0);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(image, 0, 0);
    return canvas;
  }
  function applyLivery(type, layer) {
    type.livery = layer;
    type.painted = layer ? { gearUp: paintSprite(type.images.gearUp, layer), gearDown: paintSprite(type.images.gearDown, layer) } : null;
    type.paintedUrl = layer ? type.painted.gearDown.toDataURL() : null;
  }
  for (const type of Object.values(AIRCRAFT)) {
    let saved = null;
    try { saved = localStorage.getItem(liveryKey(type)); } catch { /* storage unavailable */ }
    if (!saved) continue;
    const stored = new Image();
    stored.src = saved;
    Promise.all([stored.decode(), imageReady(type.images.gearUp), imageReady(type.images.gearDown)]).then(() => {
      const layer = newLayer(type);
      layer.getContext("2d").drawImage(stored, 0, 0);
      applyLivery(type, layer);
      if (type === aircraft) updateMenu();
    }).catch(() => { /* a broken save just means no livery */ });
  }

  const LIVERY_COLORS = ["#c8102e", "#f26b1d", "#f6c21c", "#b6d433", "#1e8a4c", "#4fb3e8", "#1f6fd1", "#0b2a5b", "#6b3fa0", "#e84d8a", "#8a9196", "#161616", "#ffffff"];
  const LIVERY_HINTS = {
    brush: "Draw on the plane. Paint only shows on the aircraft itself.",
    fill: "Tap a panel to fill it. Panel lines and windows show through the paint.",
    text: "Type your text, then tap the plane to place it. Drag to move it before you let go.",
    eraser: "Rub out paint back to bare metal.",
  };
  const liveryCanvas = $("#livery-canvas");
  const liveryCtx = liveryCanvas.getContext("2d");
  const liveryView = document.createElement("canvas");
  const editor = { type: null, layer: null, tool: "brush", color: LIVERY_COLORS[0], brushSize: 6, textSize: 24, undo: [], pointer: null, last: null, snapshot: null };
  const layerCtx = () => editor.layer.getContext("2d");

  // Opens the editor on the selected aircraft, with its saved livery or a given layer (from a code) still to be saved.
  function openLivery(preset = null, hint = "") {
    const type = aircraft;
    return Promise.all([imageReady(type.images.gearUp), imageReady(type.images.gearDown), document.fonts?.load('700 24px "Barlow Condensed"')]).catch(() => {}).then(() => {
      editor.type = type;
      editor.layer = newLayer(type);
      if (preset || type.livery) layerCtx().drawImage(preset || type.livery, 0, 0);
      editor.undo = [];
      $("#livery-code").value = "";
      liveryCanvas.width = type.art.width * 2;
      liveryCanvas.height = type.art.height * 2;
      liveryCanvas.style.setProperty("--aspect", type.art.width / type.art.height);
      $("#livery-title").textContent = type.name;
      setLiveryTool(editor.tool);
      if (hint) $("#livery-hint").textContent = hint;
      renderLivery();
      $("#livery-overlay").hidden = false;
    });
  }
  function layerIsPainted() {
    const pixels = layerCtx().getImageData(0, 0, editor.layer.width, editor.layer.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
    return false;
  }
  function saveLivery() {
    const type = editor.type;
    const painted = layerIsPainted();
    try {
      if (painted) localStorage.setItem(liveryKey(type), editor.layer.toDataURL());
      else localStorage.removeItem(liveryKey(type));
    } catch { flash("LIVERY NOT SAVED · STORAGE FULL"); }
    applyLivery(type, painted ? editor.layer : null);
  }
  function closeLivery() {
    saveLivery();
    editor.layer = null;
    $("#livery-overlay").hidden = true;
    updateMenu();
  }

  // ---------- livery codes ----------
  // A livery travels as text, "BBFS1.<type>.<data>": the paint layer with colours rounded to 5 bits per channel and
  // alpha to 4 steps, stored as palette indices, deflated and base64url-encoded. Paste it, or open it as a #livery= link.
  const CODE_VERSION = "BBFS1";
  function toBase64Url(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
  const fromBase64Url = (text) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function liveryCode(type, layer) {
    const { width: w, height: h } = layer;
    const pixels = layer.getContext("2d").getImageData(0, 0, w, h).data;
    const palette = [0];
    const lookup = new Map([[0, 0]]);
    const indices = new Uint32Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
      const alpha = pixels[i * 4 + 3] >> 6;
      if (!alpha) continue;
      const packed = ((pixels[i * 4] >> 3) << 12) | ((pixels[i * 4 + 1] >> 3) << 7) | ((pixels[i * 4 + 2] >> 3) << 2) | alpha;
      let index = lookup.get(packed);
      if (index === undefined) {
        index = palette.length;
        palette.push(packed);
        lookup.set(packed, index);
      }
      indices[i] = index;
    }
    const wide = palette.length > 256 ? 2 : 1;
    const bytes = new Uint8Array(7 + palette.length * 3 + w * h * wide);
    bytes.set([wide, w >> 8, w & 255, h >> 8, h & 255, palette.length >> 8, palette.length & 255]);
    palette.forEach((packed, i) => bytes.set([packed >> 16, (packed >> 8) & 255, packed & 255], 7 + i * 3));
    const body = 7 + palette.length * 3;
    for (let i = 0; i < w * h; i += 1) {
      if (wide === 2) bytes.set([indices[i] >> 8, indices[i] & 255], body + i * 2);
      else bytes[body + i] = indices[i];
    }
    return `${CODE_VERSION}.${type.id}.${toBase64Url(await pipeBytes(bytes, new CompressionStream("deflate-raw")))}`;
  }
  async function readLiveryCode(code) {
    const match = /^BBFS1\.([a-z0-9]+)\.([A-Za-z0-9_-]+)$/.exec(code.replace(/\s+/g, ""));
    const type = match && AIRCRAFT[match[1]];
    if (!type) throw new Error("That isn't a livery code. Codes start with BBFS1.");
    let bytes;
    try { bytes = await pipeBytes(fromBase64Url(match[2]), new DecompressionStream("deflate-raw")); } catch { throw new Error("That code is incomplete. Copy the whole code and try again."); }
    const [wide, w1, w0, h1, h0, n1, n0] = bytes;
    const w = (w1 << 8) | w0;
    const h = (h1 << 8) | h0;
    const count = (n1 << 8) | n0;
    const body = 7 + count * 3;
    if (w !== type.art.width || h !== type.art.height || bytes.length !== body + w * h * wide) throw new Error("That code doesn't fit this version of the game.");
    const layer = newLayer(type);
    const c = layer.getContext("2d");
    const image = c.createImageData(w, h);
    for (let i = 0; i < w * h; i += 1) {
      const index = wide === 2 ? (bytes[body + i * 2] << 8) | bytes[body + i * 2 + 1] : bytes[body + i];
      if (!index) continue;
      const at = 7 + index * 3;
      const packed = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
      const five = (shift) => (((packed >> shift) & 31) * 255) / 31;
      image.data.set([five(12), five(7), five(2), (packed & 3) * 85], i * 4);
    }
    c.putImageData(image, 0, 0);
    return { type, layer };
  }
  // Selects the code's aircraft (saving any work on the one being edited) and opens the editor on the livery.
  async function useLiveryCode(code, source) {
    const { type, layer } = await readLiveryCode(code);
    if (editor.layer && editor.type !== type) saveLivery();
    if (editor.layer && editor.type === type) {
      pushUndo();
      layerCtx().clearRect(0, 0, layer.width, layer.height);
      layerCtx().drawImage(layer, 0, 0);
      renderLivery();
      $("#livery-hint").textContent = `Livery loaded from ${source}. Tap DONE to keep it, or UNDO to go back.`;
      return;
    }
    settings.aircraft = type.id;
    applyAircraft(type.id);
    resetSim();
    saveSettings();
    updateMenu();
    await openLivery(layer, `${type.name} livery loaded from ${source}. Tap DONE to keep it.`);
  }
  async function copyText(text, input) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      input.select();
      return document.execCommand("copy");
    }
  }
  async function shareLivery(asLink) {
    if (!layerIsPainted()) {
      $("#livery-hint").textContent = "Paint something first, then share it.";
      return;
    }
    const code = await liveryCode(editor.type, editor.layer);
    const text = asLink ? `${location.origin}${location.pathname}#livery=${code}` : code;
    const field = $("#livery-code");
    field.value = text;
    const what = `${asLink ? "Link" : "Code"} ready (${text.length.toLocaleString("en-US")} characters). Anyone who ${asLink ? "opens the link" : "enters the code"} gets this livery.`;
    $("#livery-hint").textContent = what;
    const copied = await copyText(text, field);
    if (field.value === text) $("#livery-hint").textContent = `${what} ${copied ? "Copied." : "Select it above and copy it."}`;
  }
  function renderLivery() {
    const painted = paintSprite(editor.type.images.gearDown, editor.layer, liveryView);
    const zoom = liveryCanvas.width / painted.width;
    liveryCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveryCtx.clearRect(0, 0, liveryCanvas.width, liveryCanvas.height);
    liveryCtx.setTransform(-zoom, 0, 0, zoom, liveryCanvas.width, 0);
    liveryCtx.imageSmoothingQuality = "high";
    liveryCtx.drawImage(painted, 0, 0);
  }
  function setLiveryTool(tool) {
    editor.tool = tool;
    for (const button of document.querySelectorAll("[data-tool]")) button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    const text = tool === "text";
    $("#livery-text-row").hidden = !text;
    $("#livery-size-label").textContent = text ? "TEXT SIZE" : "BRUSH SIZE";
    const size = $("#livery-size");
    size.min = text ? 6 : 1;
    size.max = text ? 64 : 40;
    size.value = text ? editor.textSize : editor.brushSize;
    $("#livery-size-value").textContent = size.value;
    $("#livery-hint").textContent = LIVERY_HINTS[tool];
  }
  function setLiveryColor(color) {
    editor.color = color;
    $("#livery-color").value = color;
    for (const swatch of document.querySelectorAll(".swatch")) swatch.setAttribute("aria-pressed", String(swatch.dataset.color === color));
  }
  function pushUndo() {
    editor.undo.push(layerCtx().getImageData(0, 0, editor.layer.width, editor.layer.height));
    if (editor.undo.length > 30) editor.undo.shift();
  }
  // Pointer position in layer pixels; the view is mirrored, so x runs from the right.
  function layerPoint(event) {
    const rect = liveryCanvas.getBoundingClientRect();
    return { x: (1 - (event.clientX - rect.left) / rect.width) * editor.layer.width, y: ((event.clientY - rect.top) / rect.height) * editor.layer.height };
  }
  function strokeTo(point) {
    const c = layerCtx();
    c.save();
    c.globalCompositeOperation = editor.tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = editor.color;
    c.lineWidth = editor.brushSize;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(editor.last.x, editor.last.y);
    c.lineTo(point.x + 0.01, point.y);
    c.stroke();
    c.restore();
    editor.last = point;
  }
  function drawLiveryText(point) {
    const c = layerCtx();
    c.save();
    c.translate(point.x, point.y);
    c.scale(-1, 1);
    c.font = `700 ${editor.textSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = editor.color;
    c.fillText($("#livery-text").value.trim(), 0, 0);
    c.restore();
  }
  // Flood fill on what you see: spreads through smooth shading but stops at panel lines, windows and paint edges,
  // then grows one pixel so no seam is left along the line (multiply keeps the line visible anyway).
  function liveryFill(point) {
    const { width: w, height: h } = editor.layer;
    const x0 = Math.floor(point.x);
    const y0 = Math.floor(point.y);
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return false;
    const view = paintSprite(editor.type.images.gearDown, editor.layer, liveryView).getContext("2d").getImageData(0, 0, w, h).data;
    const start = y0 * w + x0;
    if (view[start * 4 + 3] < 100) return false;
    const diff = (a, b) => Math.max(Math.abs(view[a * 4] - view[b * 4]), Math.abs(view[a * 4 + 1] - view[b * 4 + 1]), Math.abs(view[a * 4 + 2] - view[b * 4 + 2]));
    const region = new Uint8Array(w * h);
    const stack = [start];
    region[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n < 0 || n >= w * h || region[n] || view[n * 4 + 3] < 100) continue;
        if (diff(n, i) > 8 || diff(n, start) > 80) continue;
        region[n] = 1;
        stack.push(n);
      }
    }
    const c = layerCtx();
    const layer = c.getImageData(0, 0, w, h);
    const rgb = [1, 3, 5].map((at) => parseInt(editor.color.slice(at, at + 2), 16));
    for (let i = 0; i < w * h; i += 1) {
      let hit = region[i];
      if (!hit && view[i * 4 + 3]) {
        const x = i % w;
        hit = (x > 0 && region[i - 1]) || (x < w - 1 && region[i + 1]) || region[i - w] || region[i + w];
      }
      if (!hit) continue;
      layer.data.set([...rgb, 255], i * 4);
    }
    c.putImageData(layer, 0, 0);
    return true;
  }
  liveryCanvas.addEventListener("pointerdown", (event) => {
    if (editor.pointer !== null) return;
    event.preventDefault();
    const point = layerPoint(event);
    if (editor.tool === "text" && !$("#livery-text").value.trim()) {
      $("#livery-text").focus();
      return;
    }
    pushUndo();
    editor.pointer = event.pointerId;
    liveryCanvas.setPointerCapture(event.pointerId);
    if (editor.tool === "fill") {
      if (!liveryFill(point)) editor.undo.pop();
      editor.pointer = null;
    } else if (editor.tool === "text") {
      editor.snapshot = editor.undo[editor.undo.length - 1];
      drawLiveryText(point);
    } else {
      editor.last = point;
      strokeTo(point);
    }
    renderLivery();
  });
  liveryCanvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== editor.pointer) return;
    const point = layerPoint(event);
    if (editor.tool === "text") {
      layerCtx().putImageData(editor.snapshot, 0, 0);
      drawLiveryText(point);
    } else {
      strokeTo(point);
    }
    renderLivery();
  });
  const endLiveryPointer = (event) => { if (event.pointerId === editor.pointer) editor.pointer = null; };
  liveryCanvas.addEventListener("pointerup", endLiveryPointer);
  liveryCanvas.addEventListener("pointercancel", endLiveryPointer);
  $("#livery-colors").prepend(...LIVERY_COLORS.map((color) => {
    const swatch = document.createElement("button");
    swatch.className = "swatch";
    swatch.dataset.color = color;
    swatch.style.setProperty("--swatch", color);
    swatch.setAttribute("aria-label", `Colour ${color}`);
    swatch.addEventListener("click", () => setLiveryColor(color));
    return swatch;
  }));
  setLiveryColor(editor.color);
  $("#livery-color").addEventListener("input", (event) => setLiveryColor(event.target.value));
  for (const button of document.querySelectorAll("[data-tool]")) button.addEventListener("click", () => setLiveryTool(button.dataset.tool));
  $("#livery-size").addEventListener("input", (event) => {
    editor[editor.tool === "text" ? "textSize" : "brushSize"] = Number(event.target.value);
    $("#livery-size-value").textContent = event.target.value;
  });
  $("#livery-undo").addEventListener("click", () => {
    const previous = editor.undo.pop();
    if (!previous) return;
    layerCtx().putImageData(previous, 0, 0);
    renderLivery();
  });
  $("#livery-clear").addEventListener("click", () => {
    pushUndo();
    layerCtx().clearRect(0, 0, editor.layer.width, editor.layer.height);
    renderLivery();
  });
  $("#livery-button").addEventListener("click", () => openLivery());
  $("#livery-share").addEventListener("click", () => shareLivery(false));
  $("#livery-share-link").addEventListener("click", () => shareLivery(true));
  $("#livery-use").addEventListener("click", () => {
    const input = $("#livery-code-in");
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    useLiveryCode(input.value, "the code").then(() => { input.value = ""; }, (err) => { $("#livery-hint").textContent = err.message; });
  });
  $("#livery-done").addEventListener("click", closeLivery);

  // Load sheet: passengers and fuel set the weight, which sets the speeds and the performance.
  let loadMode = "flight";
  const paxInput = $("#pax-input");
  const fuelInput = $("#fuel-input");
  function openLoadSheet(nextMode) {
    useSettings();
    loadMode = nextMode;
    const load = currentLoad();
    paxInput.max = aircraft.maxPax;
    fuelInput.max = aircraft.maxFuel;
    fuelInput.step = aircraft.maxFuel > 50000 ? 500 : 100;
    paxInput.value = load.pax;
    fuelInput.value = load.fuel;
    $("#load-title").textContent = `${aircraft.name} · ${nextMode === "landing" ? `${route.to.code} ${route.to.runway} FINAL` : nextMode === "takeoff" ? `${route.from.code} ${route.from.runway}` : `${route.from.code} → ${route.to.code}`}`;
    updateLoadSheet();
    $("#load-overlay").hidden = false;
  }
  function plannedTrip() {
    return loadMode === "flight" ? tripFuel(route.distance) : loadMode === "takeoff" ? aircraft.climbFuel * 0.4 : aircraft.burnPerKm * 12;
  }
  function updateLoadSheet() {
    const pax = Number(paxInput.value);
    const fuel = Number(fuelInput.value);
    const zfw = aircraft.oew + pax * PAX_MASS;
    const tow = zfw + fuel;
    const trip = plannedTrip();
    const lw = tow - trip;
    const speed = (base, mass) => Math.round(base * Math.sqrt(mass / aircraft.mass));
    const t = (kg) => `${(kg / 1000).toFixed(1)} T`;
    const overMtow = tow > aircraft.mtow;
    const overMlw = lw > aircraft.mlw;
    const shortFuel = fuel < trip + aircraft.reserveFuel;
    $("#pax-value").textContent = `${pax} / ${aircraft.maxPax}`;
    $("#fuel-value").textContent = t(fuel);
    $("#load-stats").replaceChildren(...[
      [loadMode === "landing" ? "WEIGHT NOW" : "TAKEOFF WEIGHT", `${t(tow)} / ${t(aircraft.mtow)}`, overMtow ? "bad" : "good"],
      ["LANDING WEIGHT", `${t(lw)} / ${t(aircraft.mlw)}`, overMlw ? "bad" : "good"],
      [loadMode === "flight" ? "TRIP FUEL" : "FUEL USED", t(trip), ""],
      ["RESERVE", t(aircraft.reserveFuel), shortFuel ? "bad" : "good"],
      ["VR", `${speed(aircraft.vr, tow)} KT`, ""],
      ["VAPP", `${speed(aircraft.vapp, lw)} KT`, ""],
      ["ZERO-FUEL WT", t(zfw), ""],
      ["PAYLOAD", t(pax * PAX_MASS), ""],
    ].map(statRow));
    const notes = [];
    if (overMtow) notes.push(`Over the maximum takeoff weight by ${t(tow - aircraft.mtow)}. Take less fuel or fewer passengers.`);
    if (shortFuel) notes.push("Not enough fuel for the trip plus the reserve. You may run dry.");
    if (overMlw) notes.push("You'll land above the maximum landing weight, which costs points. Carry less fuel.");
    $("#load-note").textContent = notes.join(" ") || "Load is within limits.";
    $("#load-note").classList.toggle("is-warning", notes.length > 0);
    $("#depart-button").disabled = overMtow;
  }
  paxInput.addEventListener("input", updateLoadSheet);
  fuelInput.addEventListener("input", updateLoadSheet);
  $("#auto-fuel-button").addEventListener("click", () => {
    const pax = Number(paxInput.value);
    const room = aircraft.mtow - aircraft.oew - pax * PAX_MASS;
    fuelInput.value = clamp(Math.round((plannedTrip() * 1.15 + aircraft.reserveFuel) / 100) * 100, 0, Math.min(aircraft.maxFuel, room));
    updateLoadSheet();
    buzz(6);
  });
  $("#load-back-button").addEventListener("click", () => { $("#load-overlay").hidden = true; });
  $("#depart-button").addEventListener("click", () => {
    settings.loads = { ...(settings.loads || {}), [`${aircraft.id}|${settings.route}`]: { pax: Number(paxInput.value), fuel: Number(fuelInput.value) } };
    saveSettings();
    $("#load-overlay").hidden = true;
    startFlight(loadMode);
  });
  $("#route-picker").addEventListener("click", () => {
    settings.route = (settings.route + 1) % ROUTES.length;
    applyRoute(settings.route);
    resetSim();
    saveSettings();
    updateMenu();
    buzz(6);
  });
  $("#aircraft-picker").addEventListener("click", () => {
    const ids = Object.keys(AIRCRAFT);
    settings.aircraft = ids[(ids.indexOf(settings.aircraft) + 1) % ids.length];
    applyAircraft(settings.aircraft);
    resetSim();
    saveSettings();
    updateMenu();
    buzz(6);
  });
  $("#weather-picker").addEventListener("click", () => cycleSetting("weather", WEATHER));
  $("#time-picker").addEventListener("click", () => cycleSetting("time", TIMES));

  // Autopilot panel
  const toggleFcu = () => {
    if (sim.state !== "flying") return;
    fcuOpen = !fcuOpen;
    buzz(6);
  };
  $("#fcu-button").addEventListener("click", toggleFcu);
  $("#ap-button").addEventListener("click", toggleAp);
  $("#athr-button").addEventListener("click", toggleAthr);
  $("#appr-button").addEventListener("click", toggleAppr);
  for (const knob of document.querySelectorAll(".knob")) {
    for (const button of knob.querySelectorAll("button")) {
      let timer = null;
      const turn = () => adjustKnob(knob.dataset.knob, Number(button.dataset.step));
      const stop = () => {
        clearTimeout(timer);
        clearInterval(timer);
        timer = null;
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        stop();
        turn();
        timer = setTimeout(() => { timer = setInterval(turn, 90); }, 380);
      });
      for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, stop);
    }
  }

  // Replay
  $("#replay-button").addEventListener("click", startReplay);
  $("#replay-exit").addEventListener("click", exitReplay);
  $("#replay-restart").addEventListener("click", restartReplay);
  $("#replay-play").addEventListener("click", () => {
    if (replay.t >= replay.end) restartReplay();
    else replay.playing = !replay.playing;
  });
  $("#replay-speed").addEventListener("click", () => { replay.speed = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(replay.speed) + 1) % REPLAY_SPEEDS.length]; });
  $("#replay-cam").addEventListener("click", () => { replay.cam = REPLAY_CAMS[(REPLAY_CAMS.indexOf(replay.cam) + 1) % REPLAY_CAMS.length]; });

  // Settings in the pause menu
  const invertButton = $("#invert-button");
  const sensitivityButton = $("#sensitivity-button");
  function showControlSettings() {
    setPressed(invertButton, settings.invert);
    invertButton.textContent = `INVERT PITCH: ${settings.invert ? "ON" : "OFF"}`;
    $("#pitch-hint").textContent = settings.invert ? "DRAG ↓ NOSE UP" : "DRAG ↑ NOSE UP";
    sensitivityButton.textContent = `STICK: ${SENSITIVITY[settings.sensitivity].label}`;
  }
  invertButton.addEventListener("click", () => {
    settings.invert = !settings.invert;
    saveSettings();
    showControlSettings();
  });
  sensitivityButton.addEventListener("click", () => {
    const keys = Object.keys(SENSITIVITY);
    settings.sensitivity = keys[(keys.indexOf(settings.sensitivity) + 1) % keys.length];
    saveSettings();
    showControlSettings();
  });

  const soundButton = $("#sound-button");
  soundButton.addEventListener("click", () => {
    audio.init();
    audio.setEnabled(!audio.enabled);
    setPressed(soundButton, audio.enabled);
  });
  const fullscreenButton = $("#fullscreen-button");
  if (!document.documentElement.requestFullscreen) fullscreenButton.hidden = true;
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        await screen.orientation?.lock?.("landscape");
      }
    } catch { /* fullscreen or orientation lock not allowed */ }
  });

  // Installable app: offline cache plus the browser's install prompt where it exists.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  let installPrompt = null;
  const installButton = $("#install-button");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installButton.hidden = true; });

  window.addEventListener("keydown", (event) => {
    if (event.target.closest?.("input, textarea")) return;
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", " ", "w", "s"].includes(key)) event.preventDefault();
    input.keys.add(key);
    if (event.repeat) return;
    if (replay.active) {
      if (key === " ") replay.playing = !replay.playing;
      if (key === "escape") exitReplay();
      return;
    }
    if (key === " ") setPaused(!sim.paused);
    if (key === "g") toggleGear();
    if (key === "f") moveFlaps(1);
    if (key === "r") moveFlaps(-1);
    if (key === "z") toggleSpeedbrake();
    if (key === "b") sim.brakesHeld = true;
    if (key === "t") cycleRate();
    if (key === "m") soundButton.click();
    if (key === "a") toggleAp();
    if (key === "q") toggleAthr();
    if (key === "l") toggleAppr();
    if (key === "p") toggleFcu();
    if ((key === "arrowup" || key === "arrowdown") && sim.fg.athr) disconnectAthr("A/THR OFF · LEVERS MOVED");
    if (key === "enter" && sim.state === "ready") startFlight("flight");
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    input.keys.delete(key);
    if (key === "b") sim.brakesHeld = false;
  });
  window.addEventListener("blur", () => {
    input.keys.clear();
    sim.brakesHeld = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true);
    else if (sim.state !== "ready") wake.request();
  });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.visualViewport?.addEventListener("resize", resize);

  function updateKeys(dt) {
    const keys = input.keys;
    const want = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    input.keyPitch = want ? clamp(input.keyPitch + want * dt * 2.5, -1, 1) : 0;
    const keyPitch = input.keyPitch * (settings.invert ? -1 : 1);
    input.pitch = Math.abs(keyPitch) > Math.abs(input.touchPitch) ? keyPitch : input.touchPitch;
    const thrust = (keys.has("arrowup") ? 1 : 0) - (keys.has("arrowdown") ? 1 : 0);
    if (thrust && !replay.active) sim.throttle = clamp(sim.throttle + thrust * dt * 0.45, 0, 1);
  }

  // ---------- main loop ----------
  // Slow devices: if drawing keeps eating most of the frame, render at a lower pixel density.
  let slowFrames = 0;
  function adaptResolution(ms) {
    view.frameMs += (ms - view.frameMs) * 0.05;
    slowFrames = view.frameMs > 12 ? slowFrames + 1 : 0;
    if (slowFrames > 120 && view.dprCap > 1 && view.dpr > 1) {
      view.dprCap = Math.max(1, view.dpr - 0.5);
      view.frameMs = 0;
      slowFrames = 0;
      resize();
    }
  }
  let lastFrame = 0;
  let accumulator = 0;
  function frame(timestamp) {
    const dt = lastFrame ? Math.min(0.1, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp;
    updateKeys(dt);
    if (replay.active) {
      stepReplay(dt);
    } else if (!sim.paused && sim.state !== "ready") {
      if (sim.rate > 1 && !rateAllowed()) {
        sim.rate = 1;
        flash("BACK TO 1× BELOW 2,500 FT");
      }
      accumulator += dt * sim.rate;
      for (let steps = 0; accumulator >= PHYSICS_DT && steps < 1200; steps += 1) {
        step(PHYSICS_DT);
        accumulator -= PHYSICS_DT;
      }
      callouts();
      sim.messageTimer = Math.max(0, sim.messageTimer - dt);
      if (sim.state === "crashed" || sim.state === "landed" || sim.state === "done") {
        sim.endTimer += dt;
        if (!sim.resultShown && sim.endTimer > (sim.state === "crashed" ? 1.8 : 1)) showResult();
      }
    }
    // iOS home-screen apps can change the layout (rotation, status bar) without a usable resize event;
    // a canvas whose pixel size no longer matches its box gets stretched, so re-check every frame.
    const box = (value) => Math.max(1, value);
    if (box(canvas.clientWidth) !== view.w || box(canvas.clientHeight) !== view.h || box(vdCanvas.clientWidth) !== view.vdW
      || box(vdCanvas.clientHeight) !== view.vdH || Math.min(window.devicePixelRatio || 1, view.dprCap) !== view.dpr) resize();
    updateCamera(dt);
    const renderStart = performance.now();
    render();
    drawVD();
    adaptResolution(performance.now() - renderStart);
    updateHud();
    audio.update(sim.paused);
    requestAnimationFrame(frame);
  }

  resetSim();
  resize();
  updateCamera(10);
  showBest();
  updateMenu();
  showControlSettings();
  requestAnimationFrame(frame);
  // A shared #livery= link selects that aircraft and opens the editor on the livery.
  if (location.hash.startsWith("#livery=")) {
    const code = decodeURIComponent(location.hash.slice("#livery=".length));
    history.replaceState(null, "", location.pathname + location.search);
    useLiveryCode(code, "a shared link").catch((err) => openLivery(null, err.message));
  }

  // Hook for automated flight checks and console debugging.
  window.BBFS = {
    sim, input, step, startFlight, showMenu, startReplay, exitReplay, replay, setThrottle, moveFlaps, toggleGear, toggleAp, toggleAthr, toggleAppr, settings,
    PHYSICS_DT, glidepathAlt, profileAlt, groundAt, applyRoute: (index) => { settings.route = index; applyRoute(index); resetSim(); updateMenu(); },
    getMode: () => mode,
    vrKt, vappKt, flapSpeed, startChallenge, CHALLENGES, dailyChallenge, liveryCode, readLiveryCode, useSettings, terrainAhead, themeAt, mountainsAt,
    setLoad: (load) => setLoad(load),
    getChallenge: () => challenge,
    renderFrame: () => { updateCamera(0.016); render(); drawVD(); updateHud(); },
    get route() { return route; },
    get aircraft() { return aircraft; },
    get TAIL_STRIKE() { return TAIL_STRIKE; },
    applyAircraft: (id) => { settings.aircraft = id; applyAircraft(id); resetSim(); updateMenu(); },
    get TOD_X() { return TOD_X; },
    get INTERCEPT_X() { return INTERCEPT_X; },
    get TOUCHDOWN_X() { return TOUCHDOWN_X; },
  };
})();
