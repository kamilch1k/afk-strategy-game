import "./styles.css";
import * as THREE from "three";
import {
  createIcons,
  Crosshair,
  Factory,
  Hammer,
  Home,
  Map as MapIcon,
  Pause,
  Pickaxe,
  Play,
  Shield,
  Swords,
  Target,
  Users,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide";

createIcons({
  icons: {
    Crosshair,
    Factory,
    Hammer,
    Home,
    Map: MapIcon,
    Pause,
    Pickaxe,
    Play,
    Shield,
    Swords,
    Target,
    Users,
    Zap,
    ZoomIn,
    ZoomOut,
  },
});

const canvas = document.querySelector("#world");
const minimapCanvas = document.querySelector("#minimap");
const selectionBox = document.querySelector("#selectionBox");
const civName = document.querySelector("#civName");
const directiveReadout = document.querySelector("#directiveReadout");
const foodReadout = document.querySelector("#foodReadout");
const oreReadout = document.querySelector("#oreReadout");
const powerReadout = document.querySelector("#powerReadout");
const supplyReadout = document.querySelector("#supplyReadout");
const hqReadout = document.querySelector("#hqReadout");
const hqMeter = document.querySelector("#hqMeter");
const timeReadout = document.querySelector("#timeReadout");
const pauseToggle = document.querySelector("#pauseToggle");
const speedToggle = document.querySelector("#speedToggle");
const resetViewButton = document.querySelector("#resetView");
const zoomInButton = document.querySelector("#zoomIn");
const zoomOutButton = document.querySelector("#zoomOut");
const directiveButtons = document.querySelector("#directiveButtons");
const selectedCount = document.querySelector("#selectedCount");
const selectedTitle = document.querySelector("#selectedTitle");
const selectedBody = document.querySelector("#selectedBody");
const aliveReadout = document.querySelector("#aliveReadout");
const civList = document.querySelector("#civList");
const workerReadout = document.querySelector("#workerReadout");
const armyReadout = document.querySelector("#armyReadout");
const buildingReadout = document.querySelector("#buildingReadout");
const killsReadout = document.querySelector("#killsReadout");
const lossesReadout = document.querySelector("#lossesReadout");
const winnerReadout = document.querySelector("#winnerReadout");
const eventLog = document.querySelector("#eventLog");
const battleMessage = document.querySelector("#battleMessage");
const mainMenu = document.querySelector("#mainMenu");
const pauseMenu = document.querySelector("#pauseMenu");
const startSkirmishButton = document.querySelector("#startSkirmish");
const resumeGameButton = document.querySelector("#resumeGame");
const restartGameButton = document.querySelector("#restartGame");
const exitToMenuButton = document.querySelector("#exitToMenu");
const attackOrderButton = document.querySelector("#attackOrder");
const defendOrderButton = document.querySelector("#defendOrder");
const statTime = document.querySelector("#statTime");
const statKills = document.querySelector("#statKills");
const statLosses = document.querySelector("#statLosses");
const statBuildings = document.querySelector("#statBuildings");
const statArmy = document.querySelector("#statArmy");
const statWorkers = document.querySelector("#statWorkers");
const menuSessions = document.querySelector("#menuSessions");
const menuBestTime = document.querySelector("#menuBestTime");
const menuBestKills = document.querySelector("#menuBestKills");
const menuWins = document.querySelector("#menuWins");
const menuRenown = document.querySelector("#menuRenown");
const offlineNote = document.querySelector("#offlineNote");

const MAP_SIZE = 200;
const HALF_MAP = MAP_SIZE / 2;
const TERRAIN_TEXTURE_SIZE = 8;
const TERRAIN_BASE_Y = -1.2;
const SKY_RADIUS = 820;
const SAVE_KEY = "afkDominionRtsStats";
const MAP_SEED = Math.random() * 10000;
const MAX_PIXEL_RATIO = 1.6;
const ISO_YAW = -Math.PI / 4;
const ISO_PITCH = 0.82;
const MIN_PITCH = 0.42; // clamp camera pitch while rotating (radians)
const MAX_PITCH = 1.4;
const MIN_ZOOM = 34;
const MAX_ZOOM = 215;
const CAMERA_LOOK_HEIGHT = 1.1;
const VIEW_TANGENT = Math.tan((31 * Math.PI) / 360); // preserve the old 31° vertical view scale across the ortho zoom range
const SPATIAL_CELL = 8; // uniform grid cell for O(1) nearest-enemy queries
const NAV_CELL = 2; // coarse A* pathfinding grid cell (world units)
const NAV_W = Math.floor(MAP_SIZE / NAV_CELL);
const NAV_H = Math.floor(MAP_SIZE / NAV_CELL);
const NAV_DIRECT_RANGE = 11; // closer than this, units steer straight; farther, they pathfind
const PATH_BUDGET = 6; // max A* solves processed per frame (the rest wait in a queue)
const RESOURCE_LOW_WATER = 85;
const THINK_INTERVAL = 2.1;
const SUDDEN_DEATH_START = 480; // seconds — after this every HQ decays so a match can't stalemate forever
const RESTART_DELAY = 7; // seconds the victory banner shows before the next skirmish auto-starts (the AFK loop)
const OFFLINE_RATE = 0.05; // Renown earned per second while away (idle accrual)
const OFFLINE_CAP = 8 * 3600; // offline progress caps at 8 hours
const UI_INTERVAL = 0.18;

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpCameraLook = new THREE.Vector3();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const resourceText = (value) => Math.floor(value).toLocaleString("en-US");
const colorHex = (value) => `#${value.toString(16).padStart(6, "0")}`;
const distSq2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const mapNoise = (x, z, seed = 0) => {
  const value = Math.sin((x + 17.37) * 18.179 + (z - 4.91) * 41.233 + seed * 97.17) * 43758.5453;
  return value - Math.floor(value);
};
const removeFrom = (array, item) => {
  const index = array.indexOf(item);
  if (index >= 0) array.splice(index, 1);
};

const DIRECTIVES = {
  balanced: { label: "Balanced doctrine", workers: 14, army: 12, defense: 1, tech: 1, aggression: 0.58 },
  economy: { label: "Economy boom", workers: 24, army: 8, defense: 1, tech: 1, aggression: 0.32 },
  military: { label: "Military pressure", workers: 15, army: 26, defense: 1, tech: 1, aggression: 0.92 },
  tech: { label: "Tech climb", workers: 18, army: 14, defense: 1, tech: 3, aggression: 0.5 },
  defense: { label: "Fortified hold", workers: 18, army: 16, defense: 4, tech: 1, aggression: 0.28 },
};

const FACTION_BLUEPRINTS = [
  {
    id: "verdant",
    name: "Verdant Concord",
    shortName: "Verdant",
    start: new THREE.Vector3(-66, 0, 58),
    color: 0x78c957,
    accent: 0xf0d46a,
    material: 0x2f5d3f,
    directive: "balanced",
    player: true,
    bonus: { gather: 1.12, workerCost: 0.92, unitHp: 1, unitDamage: 1 },
  },
  {
    id: "iron",
    name: "Iron Dominion",
    shortName: "Iron",
    start: new THREE.Vector3(66, 0, -58),
    color: 0xc75449,
    accent: 0xbec7cf,
    material: 0x5a6066,
    directive: "military",
    bonus: { gather: 0.98, workerCost: 1, unitHp: 1.18, unitDamage: 1.04 },
  },
  {
    id: "sunspire",
    name: "Sunspire League",
    shortName: "Sunspire",
    start: new THREE.Vector3(66, 0, 58),
    color: 0xe6b64c,
    accent: 0x52b8d8,
    material: 0x9d762f,
    directive: "tech",
    bonus: { gather: 1, workerCost: 1, unitHp: 0.96, unitDamage: 1.12, power: 1.22 },
  },
  {
    id: "umbral",
    name: "Umbral Nexus",
    shortName: "Umbral",
    start: new THREE.Vector3(-66, 0, -58),
    color: 0x8d6ae3,
    accent: 0x59e0c9,
    material: 0x3f345d,
    directive: "defense",
    bonus: { gather: 0.96, workerCost: 1, unitHp: 0.96, unitDamage: 1.08, speed: 1.14 },
  },
];

const TERRAIN_FEATURES = [
  { x: -18, z: 18, height: 2.25, rx: 18, rz: 11 },
  { x: 23, z: -8, height: 1.95, rx: 16, rz: 20 },
  { x: -30, z: -18, height: 1.65, rx: 12, rz: 15 },
  { x: 8, z: 30, height: 1.35, rx: 22, rz: 9 },
  { x: 30, z: 24, height: 1.25, rx: 10, rz: 13 },
  { x: -4, z: -34, height: 1.75, rx: 20, rz: 8 },
  // more hills spread across the larger map for varied terrain
  { x: -64, z: 8, height: 2.7, rx: 16, rz: 14 },
  { x: 60, z: -16, height: 2.5, rx: 15, rz: 17 },
  { x: 40, z: 62, height: 2.2, rx: 18, rz: 12 },
  { x: -46, z: 46, height: 2.0, rx: 14, rz: 16 },
  { x: 14, z: -64, height: 2.4, rx: 20, rz: 13 },
  { x: -22, z: 72, height: 2.1, rx: 22, rz: 11 },
  { x: 80, z: 32, height: 2.9, rx: 13, rz: 18 },
  { x: -80, z: -42, height: 2.7, rx: 15, rz: 15 },
  { x: 54, z: -52, height: 2.0, rx: 17, rz: 14 },
  { x: 2, z: 6, height: 1.5, rx: 24, rz: 22 },
];

const BUILDING_TYPES = {
  hq: {
    name: "HQ",
    hp: 1150,
    radius: 2.9,
    supply: 18,
    weaponRange: 9,
    weaponDamage: 13,
    cooldown: 1.1,
    income: { food: 0.5, ore: 0.4, power: 0.2 }, // passive trickle so a harassed economy never fully collapses
  },
  refinery: {
    name: "Refinery",
    hp: 520,
    radius: 1.7,
    cost: { ore: 80 },
    gatherBoost: 0.2,
  },
  barracks: {
    name: "Barracks",
    hp: 700,
    radius: 2,
    cost: { food: 70, ore: 110 },
    supply: 12,
  },
  solar: {
    name: "Solar Array",
    hp: 420,
    radius: 1.6,
    cost: { ore: 70 },
    income: { power: 0.55 },
  },
  turret: {
    name: "Turret",
    hp: 560,
    radius: 1.4,
    cost: { ore: 90, power: 24 },
    weaponRange: 12,
    weaponDamage: 18,
    cooldown: 0.85,
  },
  academy: {
    name: "Academy",
    hp: 620,
    radius: 1.8,
    cost: { ore: 125, power: 75 },
    tech: 1,
  },
};

const UNIT_TYPES = {
  worker: {
    name: "Worker",
    hp: 70,
    damage: 4,
    range: 0.55,
    cooldown: 1.2,
    speed: 4.15,
    radius: 0.34,
    supply: 1,
    cost: { food: 34 },
    role: "worker",
    trainAt: ["hq"],
  },
  scout: {
    name: "Scout",
    hp: 75,
    damage: 7,
    range: 0.75,
    cooldown: 0.92,
    speed: 5.55,
    radius: 0.33,
    supply: 1,
    cost: { food: 35, power: 10 },
    role: "army",
    trainAt: ["barracks"],
  },
  soldier: {
    name: "Soldier",
    hp: 125,
    damage: 15,
    range: 1,
    cooldown: 1.05,
    speed: 3.75,
    radius: 0.4,
    supply: 1,
    cost: { food: 45, ore: 28 },
    role: "army",
    trainAt: ["barracks"],
  },
  siege: {
    name: "Siege Walker",
    hp: 220,
    damage: 36,
    range: 6,
    cooldown: 2,
    speed: 2.55,
    radius: 0.65,
    supply: 3,
    cost: { ore: 95, power: 64 },
    role: "army",
    trainAt: ["academy"],
    requiresTech: 1,
    splash: 1.8,
  },
  archer: {
    name: "Archer",
    hp: 80,
    damage: 11,
    range: 3.4,
    cooldown: 1.0,
    speed: 4.2,
    radius: 0.34,
    supply: 1,
    cost: { food: 38, ore: 18 },
    role: "army",
    trainAt: ["barracks"],
  },
};

const RESOURCE_TYPES = {
  food: { name: "Grove", color: 0x5eb95b, accent: 0xa7d86f, amount: 1800 },
  ore: { name: "Ore Vein", color: 0x727b86, accent: 0xc3cad0, amount: 1500 },
  power: { name: "Power Shard", color: 0x3488db, accent: 0x83e2f2, amount: 900 },
};

const TERRAIN_PATTERNS = {
  grass: ["01002010", "00100020", "10002001", "02010000", "00020100", "20001020", "01000010", "10020102"],
  dirt: ["02030120", "30012003", "10230012", "01003001", "23001020", "00120300", "12003010", "00301023"],
  sand: ["00010000", "01000200", "00000010", "10002000", "00200010", "00010000", "02000001", "00001020"],
  water: ["00111100", "01222110", "12200021", "22033302", "10033001", "01200021", "00122210", "00011100"],
  rock: ["01230123", "23012001", "10230301", "03120120", "12030012", "00312030", "23001023", "01230120"],
};

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);

// ponytail: orthographic so a pan translates the whole scene uniformly — no perspective parallax, props stay glued to the ground
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 2000);
const cameraState = {
  target: new THREE.Vector3(0, CAMERA_LOOK_HEIGHT, 0),
  distance: 82,
  yaw: ISO_YAW,
  pitch: ISO_PITCH,
};
// Camera basis, recomputed whenever yaw/pitch change (middle-mouse rotate).
// Pan and keyboard movement read these so they stay screen-relative after rotating.
const CAMERA_DIR = new THREE.Vector3();
const PAN_FORWARD = new THREE.Vector3();
const PAN_RIGHT = new THREE.Vector3();
function recomputeCameraBasis() {
  const y = cameraState.yaw;
  const p = cameraState.pitch;
  CAMERA_DIR.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  PAN_FORWARD.set(Math.sin(y), 0, Math.cos(y)).normalize();
  PAN_RIGHT.set(PAN_FORWARD.z, 0, -PAN_FORWARD.x).normalize();
}
recomputeCameraBasis();

const terrainGroup = new THREE.Group();
const resourceGroup = new THREE.Group();
const structureGroup = new THREE.Group();
const unitGroup = new THREE.Group();
const effectGroup = new THREE.Group();
const skyGroup = new THREE.Group();
scene.add(skyGroup, terrainGroup, resourceGroup, structureGroup, unitGroup, effectGroup);

const textureCache = new Map();
const materials = {};
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const barFillGeometry = cubeGeometry.clone(); // left-anchored unit cube for health-bar fills; never mutate the shared cubeGeometry
barFillGeometry.translate(0.5, 0, 0);
const ringGeometry = new THREE.RingGeometry(0.58, 0.68, 32);
ringGeometry.rotateX(-Math.PI / 2);
const structureRingGeometry = new THREE.RingGeometry(1.8, 2.04, 48);
structureRingGeometry.rotateX(-Math.PI / 2);
const shotGeometry = new THREE.SphereGeometry(0.12, 8, 6);
const resourceCrystalGeometry = new THREE.OctahedronGeometry(0.7, 0);

const factions = [];
const units = [];
const structures = [];
const resourceNodes = [];
const blockers = [];
const projectiles = [];

let playerFaction = null;
let skySphere = null;
let hoverEntity = null;
let uiTimer = 0;
let gameSpeed = 1; // fast-forward multiplier (1/2/4): runs that many sim sub-steps per frame
let playerDmgMul = 1; // player-unit multipliers from purchased Renown upgrades (recomputed each game)
let playerHpMul = 1;
let playerEcoMul = 1;
const UPGRADES = [
  { id: "dmg", name: "Forged Blades", max: 8 },
  { id: "hp", name: "Tempered Plate", max: 8 },
  { id: "eco", name: "War Economy", max: 8 },
];
const upgradeCost = (level) => 80 * (level + 1); // escalating Renown cost per level

const game = {
  started: false,
  paused: true,
  time: 0,
  directive: "balanced",
  winner: null,
  selected: [],
  lastMessageAt: 0,
  stats: {
    kills: 0,
    losses: 0,
    buildingsBuilt: 0,
    sessions: 0,
  },
};

window.__afkStrategyDebug = {
  getStructureSnapshot: () => structures
    .filter((structure) => structure.alive)
    .map((structure) => ({
      id: structure.id,
      type: structure.type,
      x: Number(structure.position.x.toFixed(3)),
      y: Number(structure.position.y.toFixed(3)),
      z: Number(structure.position.z.toFixed(3)),
      gx: Number(structure.group.position.x.toFixed(3)),
      gy: Number(structure.group.position.y.toFixed(3)),
      gz: Number(structure.group.position.z.toFixed(3)),
      ax: Number((structure.anchorX ?? structure.position.x).toFixed(3)),
      az: Number((structure.anchorZ ?? structure.position.z).toFixed(3)),
    })),
  step: (dt = 0.05, n = 1) => {
    for (let i = 0; i < n; i += 1) stepSimulation(dt);
    return window.__afkStrategyDebug.state();
  },
  render: () => {
    enforceStructureAnchors();
    updateCamera();
    renderer.render(scene, camera);
  },
  drawMinimap: () => drawMinimap(),
  ui: () => updateUI(true),
  applyOffline: () => { applyOfflineProgress(); updateMenuStats(); return { offlineEarned: game.offlineEarned, renown: loadStats().renown }; },
  renownInfo: () => {
    const ps = units.find((u) => u.alive && u.faction.player && u.role === "army");
    const as = ps ? units.find((u) => u.alive && !u.faction.player && u.role === "army" && u.type === ps.type) : null;
    return { playerDmgMul, playerHpMul, playerEcoMul, upgrades: loadStats().upgrades, renown: loadStats().renown ?? 0, playerType: ps?.type, playerBaseDmg: ps ? Number(ps.baseDamage.toFixed(2)) : null, aiBaseDmg: as ? Number(as.baseDamage.toFixed(2)) : null };
  },
  look: (x, z, dist, yaw, pitch) => {
    cameraState.target.set(x, CAMERA_LOOK_HEIGHT, z);
    if (dist) cameraState.distance = clamp(dist, MIN_ZOOM, MAX_ZOOM);
    if (yaw !== undefined) cameraState.yaw = yaw;
    if (pitch !== undefined) cameraState.pitch = clamp(pitch, MIN_PITCH, MAX_PITCH);
    recomputeCameraBasis();
    applyCameraFrustum();
    updateCamera();
  },
  showcase: () => {
    const f = playerFaction;
    ["refinery", "barracks", "solar", "turret", "academy"].forEach((t, i) => createStructure(t, f, f.start.x + (i - 2) * 7, f.start.z - 15, true));
    ["worker", "scout", "soldier", "siege"].forEach((t, i) => spawnUnit(t, f, f.start.x + (i - 1.5) * 3, f.start.z - 7, true));
    return window.__afkStrategyDebug.state();
  },
  state: () => ({
    time: Number(game.time.toFixed(2)),
    started: game.started,
    paused: game.paused,
    gameSpeed,
    units: units.filter((u) => u.alive).length,
    withPath: units.filter((u) => u.alive && u.path).length,
    pathQueue: pathQueue.length,
    structures: structures.filter((s) => s.alive).length,
    factionsAlive: factions.filter((f) => !f.defeated).length,
    playerFood: Math.floor(playerFaction?.resources.food ?? 0),
    kills: game.stats.kills,
    yaw: Number(cameraState.yaw.toFixed(3)),
    pitch: Number(cameraState.pitch.toFixed(3)),
  }),
  attackProbe: () => {
    const atk = units.filter((u) => u.alive && u.order?.type === "attack");
    let withPath = 0;
    let pending = 0;
    let near = 0;
    let minD = 1e9;
    let sumD = 0;
    for (const u of atk) {
      if (u.path) withPath += 1;
      if (u.pathPending) pending += 1;
      const obj = u.order.objective;
      if (obj && obj.alive) {
        const d = Math.hypot(u.position.x - obj.position.x, u.position.z - obj.position.z);
        sumD += d;
        if (d < minD) minD = d;
        if (d < 18) near += 1;
      }
    }
    return { attackUnits: atk.length, withPath, pending, withinBaseRange: near, minDistToObj: Math.round(minD), avgDistToObj: Math.round(sumD / Math.max(1, atk.length)) };
  },
  vetProbe: () => {
    const army = units.filter((u) => u.alive && u.role === "army");
    let maxRank = 0;
    let veterans = 0;
    let sample = null;
    for (const u of army) {
      if (u.rank > maxRank) maxRank = u.rank;
      if (u.rank > 0) {
        veterans += 1;
        if (!sample) sample = { type: u.type, rank: u.rank, kills: u.kills, dmg: Number(u.damage.toFixed(1)), baseDmg: Number(u.baseDamage.toFixed(1)), maxHp: u.maxHp, baseMaxHp: u.baseMaxHp };
      }
    }
    return { army: army.length, veterans, maxRank, sample };
  },
  regenTest: () => {
    const f = playerFaction;
    const u = spawnUnit("soldier", f, f.start.x, f.start.z, true);
    u.hp = 10;
    const before = u.hp;
    for (let i = 0; i < 50; i += 1) stepSimulation(0.05); // 2.5s
    return { maxHp: u.maxHp, hpBefore: before, hpAfter: Number(u.hp.toFixed(1)), healed: Number((u.hp - before).toFixed(1)) };
  },
  unitTypes: () => {
    const counts = {};
    let archerRange = null;
    for (const u of units) {
      if (!u.alive) continue;
      counts[u.type] = (counts[u.type] || 0) + 1;
      if (u.type === "archer" && archerRange === null) archerRange = u.range;
    }
    return { counts, archerRange };
  },
  combatProbe: () => {
    let army = 0;
    let inContact = 0;
    let inField = 0;
    for (const u of units) {
      if (!u.alive || u.role !== "army") continue;
      army += 1;
      if (nearestEnemyEntity(u.position, u.faction, u.range + 5)) inContact += 1;
      let nearBase = false;
      for (const f of factions) if (f.hq?.alive && u.position.distanceToSquared(f.hq.position) < 28 * 28) { nearBase = true; break; }
      if (!nearBase) inField += 1;
    }
    return { army, inContact, inField };
  },
  factions: () => factions.map((f) => ({
    id: f.id,
    defeated: f.defeated,
    units: f.units.filter((u) => u.alive).length,
    army: f.units.filter((u) => u.alive && u.role === "army").length,
    attacking: f.units.filter((u) => u.alive && u.order?.type === "attack").length,
    structures: f.structures.filter((s) => s.alive).length,
    hq: f.hq?.alive ? Math.round(f.hq.hp) : 0,
    food: Math.floor(f.resources.food),
    ore: Math.floor(f.resources.ore),
  })),
};

const pointer = {
  active: false,
  id: null,
  button: 0,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  moved: false,
  selecting: false,
  panning: false,
  startEntity: null,
};

const keys = new Set();

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorString(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function createIndexedTexture(key, paletteHexes, pattern) {
  const cacheKey = `${key}-${paletteHexes.join("-")}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = TERRAIN_TEXTURE_SIZE;
  canvasTexture.height = TERRAIN_TEXTURE_SIZE;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const palette = paletteHexes.map(hexToRgb);
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const index = Number.parseInt(pattern[y]?.[x] ?? "0", 10);
      ctx.fillStyle = colorString(palette[index] ?? palette[0]);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

function createUnitTexture(type, faction) {
  const key = `${type}-${faction.id}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 32;
  canvasTexture.height = 32;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 32, 32);
  const body = colorHex(faction.color);
  const accent = colorHex(faction.accent);
  const dark = "#171c1f";
  const steel = "#cfd4d8";
  const skin = "#e8c08c";
  const rect = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  rect(9, 27, 14, 3, "rgba(0,0,0,0.30)"); // ground shadow
  if (type === "worker") {
    rect(11, 25, 4, 3, dark); rect(17, 25, 4, 3, dark); // legs
    rect(10, 13, 12, 12, body); // torso
    rect(10, 13, 12, 2, accent); // belt
    rect(12, 7, 8, 7, skin); // head
    rect(11, 6, 10, 3, accent); // hard hat
    rect(21, 12, 7, 2, "#9b6a39"); rect(26, 9, 2, 6, steel); // pickaxe
  } else if (type === "scout") {
    rect(12, 25, 3, 3, dark); rect(17, 25, 3, 3, dark);
    rect(11, 14, 10, 11, accent); // cloak
    rect(13, 8, 7, 7, skin); // head
    rect(12, 7, 9, 3, body); // hood
    rect(5, 9, 2, 16, "#8a5a2c"); rect(4, 9, 4, 2, "#8a5a2c"); rect(4, 23, 4, 2, "#8a5a2c"); // bow
  } else if (type === "siege") {
    rect(7, 24, 5, 4, dark); rect(20, 24, 5, 4, dark); // tracks
    rect(6, 13, 20, 12, body); // chassis
    rect(6, 13, 20, 3, accent); // trim
    rect(9, 9, 11, 6, "#5b6168"); // turret
    rect(18, 10, 11, 3, steel); // cannon
    rect(27, 9, 3, 5, dark); // muzzle
  } else if (type === "archer") {
    rect(12, 25, 3, 3, dark); rect(17, 25, 3, 3, dark); // legs
    rect(12, 13, 9, 12, body); // tunic
    rect(12, 13, 9, 2, accent);
    rect(13, 7, 7, 7, skin); // head
    rect(12, 6, 9, 3, accent); // cap
    rect(24, 5, 2, 22, "#9b6a39"); rect(23, 4, 2, 2, "#9b6a39"); rect(23, 26, 2, 2, "#9b6a39"); // bow
    rect(15, 15, 12, 1, steel); rect(27, 14, 3, 3, dark); // arrow + head
  } else {
    rect(12, 25, 3, 3, dark); rect(17, 25, 3, 3, dark);
    rect(8, 13, 4, 10, steel); // shield
    rect(11, 13, 10, 12, body); // armor
    rect(11, 13, 10, 2, accent);
    rect(13, 7, 7, 7, skin); // head
    rect(12, 6, 9, 3, accent); // helmet
    rect(22, 4, 2, 20, steel); rect(21, 3, 4, 4, steel); // spear
  }
  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  textureCache.set(key, texture);
  return texture;
}

function initMaterials() {
  materials.grass = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("grass", ["#477f35", "#5fae47", "#2f5f2f", "#b6bd5a"], TERRAIN_PATTERNS.grass),
    roughness: 0.96,
  });
  materials.dirt = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("dirt", ["#6b4726", "#8a6034", "#3d2b19", "#a47142"], TERRAIN_PATTERNS.dirt),
    roughness: 0.98,
  });
  materials.sand = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("sand", ["#cdb66e", "#ead18b", "#967e48", "#d9c17b"], TERRAIN_PATTERNS.sand),
    roughness: 0.92,
  });
  materials.water = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("water", ["#287fc1", "#3da6df", "#15558b", "#8ddcf0"], TERRAIN_PATTERNS.water),
    transparent: true,
    opacity: 0.9,
    roughness: 0.34,
  });
  materials.rock = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("rock", ["#686c67", "#8e928a", "#414640", "#757d70"], TERRAIN_PATTERNS.rock),
    roughness: 0.96,
  });
  materials.trunk = new THREE.MeshStandardMaterial({ color: 0x6a4324, roughness: 0.92, flatShading: true });
  materials.leaves = new THREE.MeshStandardMaterial({ color: 0x3f8b42, roughness: 0.96, flatShading: true });
  materials.leavesDark = new THREE.MeshStandardMaterial({ color: 0x2f6738, roughness: 0.98, flatShading: true });
  materials.outcrop = new THREE.MeshStandardMaterial({ color: 0x747a74, roughness: 0.96, flatShading: true });
  materials.selection = new THREE.MeshBasicMaterial({
    color: 0xbce57f,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  materials.enemySelection = new THREE.MeshBasicMaterial({
    color: 0xf06d5a,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });
  materials.shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
  });
}

function createSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1024;
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext("2d");

  // Vertical gradient: indigo zenith -> violet -> teal -> warm dusk horizon
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, "#070a1e");
  sky.addColorStop(0.32, "#141b3e");
  sky.addColorStop(0.58, "#26405c");
  sky.addColorStop(0.82, "#9d6a59");
  sky.addColorStop(1.0, "#e8b06a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Soft nebula clouds (faction-tinted)
  const cloud = (cx, cy, r, rgb, a) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  cloud(w * 0.24, h * 0.22, 640, "143,107,234", 0.18); // violet
  cloud(w * 0.68, h * 0.16, 560, "90,226,207", 0.13); // teal
  cloud(w * 0.5, h * 0.34, 760, "214,109,120", 0.08); // rose
  cloud(w * 0.86, h * 0.3, 500, "120,150,234", 0.1); // blue

  // Faint galaxy band
  ctx.save();
  ctx.translate(w * 0.55, h * 0.28);
  ctx.rotate(-0.34);
  const band = ctx.createLinearGradient(0, -130, 0, 130);
  band.addColorStop(0, "rgba(186,196,255,0)");
  band.addColorStop(0.5, "rgba(196,206,255,0.1)");
  band.addColorStop(1, "rgba(186,196,255,0)");
  ctx.fillStyle = band;
  ctx.fillRect(-w, -130, w * 2, 260);
  for (let i = 0; i < 700; i += 1) {
    ctx.globalAlpha = rand(0.2, 0.8);
    ctx.fillStyle = Math.random() < 0.5 ? "#cfe0ff" : "#ffffff";
    ctx.fillRect(rand(-w, w), (Math.random() - 0.5) * 210, 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Star field — denser/brighter high up, thinning toward the horizon
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.72;
    const fade = 1 - y / (h * 0.72);
    if (Math.random() > 0.4 + fade * 0.5) continue;
    const size = Math.random() < 0.9 ? 1 : 2;
    ctx.globalAlpha = rand(0.25, 1) * (0.4 + fade * 0.6);
    ctx.fillStyle = Math.random() < 0.78 ? "#eaf2ff" : Math.random() < 0.5 ? "#ffd9a0" : "#bcd0ff";
    ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }
  ctx.globalAlpha = 1;

  // Bright twinkle stars with halo + lens cross
  for (let i = 0; i < 18; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.55;
    const r = rand(2.5, 5);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
    halo.addColorStop(0, "rgba(255,255,255,0.9)");
    halo.addColorStop(0.3, "rgba(200,220,255,0.35)");
    halo.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 4, y);
    ctx.lineTo(x + r * 4, y);
    ctx.moveTo(x, y - r * 4);
    ctx.lineTo(x, y + r * 4);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sun glow low on the horizon
  const sx = w * 0.2;
  const sy = h * 0.66;
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, 380);
  sun.addColorStop(0, "rgba(255,238,186,0.95)");
  sun.addColorStop(0.18, "rgba(255,206,120,0.6)");
  sun.addColorStop(0.5, "rgba(255,170,90,0.18)");
  sun.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // Warm horizon haze
  const haze = ctx.createLinearGradient(0, h * 0.78, 0, h);
  haze.addColorStop(0, "rgba(255,200,140,0)");
  haze.addColorStop(1, "rgba(255,190,120,0.35)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSkybox() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    map: createSkyTexture(),
    side: THREE.BackSide,
    fog: false,
  });
  skySphere = new THREE.Mesh(geometry, material);
  skySphere.position.y = -90;
  skyGroup.add(skySphere);
}

function createLighting() {
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a3326, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0c8, 2.1); // warm key light
  sun.position.set(-40, 70, 30);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.7); // cool fill from the opposite side
  fill.position.set(46, 30, -34);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.5); // warm rim for edge separation
  rim.position.set(18, 16, -62);
  scene.add(rim);
}

const HEIGHT_DIM = MAP_SIZE + 1;
const heightField = new Float32Array(HEIGHT_DIM * HEIGHT_DIM); // precomputed terrain height per integer grid node

function waterScore(x, z) {
  const lake = ((x + 4) / 14) ** 2 + ((z + 2) / 10) ** 2;
  let river = Math.abs(z - Math.sin((x + MAP_SEED) * 0.07) * 10) / 3.4 + Math.abs(x) / 150;
  // Periodic land fords so the river never fully bisects the map — armies can always cross.
  if (Math.abs(((x + 600) % 32) - 16) < 4) river += 2;
  return Math.min(lake, river);
}

function isWater(x, z) {
  return waterScore(x, z) < 1;
}

function isShore(x, z) {
  if (isWater(x, z)) return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dz]) => isWater(x + dx, z + dz));
}

function plateauWeight(x, z) {
  let strongest = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const dist = Math.hypot(x - blueprint.start.x, z - blueprint.start.z);
    strongest = Math.max(strongest, clamp(1 - (dist - 6) / 8, 0, 1));
  }
  return strongest;
}

function terrainTopHeight(x, z) {
  if (isWater(x, z)) return -0.62;
  const roll =
    Math.sin((x + MAP_SEED) * 0.12) * 0.46 +
    Math.cos((z - MAP_SEED) * 0.16) * 0.38 +
    Math.sin((x * 0.07 + z * 0.13 + MAP_SEED) * 1.18) * 0.32;
  const ridge =
    Math.exp(-((x + 23) ** 2) / 320 - ((z - 4) ** 2) / 120) * 1.55 +
    Math.exp(-((x - 18) ** 2) / 220 - ((z + 18) ** 2) / 260) * 1.35;
  const features = TERRAIN_FEATURES.reduce((sum, feature) => {
    const dx = (x - feature.x) / feature.rx;
    const dz = (z - feature.z) / feature.rz;
    return sum + Math.exp(-(dx * dx + dz * dz)) * feature.height;
  }, 0);
  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF_MAP;
  const edgeRise = edge > 0.76 ? (edge - 0.76) * 5.2 : 0;
  const cut = mapNoise(Math.floor(x / 4), Math.floor(z / 4), 6) > 0.64 ? 0.34 : 0;
  const raw = clamp(roll + ridge + features + edgeRise - cut, -0.14, 4.45);
  const terraced = Math.round(raw / 0.34) * 0.34;
  return lerp(terraced, isShore(x, z) ? -0.12 : 0.1, plateauWeight(x, z));
}

function buildHeightField() {
  for (let ix = 0; ix <= MAP_SIZE; ix += 1) {
    for (let iz = 0; iz <= MAP_SIZE; iz += 1) {
      heightField[ix * HEIGHT_DIM + iz] = terrainTopHeight(ix - HALF_MAP, iz - HALF_MAP);
    }
  }
}

function heightAtGrid(ix, iz) {
  const cx = clamp(ix + HALF_MAP, 0, MAP_SIZE) | 0;
  const cz = clamp(iz + HALF_MAP, 0, MAP_SIZE) | 0;
  return heightField[cx * HEIGHT_DIM + cz];
}

function terrainKind(x, z) {
  if (isWater(x, z)) return "water";
  if (isShore(x, z)) return "sand";
  const height = heightAtGrid(Math.floor(x), Math.floor(z));
  if (height > 2.05) return "rock";
  if (height > 1.05 && mapNoise(Math.floor(x), Math.floor(z), 4) > 0.34) return "dirt";
  if (Math.sin(x * 0.2 + z * 0.17) > 0.72) return "dirt";
  return "grass";
}

function terrainBuffers() {
  return { positions: [], uvs: [], indices: [] };
}

function pushTerrainTile(buffers, x, z) {
  const vertexOffset = buffers.positions.length / 3;
  const h00 = heightAtGrid(x, z);
  const h10 = heightAtGrid(x + 1, z);
  const h01 = heightAtGrid(x, z + 1);
  const h11 = heightAtGrid(x + 1, z + 1);
  buffers.positions.push(x, h00, z, x + 1, h10, z, x, h01, z + 1, x + 1, h11, z + 1);
  buffers.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  buffers.indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 1, vertexOffset + 1, vertexOffset + 2, vertexOffset + 3);
}

function pushSkirt(buffers, x0, z0, x1, z1, h0, h1) {
  const vertexOffset = buffers.positions.length / 3;
  buffers.positions.push(x0, TERRAIN_BASE_Y, z0, x1, TERRAIN_BASE_Y, z1, x0, h0, z0, x1, h1, z1);
  buffers.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  buffers.indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset + 1, vertexOffset + 3, vertexOffset + 2);
}

function geometryFromBuffers(buffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrain() {
  terrainGroup.clear();
  buildHeightField();
  buildNavGrid();
  const byKind = new Map();
  for (let x = -HALF_MAP; x < HALF_MAP; x += 1) {
    for (let z = -HALF_MAP; z < HALF_MAP; z += 1) {
      const key = terrainKind(x + 0.5, z + 0.5);
      if (!byKind.has(key)) byKind.set(key, terrainBuffers());
      pushTerrainTile(byKind.get(key), x, z);
    }
  }
  for (const [key, buffers] of byKind) {
    const mesh = new THREE.Mesh(geometryFromBuffers(buffers), materials[key]);
    terrainGroup.add(mesh);
  }
  const skirtBuffers = terrainBuffers();
  for (let i = -HALF_MAP; i < HALF_MAP; i += 1) {
    pushSkirt(skirtBuffers, i, -HALF_MAP, i + 1, -HALF_MAP, heightAtGrid(i, -HALF_MAP), heightAtGrid(i + 1, -HALF_MAP));
    pushSkirt(skirtBuffers, i + 1, HALF_MAP, i, HALF_MAP, heightAtGrid(i + 1, HALF_MAP), heightAtGrid(i, HALF_MAP));
    pushSkirt(skirtBuffers, -HALF_MAP, i + 1, -HALF_MAP, i, heightAtGrid(-HALF_MAP, i + 1), heightAtGrid(-HALF_MAP, i));
    pushSkirt(skirtBuffers, HALF_MAP, i, HALF_MAP, i + 1, heightAtGrid(HALF_MAP, i), heightAtGrid(HALF_MAP, i + 1));
  }
  terrainGroup.add(new THREE.Mesh(geometryFromBuffers(skirtBuffers), materials.rock));
  createTerrainDetails();
}

function sampleTerrainHeight(x, z) {
  const gx = clamp(x + HALF_MAP, 0, MAP_SIZE - 0.001);
  const gz = clamp(z + HALF_MAP, 0, MAP_SIZE - 0.001);
  const x0 = gx | 0;
  const z0 = gz | 0;
  const tx = gx - x0;
  const tz = gz - z0;
  const i00 = x0 * HEIGHT_DIM + z0;
  const h00 = heightField[i00];
  const h10 = heightField[i00 + HEIGHT_DIM];
  const h01 = heightField[i00 + 1];
  const h11 = heightField[i00 + HEIGHT_DIM + 1];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

// ---- Unit pathfinding: coarse A* over a static water/passability grid ----
const navBlocked = new Uint8Array(NAV_W * NAV_H);
const navG = new Float32Array(NAV_W * NAV_H);
const navSeen = new Int32Array(NAV_W * NAV_H);
const navClosed = new Int32Array(NAV_W * NAV_H);
const navCame = new Int32Array(NAV_W * NAV_H);
let navGen = 0;
const heapCap = NAV_W * NAV_H * 8 + 2; // big enough to hold lazy-deletion duplicate pushes
const heapIdx = new Int32Array(heapCap);
const heapKey = new Float32Array(heapCap);
let heapSize = 0;
const pathQueue = [];
const pathCache = new Map(); // shared paths: key=coarse start block + goal cell -> { path, expires }
const tmpWp = new THREE.Vector3();
const NAV_DIAG = NAV_CELL * Math.SQRT2;

function navIndex(cx, cz) { return cx * NAV_H + cz; }
function navCenterX(cx) { return (cx + 0.5) * NAV_CELL - HALF_MAP; }
function navCenterZ(cz) { return (cz + 0.5) * NAV_CELL - HALF_MAP; }
function worldToNavX(x) { return clamp(Math.floor((x + HALF_MAP) / NAV_CELL), 0, NAV_W - 1); }
function worldToNavZ(z) { return clamp(Math.floor((z + HALF_MAP) / NAV_CELL), 0, NAV_H - 1); }

function buildNavGrid() {
  for (let cx = 0; cx < NAV_W; cx += 1) {
    for (let cz = 0; cz < NAV_H; cz += 1) {
      navBlocked[navIndex(cx, cz)] = isWater(navCenterX(cx), navCenterZ(cz)) ? 1 : 0;
    }
  }
}

function nearestFreeCell(cx, cz) {
  if (!navBlocked[navIndex(cx, cz)]) return navIndex(cx, cz);
  for (let r = 1; r < 14; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NAV_W || nz >= NAV_H) continue;
        if (!navBlocked[navIndex(nx, nz)]) return navIndex(nx, nz);
      }
    }
  }
  return -1;
}

function heapPush(idx, key) {
  if (heapSize >= heapCap - 1) return; // safety: never overflow the typed-array heap
  heapSize += 1;
  let i = heapSize;
  heapIdx[i] = idx;
  heapKey[i] = key;
  while (i > 1) {
    const p = i >> 1;
    if (heapKey[p] <= heapKey[i]) break;
    const tk = heapKey[p]; heapKey[p] = heapKey[i]; heapKey[i] = tk;
    const ti = heapIdx[p]; heapIdx[p] = heapIdx[i]; heapIdx[i] = ti;
    i = p;
  }
}

function heapPop() {
  const top = heapIdx[1];
  heapIdx[1] = heapIdx[heapSize];
  heapKey[1] = heapKey[heapSize];
  heapSize -= 1;
  let i = 1;
  for (;;) {
    let s = i;
    const l = i * 2;
    const r = l + 1;
    if (l <= heapSize && heapKey[l] < heapKey[s]) s = l;
    if (r <= heapSize && heapKey[r] < heapKey[s]) s = r;
    if (s === i) break;
    const tk = heapKey[s]; heapKey[s] = heapKey[i]; heapKey[i] = tk;
    const ti = heapIdx[s]; heapIdx[s] = heapIdx[i]; heapIdx[i] = ti;
    i = s;
  }
  return top;
}

function findPath(scx, scz, gcx, gcz) {
  const startI = navBlocked[navIndex(scx, scz)] ? nearestFreeCell(scx, scz) : navIndex(scx, scz);
  const goalI = navBlocked[navIndex(gcx, gcz)] ? nearestFreeCell(gcx, gcz) : navIndex(gcx, gcz);
  if (startI < 0 || goalI < 0 || startI === goalI) return null;
  const gX = (goalI / NAV_H) | 0;
  const gZ = goalI % NAV_H;
  navGen += 1;
  heapSize = 0;
  navG[startI] = 0;
  navSeen[startI] = navGen;
  navCame[startI] = -1;
  const sX = (startI / NAV_H) | 0;
  const sZ = startI % NAV_H;
  heapPush(startI, Math.hypot(gX - sX, gZ - sZ) * NAV_CELL);
  let expansions = 0;
  while (heapSize > 0 && expansions < NAV_W * NAV_H) {
    const cur = heapPop();
    if (navClosed[cur] === navGen) continue;
    navClosed[cur] = navGen;
    if (cur === goalI) break;
    expansions += 1;
    const cx = (cur / NAV_H) | 0;
    const cz = cur % NAV_H;
    const g = navG[cur];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NAV_W || nz >= NAV_H) continue;
        const ni = navIndex(nx, nz);
        if (navBlocked[ni]) continue;
        if (dx !== 0 && dz !== 0 && (navBlocked[navIndex(cx + dx, cz)] || navBlocked[navIndex(cx, cz + dz)])) continue;
        const ng = g + (dx !== 0 && dz !== 0 ? NAV_DIAG : NAV_CELL);
        if (navSeen[ni] === navGen && ng >= navG[ni]) continue;
        navG[ni] = ng;
        navSeen[ni] = navGen;
        navCame[ni] = cur;
        heapPush(ni, ng + Math.hypot(gX - nx, gZ - nz) * NAV_CELL);
      }
    }
  }
  if (navClosed[goalI] !== navGen) return null;
  const cells = [];
  for (let c = goalI, guard = 0; c !== -1 && guard < NAV_W * NAV_H; c = navCame[c], guard += 1) cells.push(c);
  cells.reverse();
  const path = [];
  for (let i = 0; i < cells.length; i += 1) {
    const cx = (cells[i] / NAV_H) | 0;
    const cz = cells[i] % NAV_H;
    if (i > 0 && i < cells.length - 1) {
      const pcx = (cells[i - 1] / NAV_H) | 0;
      const pcz = cells[i - 1] % NAV_H;
      const ncx = (cells[i + 1] / NAV_H) | 0;
      const ncz = cells[i + 1] % NAV_H;
      if (cx - pcx === ncx - cx && cz - pcz === ncz - cz) continue; // skip collinear waypoints
    }
    path.push([navCenterX(cx), navCenterZ(cz)]);
  }
  return path.length ? path : null;
}

function requestPath(unit, gx, gz) {
  if (unit.pathPending) return;
  unit.pathPending = true;
  pathQueue.push({ unit, gx, gz });
}

function processPathQueue() {
  if (!pathQueue.length) return;
  let solves = 0;
  while (pathQueue.length && solves < PATH_BUDGET) {
    const req = pathQueue.shift();
    const u = req.unit;
    u.pathPending = false;
    if (!u.alive) continue;
    const scx = worldToNavX(u.position.x);
    const scz = worldToNavZ(u.position.z);
    const gcx = worldToNavX(req.gx);
    const gcz = worldToNavZ(req.gz);
    // Share one path among nearby units headed to the same goal (coarse start block + short TTL).
    const key = `${(scx / 2) | 0}_${(scz / 2) | 0}_${gcx}_${gcz}`;
    const cached = pathCache.get(key);
    let path;
    if (cached && cached.expires > game.time) {
      path = cached.path;
    } else {
      path = findPath(scx, scz, gcx, gcz);
      if (pathCache.size > 1500) pathCache.clear();
      pathCache.set(key, { path, expires: game.time + 3 });
      solves += 1;
    }
    u.path = path;
    u.pathIndex = 0;
    u.pathGoal = { x: req.gx, z: req.gz };
    u.repathTimer = 1.4 + Math.random() * 0.8;
  }
}

// Steer toward a far target via A* waypoints; fall back to direct steering when close.
function segmentCrossesWater(ax, az, bx, bz) {
  const steps = Math.min(16, Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / NAV_CELL)));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (navBlocked[navIndex(worldToNavX(ax + (bx - ax) * t), worldToNavZ(az + (bz - az) * t))]) return true;
  }
  return false;
}

function navigateTo(unit, target, dt, stopDistance = 0, targetEntity = null) {
  const dxg = target.x - unit.position.x;
  const dzg = target.z - unit.position.z;
  const distToGoal = Math.sqrt(dxg * dxg + dzg * dzg);
  if (distToGoal <= stopDistance) {
    unit.path = null;
    return moveToward(unit, target, dt, stopDistance, targetEntity);
  }
  // Steer straight only for short hops that stay on land; otherwise pathfind around water.
  if (distToGoal < NAV_DIRECT_RANGE && !segmentCrossesWater(unit.position.x, unit.position.z, target.x, target.z)) {
    unit.path = null;
    return moveToward(unit, target, dt, stopDistance, targetEntity);
  }
  unit.repathTimer -= dt;
  const goalMoved = !unit.pathGoal || distSq2(unit.pathGoal.x, unit.pathGoal.z, target.x, target.z) > (NAV_CELL * 3) ** 2;
  if (!unit.pathPending && (!unit.path || unit.repathTimer <= 0 || goalMoved)) requestPath(unit, target.x, target.z);
  if (unit.path && unit.pathIndex < unit.path.length) {
    let wp = unit.path[unit.pathIndex];
    while (wp && distSq2(unit.position.x, unit.position.z, wp[0], wp[1]) < (NAV_CELL * 0.85) ** 2) {
      unit.pathIndex += 1;
      wp = unit.path[unit.pathIndex];
    }
    if (wp) {
      tmpWp.set(wp[0], 0, wp[1]);
      moveToward(unit, tmpWp, dt, 0, targetEntity);
      return distToGoal;
    }
    unit.path = null;
  }
  // No usable path (unreachable / not computed yet): steer directly only if it stays on land — never walk onto water.
  if (!segmentCrossesWater(unit.position.x, unit.position.z, target.x, target.z)) {
    moveToward(unit, target, dt, stopDistance, targetEntity);
  }
  return distToGoal;
}

function addBlock(group, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(cubeGeometry, material);
  mesh.position.set(x, y + sy / 2, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function isNearFactionStart(x, z, radius = 9) {
  return FACTION_BLUEPRINTS.some((blueprint) => distSq2(x, z, blueprint.start.x, blueprint.start.z) < radius * radius);
}

function createTreeCluster(x, z, height, scale = 1) {
  const group = new THREE.Group();
  addBlock(group, materials.trunk, 0, 0, 0, 0.32 * scale, 1.05 * scale, 0.32 * scale);
  addBlock(group, materials.leaves, 0, 1.02 * scale, 0, 1.25 * scale, 0.72 * scale, 1.25 * scale);
  addBlock(group, materials.leavesDark, -0.24 * scale, 1.52 * scale, 0.14 * scale, 0.86 * scale, 0.58 * scale, 0.86 * scale);
  group.position.set(x, height, z);
  freezeStaticObject(group);
  terrainGroup.add(group);
}

function createRockOutcrop(x, z, height, scale = 1) {
  const group = new THREE.Group();
  addBlock(group, materials.outcrop, 0, 0, 0, 1.15 * scale, 0.62 * scale, 0.92 * scale);
  addBlock(group, materials.rock, -0.34 * scale, 0.54 * scale, 0.18 * scale, 0.58 * scale, 0.52 * scale, 0.48 * scale);
  addBlock(group, materials.outcrop, 0.44 * scale, 0.34 * scale, -0.28 * scale, 0.5 * scale, 0.44 * scale, 0.6 * scale);
  group.rotation.y = mapNoise(x, z, 19) * Math.PI;
  group.position.set(x, height, z);
  freezeStaticObject(group);
  terrainGroup.add(group);
}

function createTerrainDetails() {
  for (let x = -HALF_MAP + 6; x < HALF_MAP - 6; x += 4) {
    for (let z = -HALF_MAP + 6; z < HALF_MAP - 6; z += 4) {
      const jitterX = (mapNoise(x, z, 1) - 0.5) * 2.2;
      const jitterZ = (mapNoise(x, z, 2) - 0.5) * 2.2;
      const px = x + jitterX;
      const pz = z + jitterZ;
      if (isWater(px, pz) || isShore(px, pz) || isNearFactionStart(px, pz, 12)) continue;
      const height = terrainTopHeight(px, pz);
      const noise = mapNoise(x, z, 3);
      if (height > 2.05 && noise > 0.42) {
        createRockOutcrop(px, pz, height, 0.75 + mapNoise(x, z, 4) * 0.65);
      } else if (height > 0.25 && height < 2.2 && noise > 0.82) {
        createTreeCluster(px, pz, height, 0.78 + mapNoise(x, z, 5) * 0.45);
      }
    }
  }
}

function factionMaterials(faction) {
  if (faction.materials) return faction.materials;
  faction.materials = {
    primary: new THREE.MeshStandardMaterial({ color: faction.material, roughness: 0.86, flatShading: true }),
    color: new THREE.MeshStandardMaterial({ color: faction.color, roughness: 0.78, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: faction.accent, roughness: 0.72, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.9, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: faction.accent, roughness: 0.45, emissive: faction.accent, emissiveIntensity: 0.16, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x97968d, roughness: 0.94, flatShading: true }),
    trim: new THREE.MeshStandardMaterial({ color: 0xc5bea3, roughness: 0.88, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x735033, roughness: 0.92, flatShading: true }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xbda982, roughness: 0.9, flatShading: true }),
    roof: new THREE.MeshStandardMaterial({ color: faction.color, roughness: 0.82, flatShading: true }),
    thatch: new THREE.MeshStandardMaterial({ color: 0xa48545, roughness: 0.96, flatShading: true }),
  };
  return faction.materials;
}

function freezeStaticObject(object) {
  object.traverse((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

function addRoofPrism(group, material, x, y, z, sx, sy, sz) {
  const x0 = x - sx / 2;
  const x1 = x + sx / 2;
  const z0 = z - sz / 2;
  const z1 = z + sz / 2;
  const y0 = y;
  const y1 = y + sy;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    x0, y0, z0, x1, y0, z0, x, y1, z0,
    x0, y0, z1, x1, y0, z1, x, y1, z1,
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    4, 3, 5,
    3, 0, 2, 3, 2, 5,
    1, 4, 5, 1, 5, 2,
    0, 3, 4, 0, 4, 1,
  ]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return mesh;
}

function addCrenels(group, material, y, halfX, halfZ, size = 0.42) {
  for (let i = -1; i <= 1; i += 2) {
    addBlock(group, material, i * halfX, y, -halfZ, size, size, size);
    addBlock(group, material, i * halfX, y, halfZ, size, size, size);
    addBlock(group, material, -halfX, y, i * halfZ, size, size, size);
    addBlock(group, material, halfX, y, i * halfZ, size, size, size);
  }
}

function addVillageHouse(group, mats, roofMaterial = mats.thatch) {
  addBlock(group, mats.plaster, 0, 0, 0, 2.85, 1.35, 2.35);
  addBlock(group, mats.wood, 0, 0, 1.22, 0.48, 0.8, 0.14);
  addBlock(group, mats.stone, -0.92, 0.1, 1.24, 0.42, 0.62, 0.16);
  addBlock(group, mats.stone, 0.92, 0.1, 1.24, 0.42, 0.62, 0.16);
  addBlock(group, mats.dark, 0, 0.1, 1.33, 0.42, 0.72, 0.1);
  addBlock(group, mats.glass, -0.72, 0.68, 1.35, 0.28, 0.28, 0.08);
  addBlock(group, mats.glass, 0.72, 0.68, 1.35, 0.28, 0.28, 0.08);
  addRoofPrism(group, roofMaterial, 0, 1.22, 0, 3.3, 1.04, 2.75);
  addBlock(group, mats.stone, 0.82, 1.74, -0.62, 0.28, 0.72, 0.28);
}

function addStoneTower(group, mats, withBarrel = false) {
  addBlock(group, mats.stone, 0, 0, 0, 1.9, 3.15, 1.9);
  addBlock(group, mats.trim, 0, 3.05, 0, 2.24, 0.48, 2.24);
  addCrenels(group, mats.stone, 3.45, 0.72, 0.72);
  addBlock(group, mats.dark, 0, 0.12, 0.98, 0.5, 0.85, 0.12);
  if (withBarrel) {
    const barrel = addBlock(group, mats.dark, 0, 2.75, 1.14, 0.28, 0.28, 1.65);
    barrel.name = "barrel";
  }
}

function addWallSegment(group, mats, x, z, w, d) {
  addBlock(group, mats.stone, x, 0.04, z, w, 1.25, d);
  const count = Math.max(1, Math.floor(Math.max(w, d)));
  for (let i = 0; i < count; i += 1) {
    const px = w > d ? x - w / 2 + 0.5 + i : x;
    const pz = w > d ? z : z - d / 2 + 0.5 + i;
    addBlock(group, mats.stone, px, 1.25, pz, 0.38, 0.36, 0.38);
  }
}

function createStructureModel(type, faction) {
  const mats = factionMaterials(faction);
  const group = new THREE.Group();
  if (type === "hq") {
    addBlock(group, mats.stone, 0, 0, 0, 4.4, 1.1, 4.4);
    addBlock(group, mats.trim, 0, 1.08, 0, 4.7, 0.3, 4.7);
    addBlock(group, mats.stone, 0, -0.05, 2.45, 1.5, 0.55, 0.9); // entrance steps
    addBlock(group, mats.primary, 0, 1.36, 0, 2.9, 1.55, 2.9); // keep
    addBlock(group, mats.dark, 0, 0.72, 1.46, 0.72, 1.05, 0.12); // gate
    addBlock(group, mats.glass, -0.78, 1.78, 1.47, 0.34, 0.42, 0.08);
    addBlock(group, mats.glass, 0.78, 1.78, 1.47, 0.34, 0.42, 0.08);
    addBlock(group, mats.color, 0, 2.95, 0, 2.45, 0.45, 2.45); // eaves
    addRoofPrism(group, mats.color, 0, 3.18, 0, 2.1, 0.95, 2.1); // pitched roof
    addBlock(group, mats.accent, 0, 4.0, 0, 0.16, 1.1, 0.16); // flagpole
    addBlock(group, mats.color, 0.4, 4.5, 0, 0.6, 0.38, 0.05); // banner
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBlock(group, mats.stone, sx * 1.85, 1.2, sz * 1.85, 0.9, 3.1, 0.9); // corner towers
        addBlock(group, mats.trim, sx * 1.85, 2.86, sz * 1.85, 1.1, 0.28, 1.1);
        addBlock(group, mats.dark, sx * 1.85, 3.12, sz * 1.85, 0.7, 0.3, 0.7);
        addBlock(group, mats.accent, sx * 1.85, 3.4, sz * 1.85, 0.16, 0.4, 0.16); // finials
      }
    }
  } else if (type === "refinery") {
    addBlock(group, mats.stone, 0, 0, 0, 3.0, 0.7, 2.3);
    addBlock(group, mats.trim, 0, 0.68, 0, 3.2, 0.18, 2.5);
    addBlock(group, mats.primary, -0.5, 0.78, -0.1, 1.5, 1.5, 1.5); // tank
    addBlock(group, mats.trim, -0.5, 1.5, -0.1, 1.66, 0.18, 1.66);
    addBlock(group, mats.glass, -0.5, 1.72, -0.1, 0.9, 0.22, 0.9);
    addBlock(group, mats.dark, 1.05, 0.68, -0.6, 0.34, 1.7, 0.34); // chimney
    addBlock(group, mats.accent, 1.05, 1.6, -0.6, 0.42, 0.2, 0.42);
    addBlock(group, mats.dark, 1.05, 0.68, 0.4, 0.28, 1.2, 0.28);
    addBlock(group, mats.trim, 0.3, 0.54, 0.9, 1.4, 0.16, 0.16); // pipe
    addBlock(group, mats.accent, 0.95, 0.18, 0.95, 0.7, 0.4, 0.5); // vent
  } else if (type === "barracks") {
    addBlock(group, mats.plaster, 0, 0, 0, 3.5, 1.1, 2.4);
    addBlock(group, mats.wood, 0, 0, 0, 3.7, 0.22, 2.6); // sill
    addRoofPrism(group, mats.roof, 0, 1.1, 0, 3.9, 0.95, 2.8);
    addBlock(group, mats.dark, 0, 0.5, 1.24, 1.0, 1.0, 0.1); // doors
    addBlock(group, mats.wood, 0, 0.5, 1.28, 0.08, 1.0, 0.06);
    addBlock(group, mats.glass, -1.1, 0.62, 1.22, 0.4, 0.4, 0.08);
    addBlock(group, mats.glass, 1.1, 0.62, 1.22, 0.4, 0.4, 0.08);
    addBlock(group, mats.accent, 1.55, 1.0, 1.2, 0.12, 1.3, 0.12); // banner pole
    addBlock(group, mats.color, 1.42, 1.7, 1.2, 0.32, 0.5, 0.05);
    addBlock(group, mats.wood, -1.5, 0.3, -0.9, 0.14, 0.7, 0.14); // training post
    addBlock(group, mats.stone, -1.5, 0.66, -0.9, 0.4, 0.16, 0.4);
  } else if (type === "solar") {
    addBlock(group, mats.stone, 0, 0, 0, 1.4, 0.5, 1.4);
    addBlock(group, mats.dark, 0, 0.48, 0, 0.4, 1.1, 0.4); // pylon
    addBlock(group, mats.accent, 0, 1.08, 0, 0.6, 0.3, 0.6); // glowing core
    for (let i = -1; i <= 1; i += 2) {
      const frame = addBlock(group, mats.trim, i * 1.0, 0.64, 0, 1.62, 0.06, 2.4);
      frame.rotation.z = i * -0.26;
      const panel = addBlock(group, mats.glass, i * 1.0, 0.7, 0, 1.5, 0.12, 2.3);
      panel.rotation.z = i * -0.26;
    }
    addBlock(group, mats.trim, 0, 1.38, 0, 0.12, 0.5, 0.12); // mast
  } else if (type === "turret") {
    addBlock(group, mats.stone, 0, 0, 0, 1.8, 2.2, 1.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBlock(group, mats.stone, sx * 0.78, 0, sz * 0.78, 0.5, 1.4, 0.5); // buttresses
    addBlock(group, mats.trim, 0, 2.18, 0, 2.1, 0.3, 2.1);
    addCrenels(group, mats.stone, 2.5, 0.7, 0.7, 0.34);
    addBlock(group, mats.primary, 0, 2.5, 0, 1.2, 0.7, 1.2); // turret head
    const barrel = addBlock(group, mats.dark, 0, 2.78, 1.0, 0.3, 0.3, 1.5);
    barrel.name = "barrel";
    addBlock(group, mats.accent, 0, 2.78, 1.78, 0.36, 0.36, 0.22); // muzzle
  } else if (type === "academy") {
    addBlock(group, mats.primary, 0, 0, 0, 2.6, 1.2, 2.6);
    addBlock(group, mats.trim, 0, 1.18, 0, 2.8, 0.2, 2.8);
    for (const sx of [-1, 1]) addBlock(group, mats.primary, sx * 1.0, 1.3, 0, 0.6, 0.9, 2.0); // wings
    addBlock(group, mats.glass, 0, 1.3, 0, 1.3, 1.5, 1.3); // glowing core
    addRoofPrism(group, mats.accent, 0, 2.78, 0, 1.6, 0.7, 1.6); // dome
    addBlock(group, mats.trim, 0, 3.4, 0, 0.16, 0.7, 0.16); // antenna
    addBlock(group, mats.accent, 0, 4.05, 0, 0.26, 0.26, 0.26); // glowing tip
    for (const sz of [-1, 1]) addBlock(group, mats.glass, 0, 0.6, sz * 1.31, 1.4, 0.5, 0.06);
  }
  return group;
}

function structureBarHeight(type) {
  if (type === "hq") return 5.15;
  if (type === "turret") return 4.55;
  if (type === "academy") return 3.8;
  if (type === "barracks") return 3.2;
  return 2.75;
}

function structureFireHeight(type) {
  if (type === "hq") return 3.8;
  if (type === "turret") return 3.65;
  return 2.1;
}

function createSelectionRing(radius, faction, hostile = false) {
  const ring = new THREE.Mesh(radius > 1 ? structureRingGeometry : ringGeometry, hostile ? materials.enemySelection : materials.selection);
  ring.scale.setScalar(radius > 1 ? radius / 1.9 : radius / 0.6);
  ring.visible = false;
  return ring;
}

function createHealthBar(entity, width = 2) {
  const group = new THREE.Group();
  const bg = addBlock(group, new THREE.MeshBasicMaterial({ color: 0x2a1e1e }), 0, 0, 0, width, 0.08, 0.08);
  const fill = addBlock(group, new THREE.MeshBasicMaterial({ color: 0x78d765 }), -width / 2, 0.01, 0, width, 0.09, 0.1);
  fill.geometry = barFillGeometry; // shared left-anchored geometry — do NOT mutate the global cubeGeometry
  group.userData = { fill, bg, width };
  group.visible = false;
  entity.healthBar = group;
  return group;
}

function updateHealthBar(entity) {
  if (!entity.healthBar) return;
  const fill = entity.healthBar.userData.fill;
  const width = entity.healthBar.userData.width;
  const pct = clamp(entity.hp / entity.maxHp, 0, 1);
  fill.scale.x = pct;
  fill.material.color.setHex(pct > 0.55 ? 0x78d765 : pct > 0.25 ? 0xe6c65b : 0xd65b4d);
  fill.position.x = -width / 2;
  entity.healthBar.visible = pct < 0.995 || game.selected.includes(entity);
}

function syncStructureToTerrain(structure) {
  const x = structure.anchorX ?? structure.position.x;
  const z = structure.anchorZ ?? structure.position.z;
  const y = sampleTerrainHeight(x, z);
  structure.position.set(x, y, z);
  structure.group.position.set(x, y, z);
  structure.group.rotation.set(0, structure.facing ?? 0, 0);
  structure.group.updateMatrixWorld();
  for (const blocker of blockers) {
    if (blocker.owner === structure) {
      blocker.x = x;
      blocker.z = z;
    }
  }
  structure.selectRing.position.set(x, y + 0.08, z);
  if (structure.healthBar) {
    structure.healthBar.position.set(x, y + structure.barHeight, z);
    structure.healthBar.lookAt(camera.position);
  }
}

function enforceStructureAnchors() {
  // structures are static (pinned once in createStructure) — only the health bars need to keep facing the camera
  for (const structure of structures) {
    if (structure.alive && structure.healthBar?.visible) structure.healthBar.lookAt(camera.position);
  }
}

function createStructure(type, faction, x, z, free = false) {
  const definition = BUILDING_TYPES[type];
  if (!free && !payCost(faction, definition.cost)) return null;
  const group = createStructureModel(type, faction);
  const structure = {
    id: crypto.randomUUID(),
    kind: "structure",
    type,
    name: definition.name,
    faction,
    anchorX: x,
    anchorZ: z,
    facing: mapNoise(x, z, 41) * Math.PI * 2,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    radius: definition.radius,
    hp: definition.hp,
    maxHp: definition.hp,
    alive: true,
    reload: rand(0, 1),
    rallyPoint: new THREE.Vector3(x + rand(-3, 3), 0, z + rand(-3, 3)),
    selectRing: createSelectionRing(definition.radius, faction),
    healthBar: null,
    barHeight: structureBarHeight(type),
    group,
  };
  structure.healthBar = createHealthBar(structure, type === "hq" ? 3.2 : 2.2);
  structureGroup.add(group, structure.selectRing, structure.healthBar);
  structures.push(structure);
  faction.structures.push(structure);
  blockers.push({ owner: structure, x, z, radius: definition.radius + 0.4 });
  syncStructureToTerrain(structure);
  freezeStaticObject(group); // buildings never move — stop per-frame matrix recompute on all their blocks
  updateHealthBar(structure);
  if (!free && faction.player) {
    game.stats.buildingsBuilt += 1;
    logEvent(`${definition.name} construction started.`);
  }
  return structure;
}

function createResourceNode(type, x, z, amount = RESOURCE_TYPES[type].amount) {
  const definition = RESOURCE_TYPES[type];
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.8, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({
    color: definition.accent,
    roughness: 0.45,
    emissive: type === "power" ? definition.accent : 0x000000,
    emissiveIntensity: type === "power" ? 0.25 : 0,
    flatShading: true,
  });
  if (type === "food") {
    for (let i = 0; i < 5; i += 1) {
      addBlock(group, baseMat, rand(-0.9, 0.9), 0, rand(-0.9, 0.9), 0.34, rand(0.6, 1.2), 0.34);
      addBlock(group, accentMat, rand(-0.9, 0.9), rand(0.8, 1.3), rand(-0.9, 0.9), 0.68, 0.5, 0.68);
    }
  } else if (type === "ore") {
    for (let i = 0; i < 6; i += 1) {
      const rock = new THREE.Mesh(resourceCrystalGeometry, i % 2 ? baseMat : accentMat);
      rock.position.set(rand(-1, 1), rand(0.2, 0.65), rand(-1, 1));
      rock.scale.setScalar(rand(0.5, 1));
      group.add(rock);
    }
  } else {
    for (let i = 0; i < 4; i += 1) {
      const crystal = new THREE.Mesh(resourceCrystalGeometry, i % 2 ? baseMat : accentMat);
      crystal.position.set(rand(-0.8, 0.8), rand(0.5, 1.2), rand(-0.8, 0.8));
      crystal.scale.set(0.55, rand(1.1, 1.8), 0.55);
      group.add(crystal);
    }
  }
  const node = {
    id: crypto.randomUUID(),
    kind: "resource",
    type,
    name: definition.name,
    amount,
    maxAmount: amount,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    radius: 1.55,
    group,
  };
  group.position.copy(node.position);
  resourceGroup.add(group);
  resourceNodes.push(node);
  return node;
}

function placeOnLand(x, z) {
  if (!isWater(x, z)) return [x, z];
  for (let r = 3; r <= 18; r += 3) {
    for (let a = 0; a < 8; a += 1) {
      const nx = x + Math.cos((a / 8) * Math.PI * 2) * r;
      const nz = z + Math.sin((a / 8) * Math.PI * 2) * r;
      if (!isWater(nx, nz)) return [nx, nz];
    }
  }
  return [x, z];
}

function createResourceFields() {
  resourceGroup.clear();
  resourceNodes.length = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const sx = blueprint.start.x;
    const sz = blueprint.start.z;
    const food = placeOnLand(sx + Math.sign(-sx || 1) * 6, sz + 3);
    createResourceNode("food", food[0], food[1], 1900);
    const ore = placeOnLand(sx + 3, sz + Math.sign(-sz || 1) * 6);
    createResourceNode("ore", ore[0], ore[1], 1600);
    const power = placeOnLand(sx - Math.sign(-sx || 1) * 6, sz - 4);
    createResourceNode("power", power[0], power[1], 950);
  }
  const neutralNodes = [
    ["power", 0, 44], ["ore", 44, 6], ["food", 4, -44], ["ore", -44, -4],
    ["food", 34, 34], ["power", -34, 32], ["ore", 36, -32], ["food", -34, -34],
    ["food", 0, 78], ["power", 78, 0], ["ore", 0, -78], ["power", -78, 0],
    ["ore", 54, 20], ["food", -54, -20], ["power", 22, -58], ["food", -22, 58],
  ];
  for (const [type, x, z] of neutralNodes) {
    const [lx, lz] = placeOnLand(x + rand(-3, 3), z + rand(-3, 3));
    createResourceNode(type, lx, lz, RESOURCE_TYPES[type].amount * 1.25);
  }
}

function createFaction(blueprint) {
  return {
    ...blueprint,
    resources: { food: 220, ore: 160, power: 70 },
    units: [],
    structures: [],
    defeated: false,
    tech: 0,
    nextThink: rand(0.2, 1.8),
    waveTimer: rand(10, 18),
    lastAttackAt: 0,
    rallyPoint: blueprint.start.clone(),
  };
}

function resetWorld() {
  for (const group of [structureGroup, unitGroup, effectGroup]) group.clear();
  factions.length = 0;
  units.length = 0;
  structures.length = 0;
  blockers.length = 0;
  projectiles.length = 0;
  pathQueue.length = 0;
  pathCache.clear();
  game.selected = [];
  game.time = 0;
  game.winner = null;
  game.suddenDeathOn = false;
  game.over = false;
  game.restartTimer = 0;
  game.stats.kills = 0;
  game.stats.losses = 0;
  game.stats.buildingsBuilt = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const faction = createFaction(blueprint);
    factions.push(faction);
    if (faction.player) playerFaction = faction;
  }
  createResourceFields();
  for (const faction of factions) {
    const hq = createStructure("hq", faction, faction.start.x, faction.start.z, true);
    faction.hq = hq;
    faction.rallyPoint.copy(hq.position);
    for (let i = 0; i < 5; i += 1) {
      spawnUnit("worker", faction, hq.position.x + rand(-3.5, 3.5), hq.position.z + rand(-3.5, 3.5), true);
    }
    spawnUnit("soldier", faction, hq.position.x + rand(-3, 3), hq.position.z + rand(-3, 3), true);
    spawnUnit("scout", faction, hq.position.x + rand(-3, 3), hq.position.z + rand(-3, 3), true);
  }
  logEvent("The four HQs are online. The skirmish is now autonomous.", true);
  setDirective(game.directive);
  resetCamera();
  updateUI(true);
}

function currentSupply(faction) {
  return faction.units.filter((unit) => unit.alive).reduce((sum, unit) => sum + UNIT_TYPES[unit.type].supply, 0);
}

function supplyCap(faction) {
  return faction.structures
    .filter((structure) => structure.alive)
    .reduce((sum, structure) => sum + (BUILDING_TYPES[structure.type].supply ?? 0), 0);
}

function hasStructure(faction, type) {
  return faction.structures.some((structure) => structure.alive && structure.type === type);
}

function structureCount(faction, type) {
  return faction.structures.filter((structure) => structure.alive && (!type || structure.type === type)).length;
}

function unitCount(faction, type) {
  return faction.units.filter((unit) => unit.alive && (!type || unit.type === type)).length;
}

function armyUnits(faction) {
  return faction.units.filter((unit) => unit.alive && UNIT_TYPES[unit.type].role === "army");
}

function canPay(faction, cost = {}) {
  return Object.entries(cost).every(([key, value]) => faction.resources[key] >= value);
}

function payCost(faction, cost = {}) {
  if (!canPay(faction, cost)) return false;
  for (const [key, value] of Object.entries(cost)) faction.resources[key] -= value;
  return true;
}

function adjustedUnitCost(type, faction) {
  const base = UNIT_TYPES[type].cost;
  const cost = {};
  for (const [key, value] of Object.entries(base)) {
    cost[key] = key === "food" && type === "worker" ? Math.ceil(value * (faction.bonus.workerCost ?? 1)) : value;
  }
  return cost;
}

function trainUnit(type, faction, source = null, free = false) {
  const definition = UNIT_TYPES[type];
  if (!definition) return null;
  if (!free && currentSupply(faction) + definition.supply > supplyCap(faction)) return null;
  if (!free && (definition.requiresTech ?? 0) > faction.tech) return null;
  if (!free && !payCost(faction, adjustedUnitCost(type, faction))) return null;
  const producer =
    source ??
    faction.structures.find((structure) => structure.alive && definition.trainAt.includes(structure.type)) ??
    faction.hq;
  const angle = rand(0, Math.PI * 2);
  const radius = (producer?.radius ?? 2) + rand(1.2, 3.2);
  const x = clamp((producer?.position.x ?? faction.start.x) + Math.cos(angle) * radius, -HALF_MAP + 1, HALF_MAP - 1);
  const z = clamp((producer?.position.z ?? faction.start.z) + Math.sin(angle) * radius, -HALF_MAP + 1, HALF_MAP - 1);
  return spawnUnit(type, faction, x, z, free);
}

function spawnUnit(type, faction, x, z, free = false) {
  const definition = UNIT_TYPES[type];
  const hp = Math.round(definition.hp * (faction.bonus.unitHp ?? 1) * (faction.player ? playerHpMul : 1));
  const damage = definition.damage * (faction.bonus.unitDamage ?? 1) * (faction.player ? playerDmgMul : 1);
  const speed = definition.speed * (faction.bonus.speed ?? 1);
  const texture = createUnitTexture(type, faction);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const scale = type === "siege" ? 1.85 : type === "soldier" ? 1.35 : 1.15;
  sprite.scale.set(scale, scale * 1.28, 1);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(type === "siege" ? 0.85 : 0.48, 18), materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  const selectRing = createSelectionRing(definition.radius, faction);
  const unit = {
    id: crypto.randomUUID(),
    kind: "unit",
    type,
    name: definition.name,
    faction,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    velocity: new THREE.Vector3(),
    hp,
    maxHp: hp,
    damage,
    speed,
    range: definition.range,
    cooldown: definition.cooldown,
    attackTimer: rand(0, definition.cooldown),
    radius: definition.radius,
    role: definition.role,
    alive: true,
    order: { type: definition.role === "worker" ? "gather" : "guard", target: null, point: faction.rallyPoint.clone() },
    cargoType: null,
    cargo: 0,
    harvestTimer: 0,
    frameSeed: Math.random() * 100,
    baseDamage: damage,
    baseMaxHp: hp,
    kills: 0,
    rank: 0,
    path: null,
    pathIndex: 0,
    pathGoal: null,
    pathPending: false,
    repathTimer: 0,
    sprite,
    shadow,
    selectRing,
  };
  units.push(unit);
  faction.units.push(unit);
  unitGroup.add(shadow, sprite, selectRing);
  syncUnitToTerrain(unit);
  if (!free && faction.player) logEvent(`${definition.name} trained.`);
  return unit;
}

function syncUnitToTerrain(unit) {
  const y = sampleTerrainHeight(unit.position.x, unit.position.z);
  unit.position.y = y + unit.sprite.scale.y * 0.45;
  unit.sprite.position.copy(unit.position);
  unit.shadow.position.set(unit.position.x, y + 0.04, unit.position.z);
  unit.selectRing.position.set(unit.position.x, y + 0.07, unit.position.z);
}

function nearestResource(unit, preferredType = null) {
  let best = null;
  let bestScore = Infinity;
  for (const node of resourceNodes) {
    if (node.amount <= 0) continue;
    if (preferredType && node.type !== preferredType) continue;
    const distance = unit.position.distanceToSquared(node.position);
    if (distance < bestScore) {
      bestScore = distance;
      best = node;
    }
  }
  return best;
}

function nearestDropoff(unit) {
  let best = null;
  let bestScore = Infinity;
  for (const structure of unit.faction.structures) {
    if (!structure.alive || (structure.type !== "hq" && structure.type !== "refinery")) continue;
    const distance = unit.position.distanceToSquared(structure.position);
    if (distance < bestScore) {
      bestScore = distance;
      best = structure;
    }
  }
  return best;
}

function preferredGatherType(faction) {
  const resources = faction.resources;
  if (resources.food < RESOURCE_LOW_WATER) return "food";
  if (resources.ore < RESOURCE_LOW_WATER) return "ore";
  if (resources.power < 55 || DIRECTIVES[faction.directive].tech > 1) return "power";
  const roll = Math.random();
  if (roll < 0.42) return "food";
  if (roll < 0.78) return "ore";
  return "power";
}

const spatialGrid = new Map(); // SPATIAL_CELL-sized buckets of live units, rebuilt each frame
function spatialKey(cx, cz) { return cx * 100003 + cz; }
function rebuildSpatial() {
  for (const bucket of spatialGrid.values()) bucket.length = 0; // reuse arrays, avoid per-frame GC
  for (const unit of units) {
    if (!unit.alive) continue;
    const key = spatialKey(Math.floor(unit.position.x / SPATIAL_CELL), Math.floor(unit.position.z / SPATIAL_CELL));
    let bucket = spatialGrid.get(key);
    if (!bucket) spatialGrid.set(key, (bucket = []));
    bucket.push(unit);
  }
}

function nearestEnemyEntity(from, faction, maxDistance = Infinity) {
  let best = null;
  let bestScore = maxDistance * maxDistance;
  if (Number.isFinite(maxDistance)) {
    const reach = Math.ceil(maxDistance / SPATIAL_CELL);
    const ccx = Math.floor(from.x / SPATIAL_CELL);
    const ccz = Math.floor(from.z / SPATIAL_CELL);
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        const bucket = spatialGrid.get(spatialKey(ccx + dx, ccz + dz));
        if (!bucket) continue;
        for (const unit of bucket) {
          if (unit.faction === faction) continue;
          const score = from.distanceToSquared(unit.position);
          if (score < bestScore) {
            bestScore = score;
            best = unit;
          }
        }
      }
    }
  } else {
    for (const unit of units) {
      if (!unit.alive || unit.faction === faction) continue;
      const score = from.distanceToSquared(unit.position);
      if (score < bestScore) {
        bestScore = score;
        best = unit;
      }
    }
  }
  for (const structure of structures) {
    if (!structure.alive || structure.faction === faction) continue;
    const raw = from.distanceToSquared(structure.position);
    if (raw >= bestScore) continue; // respect maxDistance before applying the HQ priority bias
    const score = raw - (structure.type === "hq" ? 20 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = structure;
    }
  }
  return best;
}

function enemyHqTarget(faction) {
  let best = null;
  let bestScore = Infinity;
  for (const other of factions) {
    if (other === faction || other.defeated || !other.hq?.alive) continue;
    const score = faction.hq.position.distanceToSquared(other.hq.position);
    if (score < bestScore) {
      bestScore = score;
      best = other.hq;
    }
  }
  return best;
}

function moveToward(unit, point, dt, stopDistance = 0, targetEntity = null) {
  tmpVec.copy(point).sub(unit.position);
  tmpVec.y = 0;
  const distance = tmpVec.length();
  if (distance <= stopDistance) {
    unit.velocity.multiplyScalar(0.55);
    separateFromBlockers(unit, targetEntity);
    syncUnitToTerrain(unit);
    return distance;
  }
  tmpVec.normalize();
  const avoid = obstacleAvoidance(unit, tmpVec, targetEntity);
  unit.velocity.lerp(avoid.multiplyScalar(unit.speed), 0.28);
  unit.position.addScaledVector(unit.velocity, dt);
  unit.position.x = clamp(unit.position.x, -HALF_MAP + 1, HALF_MAP - 1);
  unit.position.z = clamp(unit.position.z, -HALF_MAP + 1, HALF_MAP - 1);
  separateFromBlockers(unit, targetEntity);
  separateUnits(unit);
  syncUnitToTerrain(unit);
  return distance;
}

function obstacleAvoidance(unit, direction, targetEntity = null) {
  const desired = tmpVec2.copy(direction);
  const aheadX = unit.position.x + direction.x * (1.4 + unit.speed * 0.28);
  const aheadZ = unit.position.z + direction.z * (1.4 + unit.speed * 0.28);
  for (const blocker of blockers) {
    if (!blocker.owner.alive || blocker.owner === targetEntity) continue;
    if (unit.order?.type === "attack" && blocker.owner.faction !== unit.faction) continue; // assaulters phase through the enemy base ring
    const dx = aheadX - blocker.x;
    const dz = aheadZ - blocker.z;
    const minDist = blocker.radius + unit.radius + 0.35;
    const d2 = dx * dx + dz * dz;
    if (d2 > minDist * minDist || d2 < 0.0001) continue;
    const len = Math.sqrt(d2);
    const strength = ((minDist * minDist - d2) / (minDist * minDist)) * 1.6;
    desired.x += (dx / len) * strength;
    desired.z += (dz / len) * strength;
  }
  if (desired.lengthSq() < 0.001) desired.copy(direction);
  return desired.normalize();
}

function separateFromBlockers(unit, targetEntity = null) {
  for (const blocker of blockers) {
    if (!blocker.owner.alive || blocker.owner === targetEntity) continue;
    if (unit.order?.type === "attack" && blocker.owner.faction !== unit.faction) continue;
    const dx = unit.position.x - blocker.x;
    const dz = unit.position.z - blocker.z;
    const minDist = blocker.radius + unit.radius + 0.08;
    const d = Math.hypot(dx, dz);
    if (d >= minDist || d < 0.0001) continue;
    unit.position.x += (dx / d) * (minDist - d);
    unit.position.z += (dz / d) * (minDist - d);
  }
}

function separateUnits(unit) {
  // only test units in the 3x3 spatial cells around this one (cell size >> separation radius)
  const ccx = Math.floor(unit.position.x / SPATIAL_CELL);
  const ccz = Math.floor(unit.position.z / SPATIAL_CELL);
  for (let dcx = -1; dcx <= 1; dcx += 1) {
    for (let dcz = -1; dcz <= 1; dcz += 1) {
      const bucket = spatialGrid.get(spatialKey(ccx + dcx, ccz + dcz));
      if (!bucket) continue;
      for (const other of bucket) {
        if (other === unit) continue;
        const dx = unit.position.x - other.position.x;
        const dz = unit.position.z - other.position.z;
        const minDist = unit.radius + other.radius + 0.08;
        const d = Math.hypot(dx, dz);
        if (d <= 0.0001 || d >= minDist) continue;
        const push = (minDist - d) * 0.28;
        unit.position.x += (dx / d) * push;
        unit.position.z += (dz / d) * push;
      }
    }
  }
}

function updateWorker(unit, dt) {
  const danger = nearestEnemyEntity(unit.position, unit.faction, 4.2);
  if (danger && danger.kind === "unit" && danger.role === "army") {
    tmpPoint.copy(unit.position).sub(danger.position).setY(0).normalize().multiplyScalar(5).add(unit.position);
    moveToward(unit, tmpPoint, dt);
    return;
  }
  if (unit.cargo > 0) {
    const dropoff = nearestDropoff(unit);
    if (!dropoff) { unit.cargo = 0; unit.cargoType = null; unit.order.target = null; return; } // no dropoff left: dump cargo, don't freeze
    const distance = navigateTo(unit, dropoff.position, dt, dropoff.radius + 0.8, dropoff);
    if (distance <= dropoff.radius + 1) {
      unit.faction.resources[unit.cargoType] += unit.cargo;
      unit.cargo = 0;
      unit.cargoType = null;
      unit.order.target = nearestResource(unit, preferredGatherType(unit.faction));
    }
    return;
  }
  if (!unit.order.target || unit.order.target.amount <= 0 || unit.order.target.kind !== "resource") {
    unit.order.target = nearestResource(unit, preferredGatherType(unit.faction)) ?? nearestResource(unit);
  }
  const node = unit.order.target;
  if (!node) return;
  const distance = navigateTo(unit, node.position, dt, node.radius + 0.35, node);
  if (distance <= node.radius + 0.45) {
    unit.harvestTimer -= dt;
    if (unit.harvestTimer <= 0) {
      unit.harvestTimer = 0.55;
      const boost = 1 + structureCount(unit.faction, "refinery") * 0.12;
      // ponytail: non-depleting nodes — an AFK economy should never permanently dry up, so every civ keeps fielding armies
      unit.cargo = 8 * (unit.faction.bonus.gather ?? 1) * boost * (unit.faction.player ? playerEcoMul : 1);
      unit.cargoType = node.type;
    }
  }
}

function fireOrAdvance(unit, target, dt) {
  const stop = unit.range + (target.radius ?? 0.5) + 0.08;
  const distance = navigateTo(unit, target.position, dt, stop, target);
  if (distance <= stop + 0.2) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      createProjectile(unit, target);
    }
  }
}

function updateCombatUnit(unit, dt) {
  // Player move order: head to the point, but shoot anything that wanders into range.
  if (unit.order.type === "move" && unit.order.point) {
    const threat = nearestEnemyEntity(unit.position, unit.faction, unit.type === "siege" ? 9 : 5.5);
    if (threat) fireOrAdvance(unit, threat, dt);
    else navigateTo(unit, unit.order.point, dt, 0.9);
    return;
  }
  // Guard: sally out to meet nearby enemies (big, visible defensive battles), else hold the rally point.
  if (unit.order.type === "guard") {
    const threat = nearestEnemyEntity(unit.position, unit.faction, 24);
    if (threat) fireOrAdvance(unit, threat, dt);
    else navigateTo(unit, unit.faction.rallyPoint ?? unit.faction.hq.position, dt, 2.4);
    return;
  }
  // Attack order = drive on an objective base and clear it building-by-building once in range, so the
  // strike concentrates fire and actually razes the HQ (engaging field skirmishers en route stalls it).
  if (!unit.order.objective || !unit.order.objective.alive) unit.order.objective = enemyHqTarget(unit.faction);
  const obj = unit.order.objective;
  if (!obj) {
    unit.order = { type: "guard", target: null, point: unit.faction.rallyPoint.clone() };
    return;
  }
  const atBase = unit.position.distanceToSquared(obj.position) < 18 * 18;
  fireOrAdvance(unit, atBase ? nearestEnemyEntity(unit.position, unit.faction, 18) ?? obj : obj, dt);
}

function shotMaterial(faction) {
  return faction.shotMaterial ?? (faction.shotMaterial = new THREE.MeshBasicMaterial({ color: faction.accent }));
}

function createProjectile(source, target) {
  const material = shotMaterial(source.faction);
  const mesh = new THREE.Mesh(shotGeometry, material);
  mesh.position.copy(source.position);
  mesh.position.y += 0.55;
  effectGroup.add(mesh);
  projectiles.push({
    mesh,
    source,
    target,
    damage: source.damage,
    faction: source.faction,
    speed: source.type === "siege" ? 14 : 18,
    splash: UNIT_TYPES[source.type]?.splash ?? 0,
    alive: true,
  });
}

function updateProjectiles(dt) {
  for (const projectile of projectiles) {
    if (!projectile.alive || !projectile.target?.alive) {
      projectile.alive = false;
      effectGroup.remove(projectile.mesh);
      continue;
    }
    tmpVec.copy(projectile.target.position);
    tmpVec.y += projectile.target.kind === "structure" ? 1.2 : 0.55;
    tmpVec.sub(projectile.mesh.position);
    if (tmpVec.lengthSq() < 0.22) {
      projectile.alive = false;
      damageEntity(projectile.target, projectile.damage, projectile.faction, projectile.source);
      if (projectile.splash > 0) {
        const tp = projectile.target.position;
        const ccx = Math.floor(tp.x / SPATIAL_CELL);
        const ccz = Math.floor(tp.z / SPATIAL_CELL);
        const splashSq = projectile.splash * projectile.splash;
        for (let dcx = -1; dcx <= 1; dcx += 1) {
          for (let dcz = -1; dcz <= 1; dcz += 1) {
            const bucket = spatialGrid.get(spatialKey(ccx + dcx, ccz + dcz));
            if (!bucket) continue;
            for (const unit of bucket) {
              if (!unit.alive || unit.faction === projectile.faction || unit === projectile.target) continue;
              if (unit.position.distanceToSquared(tp) < splashSq) damageEntity(unit, projectile.damage * 0.36, projectile.faction, projectile.source);
            }
          }
        }
      }
      createHit(projectile.target.position, projectile.faction.accent);
      effectGroup.remove(projectile.mesh);
      continue;
    }
    projectile.mesh.position.addScaledVector(tmpVec.normalize(), projectile.speed * dt);
  }
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}

const hitMaterials = new Map(); // cached per color — hit cubes fade via scale, not opacity, so sharing is safe
function hitMaterial(color) {
  let material = hitMaterials.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    hitMaterials.set(color, material);
  }
  return material;
}

function createHit(position, color) {
  const material = hitMaterial(color);
  const baseY = sampleTerrainHeight(position.x, position.z);
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(cubeGeometry, material);
    mesh.position.set(position.x + rand(-0.25, 0.25), baseY + rand(0.5, 1.2), position.z + rand(-0.25, 0.25));
    const s = rand(0.08, 0.18);
    mesh.scale.setScalar(s);
    mesh.userData.life = rand(0.28, 0.5);
    mesh.userData.baseScale = s;
    mesh.userData.velocity = new THREE.Vector3(rand(-1, 1), rand(1, 2), rand(-1, 1));
    effectGroup.add(mesh);
  }
}

function updateEffects(dt) {
  for (const child of [...effectGroup.children]) {
    if (!child.userData.life) continue;
    child.userData.life -= dt;
    child.position.addScaledVector(child.userData.velocity, dt);
    child.scale.setScalar(child.userData.baseScale * clamp(child.userData.life * 2, 0, 1));
    if (child.userData.life <= 0) effectGroup.remove(child);
  }
}

function addKill(unit) {
  unit.kills += 1;
  const rank = Math.min(3, Math.floor(unit.kills / 3));
  if (rank <= unit.rank) return;
  unit.rank = rank; // promote: stronger and visibly larger
  unit.damage = unit.baseDamage * (1 + 0.18 * rank);
  const newMax = Math.round(unit.baseMaxHp * (1 + 0.15 * rank));
  unit.hp = Math.min(newMax, unit.hp + (newMax - unit.maxHp)); // heal by the maxHp gained on promotion
  unit.maxHp = newMax;
  unit.sprite.scale.multiplyScalar(1.06);
}

function damageEntity(entity, amount, sourceFaction, sourceUnit = null) {
  if (!entity?.alive) return;
  entity.hp -= amount;
  if (entity.healthBar) updateHealthBar(entity);
  if (entity.hp > 0) return;
  entity.alive = false;
  if (entity.kind === "unit") {
    unitGroup.remove(entity.sprite, entity.shadow, entity.selectRing);
    removeFrom(entity.faction.units, entity);
    if (entity.faction.player) game.stats.losses += 1;
    if (sourceFaction?.player && entity.faction !== sourceFaction) game.stats.kills += 1;
  } else if (entity.kind === "structure") {
    structureGroup.remove(entity.group, entity.selectRing, entity.healthBar);
    for (let i = blockers.length - 1; i >= 0; i -= 1) {
      if (blockers[i].owner === entity) blockers.splice(i, 1);
    }
    removeFrom(entity.faction.structures, entity);
    removeFrom(structures, entity);
    if (entity.type === "hq") {
      entity.faction.defeated = true;
      if (sourceFaction?.hq) {
        for (const unit of entity.faction.units) {
          if (unit.alive && unit.role === "army") unit.order = { type: "attack", target: sourceFaction.hq, objective: sourceFaction.hq };
        }
      }
      logEvent(`${entity.faction.shortName} HQ has fallen.`);
    }
    if (sourceFaction?.player && entity.faction !== sourceFaction) game.stats.kills += 3;
  }
  if (sourceUnit && sourceUnit.kind === "unit" && sourceUnit.alive) addKill(sourceUnit); // veterancy: credit the killer
  createHit(entity.position, sourceFaction?.accent ?? 0xffffff);
  if (game.selected.length && game.selected.includes(entity)) {
    removeFrom(game.selected, entity);
    updateSelectionVisuals(); // only sweep the scene when a *selected* entity dies
  }
}

function updateUnits(dt) {
  for (const unit of units) {
    if (!unit.alive) continue;
    unit.velocity.multiplyScalar(0.72);
    if (unit.role === "worker") updateWorker(unit, dt);
    else updateCombatUnit(unit, dt);
    if (unit.hp < unit.maxHp && !nearestEnemyEntity(unit.position, unit.faction, 12)) {
      unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.04 * dt); // out-of-combat regen (~25s to full)
    }
    unit.sprite.material.rotation = Math.sin(game.time * 4 + unit.frameSeed) * 0.02;
  }
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (!units[i].alive) units.splice(i, 1);
  }
}

function updateStructures(dt) {
  for (const faction of factions) {
    for (const structure of faction.structures) {
      if (!structure.alive) continue;
      const definition = BUILDING_TYPES[structure.type];
      if (definition.income) {
        for (const [key, value] of Object.entries(definition.income)) {
          faction.resources[key] += value * dt * (faction.bonus.power ?? 1);
        }
      }
      if (!definition.weaponRange) continue;
      structure.reload -= dt;
      if (structure.reload > 0) continue;
      const target = nearestEnemyEntity(structure.position, faction, definition.weaponRange);
      if (!target) continue;
      structure.reload = definition.cooldown;
      const material = shotMaterial(faction);
      const mesh = new THREE.Mesh(shotGeometry, material);
      mesh.position.copy(structure.position);
      mesh.position.y += structureFireHeight(structure.type);
      effectGroup.add(mesh);
      projectiles.push({
        mesh,
        source: structure,
        target,
        damage: definition.weaponDamage,
        faction,
        speed: 18,
        splash: 0,
        alive: true,
      });
    }
  }
}

function findBuildSpot(faction, type) {
  const hq = faction.hq;
  const baseRadius = structureCount(faction) < 4 ? 7 : 11;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ring = baseRadius + Math.floor(attempt / 16) * 3 + rand(-1, 1);
    const angle = attempt * 2.399 + rand(-0.35, 0.35);
    const x = clamp(hq.position.x + Math.cos(angle) * ring, -HALF_MAP + 4, HALF_MAP - 4);
    const z = clamp(hq.position.z + Math.sin(angle) * ring, -HALF_MAP + 4, HALF_MAP - 4);
    if (isWater(x, z)) continue;
    const radius = BUILDING_TYPES[type].radius + 1.8;
    const occupied = structures.some((structure) => structure.alive && distSq2(x, z, structure.position.x, structure.position.z) < (radius + structure.radius) ** 2);
    if (occupied) continue;
    return { x, z };
  }
  return null;
}

function requestBuild(faction, type) {
  if (!BUILDING_TYPES[type]?.cost) return null;
  const spot = findBuildSpot(faction, type);
  if (!spot) return null;
  const structure = createStructure(type, faction, spot.x, spot.z);
  if (structure) {
    faction.tech = Math.max(faction.tech, faction.structures.filter((item) => item.alive && item.type === "academy").length);
    if (faction.player) showMessage(`${BUILDING_TYPES[type].name} online`);
  }
  return structure;
}

function requestTrain(faction, type) {
  const definition = UNIT_TYPES[type];
  if (!definition) return null;
  const source = faction.structures.find((structure) => structure.alive && definition.trainAt.includes(structure.type));
  if (!source) return null;
  const unit = trainUnit(type, faction, source);
  if (unit && faction.player) showMessage(`${definition.name} ready`);
  return unit;
}

function thinkFaction(faction, dt) {
  if (faction.defeated) return;
  faction.nextThink -= dt;
  faction.waveTimer -= dt;
  if (faction.nextThink > 0) return;
  faction.nextThink = THINK_INTERVAL + rand(-0.5, 0.65);
  const directive = DIRECTIVES[faction.player ? game.directive : faction.directive];
  faction.directive = faction.player ? game.directive : faction.directive;
  faction.tech = faction.structures.filter((structure) => structure.alive && structure.type === "academy").length;

  if (unitCount(faction, "worker") < directive.workers) requestTrain(faction, "worker");
  if (structureCount(faction, "refinery") < Math.ceil(directive.workers / 7)) requestBuild(faction, "refinery");
  if (structureCount(faction, "solar") < Math.max(1, directive.tech + 1)) requestBuild(faction, "solar");
  // Build several barracks so the supply cap can actually hold a real army.
  if (structureCount(faction, "barracks") < clamp(Math.ceil(directive.army / 7), 1, 4)) requestBuild(faction, "barracks");
  if (directive.defense > structureCount(faction, "turret")) requestBuild(faction, "turret");
  if (directive.tech > 1 && !hasStructure(faction, "academy")) requestBuild(faction, "academy");

  const army = armyUnits(faction);
  const targetArmy = directive.army;
  if (hasStructure(faction, "barracks") && army.length < targetArmy) {
    // train from every barracks each tick so armies grow to a fighting size
    for (let i = 0; i < structureCount(faction, "barracks"); i += 1) {
      const pick = Math.random();
      requestTrain(faction, pick < 0.2 ? "scout" : pick < 0.55 ? "archer" : "soldier");
    }
  }
  if (hasStructure(faction, "academy") && faction.tech > 0 && army.length > 5 && Math.random() < 0.6) {
    requestTrain(faction, "siege");
  }

  // (Local defense is handled per-unit in updateCombatUnit's guard state — no army-wide recall needed.)
  const ready = armyUnits(faction);
  const waveMin = Math.max(6, Math.floor(targetArmy * 0.4));
  const escalation = clamp(game.time / 330, 0, 1); // total war ramps up over ~5.5 min so games conclude
  if (faction.waveTimer <= 0 && ready.length >= waveMin && Math.random() < directive.aggression + 0.25 + escalation * 0.3) {
    const target = enemyHqTarget(faction);
    if (target) {
      const count = Math.max(waveMin, Math.floor(ready.length * lerp(0.6, 0.95, escalation))); // commit a strike force, keep a home garrison early
      for (const unit of ready.slice(0, count)) unit.order = { type: "attack", target, objective: target };
      faction.waveTimer = lerp(30, 12, directive.aggression) * (1 - escalation * 0.45) + rand(0, 6);
      logEvent(`${faction.shortName} launches a strike at ${target.faction.shortName}.`);
    }
  }
}

function updateFactions(dt) {
  for (const faction of factions) thinkFaction(faction, dt);
}

function checkWinner() {
  if (game.winner) return;
  const alive = factions.filter((faction) => !faction.defeated && faction.hq?.alive);
  if (game.started && alive.length <= 1) {
    const champ = alive[0] ?? null; // length 0 == the last HQs fell on the same frame: a draw
    game.winner = champ ?? { name: "No one", shortName: "Draw", player: false };
    winnerReadout.textContent = champ ? `${champ.shortName} victory` : "Draw";
    showVictory(champ ? `${champ.shortName.toUpperCase()} VICTORY` : "MUTUAL DESTRUCTION");
    logEvent(champ ? `${champ.name} wins the skirmish.` : "Every HQ has fallen — the skirmish is a draw.");
    const stats = loadStats();
    stats.sessions += 1;
    stats.bestTime = Math.max(stats.bestTime, game.time);
    stats.bestKills = Math.max(stats.bestKills, game.stats.kills);
    if (champ?.player) stats.wins += 1;
    stats.renown = (stats.renown ?? 0) + game.stats.kills + (champ?.player ? 60 : 0); // earn Renown from your kills, bonus for winning
    saveStats(stats);
    updateMenuStats();
    game.over = true;
    game.restartTimer = RESTART_DELAY; // auto-start the next skirmish so the AFK loop keeps running
  }
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, tmpPoint);
  if (!hit) return null;
  tmpPoint.x = clamp(tmpPoint.x, -HALF_MAP, HALF_MAP);
  tmpPoint.z = clamp(tmpPoint.z, -HALF_MAP, HALF_MAP);
  tmpPoint.y = sampleTerrainHeight(tmpPoint.x, tmpPoint.z);
  return tmpPoint.clone();
}

function entityAtScreen(clientX, clientY) {
  const point = screenToWorld(clientX, clientY);
  if (!point) return null;
  let best = null;
  let bestScore = Infinity;
  const candidates = [...units, ...structures, ...resourceNodes];
  for (const entity of candidates) {
    if (entity.alive === false || entity.amount === 0) continue;
    const radius = (entity.radius ?? 0.6) + 0.55;
    const score = distSq2(point.x, point.z, entity.position.x, entity.position.z);
    if (score < radius * radius && score < bestScore) {
      bestScore = score;
      best = entity;
    }
  }
  return best;
}

function selectEntities(entities, additive = false) {
  if (!additive) game.selected = [];
  for (const entity of entities) {
    if (!entity || entity.faction !== playerFaction || entity.alive === false) continue;
    if (!game.selected.includes(entity)) game.selected.push(entity);
  }
  updateSelectionVisuals();
  updateSelectedPanel();
}

function updateSelectionVisuals() {
  for (const unit of units) unit.selectRing.visible = game.selected.includes(unit);
  for (const structure of structures) {
    structure.selectRing.visible = game.selected.includes(structure);
    structure.selectRing.material = structure.faction === playerFaction ? materials.selection : materials.enemySelection;
    if (structure.healthBar) structure.healthBar.visible = structure.hp < structure.maxHp || game.selected.includes(structure);
  }
}

function selectInBox(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const rect = canvas.getBoundingClientRect();
  const selected = [];
  for (const unit of playerFaction.units) {
    if (!unit.alive) continue;
    const projected = tmpVec.copy(unit.position).project(camera);
    const sx = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
    if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selected.push(unit);
  }
  selectEntities(selected);
}

function issueOrder(point, target = null) {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.alive);
  const selectedStructures = game.selected.filter((entity) => entity.kind === "structure" && entity.alive);
  if (selectedUnits.length === 0 && selectedStructures.length > 0 && point) {
    for (const structure of selectedStructures) structure.rallyPoint.copy(point);
    showMessage("Rally point set");
    return;
  }
  if (selectedUnits.length === 0) return;
  if (target && target.faction !== playerFaction && target.kind !== "resource") {
    for (const unit of selectedUnits) unit.order = { type: "attack", target, objective: target };
    showMessage("Attack order issued");
    return;
  }
  if (target?.kind === "resource") {
    for (const unit of selectedUnits.filter((unit) => unit.role === "worker")) {
      unit.order = { type: "gather", target };
      unit.cargo = 0;
      unit.cargoType = null;
    }
    showMessage("Workers assigned");
    return;
  }
  selectedUnits.forEach((unit, index) => {
    const side = Math.ceil(Math.sqrt(selectedUnits.length));
    const ox = (index % side - (side - 1) / 2) * 0.9;
    const oz = (Math.floor(index / side) - (side - 1) / 2) * 0.9;
    unit.order = { type: "move", point: new THREE.Vector3(point.x + ox, 0, point.z + oz), target: null };
  });
  showMessage("Move order issued");
}

function orderSelectedAttack() {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.role === "army" && entity.alive);
  const target = enemyHqTarget(playerFaction) ?? nearestEnemyEntity(playerFaction.hq.position, playerFaction);
  if (!target || selectedUnits.length === 0) return;
  for (const unit of selectedUnits) unit.order = { type: "attack", target, objective: target };
  showMessage("Selected army attacking");
}

function orderSelectedDefend() {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.alive);
  const point = playerFaction.hq.position.clone();
  for (const unit of selectedUnits.length ? selectedUnits : armyUnits(playerFaction)) {
    unit.order = { type: "guard", point };
  }
  showMessage("Defensive posture");
}

function startSelectionBox(x, y) {
  selectionBox.classList.remove("hidden");
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = "0px";
  selectionBox.style.height = "0px";
}

function updateSelectionBox(x0, y0, x1, y1) {
  selectionBox.style.left = `${Math.min(x0, x1)}px`;
  selectionBox.style.top = `${Math.min(y0, y1)}px`;
  selectionBox.style.width = `${Math.abs(x1 - x0)}px`;
  selectionBox.style.height = `${Math.abs(y1 - y0)}px`;
}

function hideSelectionBox() {
  selectionBox.classList.add("hidden");
}

function onPointerDown(event) {
  if (!game.started || document.body.classList.contains("menu-open")) return;
  const startEntity = entityAtScreen(event.clientX, event.clientY);
  const leftButton = event.button === 0;
  const rightButton = event.button === 2;
  const middleButton = event.button === 1;
  if (!leftButton && !rightButton && !middleButton) return;
  pointer.active = true;
  pointer.id = event.pointerId;
  pointer.button = event.button;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.moved = false;
  pointer.startEntity = startEntity;
  pointer.selecting = leftButton;
  pointer.panning = rightButton;
  pointer.rotating = middleButton;
  if (pointer.selecting) startSelectionBox(event.clientX, event.clientY);
  if (pointer.selecting) canvas.classList.add("selecting");
  if (pointer.panning) canvas.classList.add("panning");
  if (pointer.rotating) canvas.classList.add("rotating");
  if (pointer.panning || pointer.rotating || event.button !== 0) event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (pointer.active && pointer.id !== null && event.pointerId !== pointer.id) return;
  if (!pointer.active) {
    if (event.target === canvas) hoverEntity = entityAtScreen(event.clientX, event.clientY);
    return;
  }
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const totalDx = event.clientX - pointer.startX;
  const totalDy = event.clientY - pointer.startY;
  pointer.moved = pointer.moved || Math.hypot(totalDx, totalDy) > 5;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (pointer.rotating) {
    if (pointer.moved) rotateCamera(dx, dy);
    event.preventDefault();
    return;
  }
  if (pointer.panning) {
    if (pointer.moved) panCamera(dx, dy);
    event.preventDefault();
    return;
  }
  hoverEntity = entityAtScreen(event.clientX, event.clientY);
  if (pointer.selecting) updateSelectionBox(pointer.startX, pointer.startY, event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (!pointer.active) return;
  if (pointer.id !== null && event.pointerId !== pointer.id) return;
  const wasSelecting = pointer.selecting;
  const wasPanning = pointer.panning;
  pointer.active = false;
  pointer.id = null;
  pointer.selecting = false;
  pointer.panning = false;
  pointer.rotating = false;
  try {
    canvas.releasePointerCapture?.(event.pointerId);
  } catch {
    // The browser may already release capture after a context-menu/right-button gesture.
  }
  canvas.classList.remove("panning", "selecting", "rotating");
  hideSelectionBox();
  if (wasSelecting) {
    if (pointer.moved) selectInBox(pointer.startX, pointer.startY, event.clientX, event.clientY);
    else selectEntities([entityAtScreen(event.clientX, event.clientY)], event.shiftKey);
  } else if (wasPanning && !pointer.moved) {
    const point = screenToWorld(event.clientX, event.clientY);
    const target = entityAtScreen(event.clientX, event.clientY);
    if (pointer.button === 2) issueOrder(point, target);
  }
  pointer.startEntity = null;
}

function rotateCamera(dx, dy) {
  cameraState.yaw += dx * 0.005; // horizontal drag orbits; vertical drag tilts
  cameraState.pitch = clamp(cameraState.pitch - dy * 0.004, MIN_PITCH, MAX_PITCH);
  recomputeCameraBasis();
  updateCamera();
}

function panCamera(dx, dy) {
  const scale = cameraState.distance / Math.min(window.innerWidth, window.innerHeight) * 0.72;
  // drag the map: the world follows the cursor (both axes)
  cameraState.target.addScaledVector(PAN_RIGHT, -dx * scale);
  cameraState.target.addScaledVector(PAN_FORWARD, -dy * scale);
  cameraState.target.x = clamp(cameraState.target.x, -HALF_MAP + 8, HALF_MAP - 8);
  cameraState.target.z = clamp(cameraState.target.z, -HALF_MAP + 8, HALF_MAP - 8);
}

function updateKeyboardCamera(dt) {
  const speed = cameraState.distance * dt * 0.42;
  if (keys.has("KeyW") || keys.has("ArrowUp")) cameraState.target.addScaledVector(PAN_FORWARD, -speed);
  if (keys.has("KeyS") || keys.has("ArrowDown")) cameraState.target.addScaledVector(PAN_FORWARD, speed);
  if (keys.has("KeyA") || keys.has("ArrowLeft")) cameraState.target.addScaledVector(PAN_RIGHT, -speed);
  if (keys.has("KeyD") || keys.has("ArrowRight")) cameraState.target.addScaledVector(PAN_RIGHT, speed);
  cameraState.target.x = clamp(cameraState.target.x, -HALF_MAP + 8, HALF_MAP - 8);
  cameraState.target.z = clamp(cameraState.target.z, -HALF_MAP + 8, HALF_MAP - 8);
}

function applyCameraFrustum() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = cameraState.distance * VIEW_TANGENT;
  camera.left = -halfH * aspect;
  camera.right = halfH * aspect;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

function updateCamera() {
  tmpCameraLook.copy(cameraState.target);
  tmpCameraLook.y = CAMERA_LOOK_HEIGHT;
  camera.position.copy(tmpCameraLook).addScaledVector(CAMERA_DIR, cameraState.distance);
  camera.lookAt(tmpCameraLook);
  skyGroup.position.set(camera.position.x, 0, camera.position.z); // keep the backdrop centered on the camera (infinite-sky feel)
}

function zoomCamera(factor) {
  cameraState.distance = clamp(cameraState.distance * factor, MIN_ZOOM, MAX_ZOOM);
  applyCameraFrustum();
}

function resetCamera() {
  cameraState.target.copy(playerFaction?.hq?.position ?? new THREE.Vector3(0, 0, 0));
  cameraState.target.y = CAMERA_LOOK_HEIGHT;
  cameraState.distance = 135;
  cameraState.yaw = ISO_YAW;
  cameraState.pitch = ISO_PITCH;
  recomputeCameraBasis();
  applyCameraFrustum();
  updateCamera();
}

function setDirective(id) {
  game.directive = id;
  if (playerFaction) playerFaction.directive = id;
  directiveReadout.textContent = DIRECTIVES[id].label;
  for (const button of directiveButtons.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.directive === id);
  }
  if (game.started) logEvent(`Doctrine changed to ${DIRECTIVES[id].label}.`);
}

function showMessage(text) {
  battleMessage.textContent = text;
  battleMessage.classList.add("show");
  game.lastMessageAt = game.time;
}

function showVictory(text) {
  battleMessage.textContent = text;
  battleMessage.classList.add("show", "victory");
}

function updateMessage() {
  if (battleMessage.classList.contains("victory")) return; // the end-of-match banner stays up until a new game
  if (battleMessage.classList.contains("show") && game.time - game.lastMessageAt > 1.6) {
    battleMessage.classList.remove("show");
  }
}

function logEvent(text, reset = false) {
  if (reset) eventLog.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = `${formatTime(game.time)}  ${text}`;
  eventLog.prepend(li);
  while (eventLog.children.length > 9) eventLog.lastElementChild.remove();
}

function updateSelectedPanel() {
  selectedCount.textContent = game.selected.length;
  if (game.selected.length === 0) {
    selectedTitle.textContent = "No selection";
    selectedBody.textContent = "Left-click or drag-select your units. Right-click the map or an enemy to issue direct orders.";
    return;
  }
  if (game.selected.length > 1) {
    const workers = game.selected.filter((entity) => entity.type === "worker").length;
    const army = game.selected.filter((entity) => entity.kind === "unit" && entity.role === "army").length;
    selectedTitle.textContent = `${game.selected.length} selected`;
    selectedBody.textContent = `${workers} workers, ${army} army units. Right-click resources, enemies, or terrain to override the AFK brain.`;
    return;
  }
  const entity = game.selected[0];
  if (entity.kind === "unit") {
    selectedTitle.textContent = `${entity.name}`;
    const order = entity.order?.type ? entity.order.type.replace("-", " ") : "idle";
    selectedBody.textContent = `${entity.faction.name}. HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}. Current order: ${order}.`;
  } else {
    selectedTitle.textContent = `${entity.name}`;
    selectedBody.textContent = `${entity.faction.name}. HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}. Right-click terrain to set its rally point.`;
  }
}

function updateUI(force = false) {
  uiTimer -= force ? UI_INTERVAL : 0;
  if (uiTimer > 0 && !force) return;
  uiTimer = UI_INTERVAL;
  const player = playerFaction;
  civName.textContent = player.name;
  foodReadout.textContent = resourceText(player.resources.food);
  oreReadout.textContent = resourceText(player.resources.ore);
  powerReadout.textContent = resourceText(player.resources.power);
  supplyReadout.textContent = `${currentSupply(player)} / ${supplyCap(player)}`;
  const hqPct = player.hq?.alive ? clamp(player.hq.hp / player.hq.maxHp, 0, 1) : 0;
  hqReadout.textContent = `${Math.round(hqPct * 100)}%`;
  hqMeter.style.width = `${hqPct * 100}%`;
  timeReadout.textContent = formatTime(game.time);
  const workers = unitCount(player, "worker");
  const army = armyUnits(player).length;
  workerReadout.textContent = workers;
  armyReadout.textContent = `${army} army`;
  buildingReadout.textContent = player.structures.filter((item) => item.alive).length;
  killsReadout.textContent = game.stats.kills;
  lossesReadout.textContent = game.stats.losses;
  const alive = factions.filter((faction) => !faction.defeated).length;
  aliveReadout.textContent = `${alive} alive`;
  winnerReadout.textContent = game.winner
    ? `${game.winner.shortName} victory`
    : !game.started
      ? "Skirmish"
      : game.suddenDeathOn
        ? "⚔ Sudden death"
        : `SD in ${formatTime(Math.max(0, SUDDEN_DEATH_START - game.time))}`;
  const leaderArmy = factions.reduce((max, f) => (f.defeated ? max : Math.max(max, armyUnits(f).length)), 0);
  civList.innerHTML = factions
    .map((faction) => {
      const liveUnits = faction.units.filter((unit) => unit.alive).length;
      const armyCount = armyUnits(faction).length;
      const hq = faction.hq?.alive ? Math.round((faction.hq.hp / faction.hq.maxHp) * 100) : 0;
      const isLeader = !faction.defeated && armyCount > 0 && armyCount === leaderArmy;
      return `
        <div class="civ-row${isLeader ? " leader" : ""}${faction.defeated ? " out" : ""}">
          <span class="civ-dot" style="background:${colorHex(faction.color)}"></span>
          <div><strong>${isLeader ? "★ " : ""}${faction.shortName}</strong><span>${armyCount} army · ${liveUnits} units · HQ ${hq}%</span></div>
          <span>${faction.defeated ? "Out" : DIRECTIVES[faction.directive].label.split(" ")[0]}</span>
        </div>
      `;
    })
    .join("");
  statTime.textContent = formatTime(game.time);
  statKills.textContent = game.stats.kills;
  statLosses.textContent = game.stats.losses;
  statBuildings.textContent = game.stats.buildingsBuilt;
  statArmy.textContent = army;
  statWorkers.textContent = workers;
  updateSelectedPanel();
  updateCommandButtons();
}

function updateCommandButtons() {
  for (const button of document.querySelectorAll("[data-build]")) {
    const type = button.dataset.build;
    button.disabled = !canPay(playerFaction, BUILDING_TYPES[type].cost);
    button.title = costTitle(BUILDING_TYPES[type].cost);
  }
  for (const button of document.querySelectorAll("[data-train]")) {
    const type = button.dataset.train;
    const definition = UNIT_TYPES[type];
    const source = playerFaction.structures.some((structure) => structure.alive && definition.trainAt.includes(structure.type));
    button.disabled =
      !source ||
      currentSupply(playerFaction) + definition.supply > supplyCap(playerFaction) ||
      (definition.requiresTech ?? 0) > playerFaction.tech ||
      !canPay(playerFaction, adjustedUnitCost(type, playerFaction));
    button.title = source ? costTitle(adjustedUnitCost(type, playerFaction)) : `Needs ${definition.trainAt.map((item) => BUILDING_TYPES[item].name).join(" or ")}`;
  }
}

function costTitle(cost = {}) {
  const entries = Object.entries(cost);
  if (entries.length === 0) return "Free";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) ?? { sessions: 0, bestTime: 0, bestKills: 0, wins: 0, renown: 0, upgrades: { dmg: 0, hp: 0, eco: 0 } };
  } catch {
    return { sessions: 0, bestTime: 0, bestKills: 0, wins: 0, renown: 0, upgrades: { dmg: 0, hp: 0, eco: 0 } };
  }
}

function saveStats(stats) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(stats));
}

function applyOfflineProgress() {
  const stats = loadStats();
  game.offlineEarned = 0;
  if (stats.lastSeen) {
    const elapsed = Math.max(0, (Date.now() - stats.lastSeen) / 1000);
    if (elapsed > 60) {
      const earned = Math.floor(Math.min(elapsed, OFFLINE_CAP) * OFFLINE_RATE);
      if (earned > 0) {
        stats.renown = (stats.renown ?? 0) + earned;
        game.offlineEarned = earned;
      }
    }
  }
  stats.lastSeen = Date.now();
  saveStats(stats);
}

function touchLastSeen() {
  const stats = loadStats();
  stats.lastSeen = Date.now();
  saveStats(stats);
}

function startLastSeenTracking() {
  setInterval(touchLastSeen, 10000);
  window.addEventListener("beforeunload", touchLastSeen);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) touchLastSeen();
  });
}

function updateMenuStats() {
  const stats = loadStats();
  menuSessions.textContent = stats.sessions ?? 0;
  menuBestTime.textContent = formatTime(stats.bestTime ?? 0);
  menuBestKills.textContent = stats.bestKills ?? 0;
  menuWins.textContent = stats.wins ?? 0;
  const renown = stats.renown ?? 0;
  if (menuRenown) menuRenown.textContent = renown;
  if (offlineNote) offlineNote.textContent = game.offlineEarned > 0 ? `Your lands earned ${game.offlineEarned} Renown while you were away.` : "";
  const ups = stats.upgrades ?? {};
  for (const cell of document.querySelectorAll(".upgrade-cell")) {
    const def = UPGRADES.find((u) => u.id === cell.dataset.upgrade);
    if (!def) continue;
    const lvl = ups[def.id] ?? 0;
    const maxed = lvl >= def.max;
    const cost = upgradeCost(lvl);
    cell.querySelector("strong").textContent = maxed ? `Lv ${lvl} · MAX` : `Lv ${lvl} · ${cost}`;
    cell.disabled = maxed || renown < cost;
  }
}

function buyUpgrade(id) {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return;
  const stats = loadStats();
  const ups = stats.upgrades ?? { dmg: 0, hp: 0, eco: 0 };
  const lvl = ups[id] ?? 0;
  const cost = upgradeCost(lvl);
  if (lvl >= def.max || (stats.renown ?? 0) < cost) return;
  stats.renown -= cost;
  ups[id] = lvl + 1;
  stats.upgrades = ups;
  saveStats(stats);
  updateMenuStats();
}

function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
}

function setPaused(paused, showPauseMenu = false) {
  game.paused = paused;
  pauseToggle.innerHTML = paused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
  pauseToggle.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pauseToggle.setAttribute("title", paused ? "Resume" : "Pause");
  createIcons({
    icons: { Play, Pause },
  });
  pauseMenu.classList.toggle("hidden", !showPauseMenu);
  setMenuOpen(showPauseMenu || !game.started);
}

function startGame() {
  const ups = loadStats().upgrades ?? {}; // apply purchased Renown upgrades to the player faction
  playerDmgMul = 1 + 0.08 * (ups.dmg ?? 0);
  playerHpMul = 1 + 0.08 * (ups.hp ?? 0);
  playerEcoMul = 1 + 0.12 * (ups.eco ?? 0);
  game.offlineEarned = 0; // consumed once shown on the menu
  resetWorld();
  game.started = true;
  game.paused = false;
  game.stats.sessions += 1;
  battleMessage.classList.remove("victory"); // clear last match's victory banner
  mainMenu.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  setMenuOpen(false);
  setPaused(false);
  showMessage("AFK simulation running");
}

function exitToMenu() {
  game.started = false;
  game.paused = true;
  mainMenu.classList.remove("hidden");
  pauseMenu.classList.add("hidden");
  setMenuOpen(true);
  updateMenuStats();
}

function togglePause() {
  if (!game.started) return;
  if (game.paused) setPaused(false);
  else setPaused(true, true);
}

function cycleSpeed() {
  gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : 1;
  if (speedToggle) {
    speedToggle.textContent = `${gameSpeed}×`;
    speedToggle.title = `Speed ${gameSpeed}× — click to change`;
  }
}

function bindEvents() {
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("auxclick", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomCamera(event.deltaY > 0 ? 1.08 : 0.92);
  }, { passive: false });
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    } else if (game.started && /^(Digit|Numpad)[1-5]$/.test(event.code)) {
      setDirective(["balanced", "economy", "military", "tech", "defense"][Number(event.code.slice(-1)) - 1]); // doctrine hotkeys
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyCameraFrustum();
    updateCamera();
  });
  resetViewButton.addEventListener("click", resetCamera);
  minimapCanvas?.addEventListener("click", (event) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const wx = ((event.clientX - rect.left) / rect.width) * MAP_SIZE - HALF_MAP;
    const wz = ((event.clientY - rect.top) / rect.height) * MAP_SIZE - HALF_MAP;
    cameraState.target.x = clamp(wx, -HALF_MAP + 8, HALF_MAP - 8);
    cameraState.target.z = clamp(wz, -HALF_MAP + 8, HALF_MAP - 8);
    updateCamera();
  });
  zoomInButton.addEventListener("click", () => zoomCamera(0.86));
  zoomOutButton.addEventListener("click", () => zoomCamera(1.14));
  pauseToggle.addEventListener("click", togglePause);
  speedToggle?.addEventListener("click", cycleSpeed);
  startSkirmishButton.addEventListener("click", startGame);
  for (const btn of document.querySelectorAll(".upgrade-cell")) {
    btn.addEventListener("click", () => buyUpgrade(btn.dataset.upgrade));
  }
  resumeGameButton.addEventListener("click", () => setPaused(false));
  restartGameButton.addEventListener("click", startGame);
  exitToMenuButton.addEventListener("click", exitToMenu);
  directiveButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-directive]");
    if (button) setDirective(button.dataset.directive);
  });
  document.querySelectorAll("[data-build]").forEach((button) => {
    button.addEventListener("click", () => requestBuild(playerFaction, button.dataset.build));
  });
  document.querySelectorAll("[data-train]").forEach((button) => {
    button.addEventListener("click", () => requestTrain(playerFaction, button.dataset.train));
  });
  attackOrderButton.addEventListener("click", orderSelectedAttack);
  defendOrderButton.addEventListener("click", orderSelectedDefend);
}

let minimapTerrain = null;
let minimapTimer = 0;
const MINIMAP_RES = 168;

function buildMinimapTerrain() {
  const c = document.createElement("canvas");
  c.width = MINIMAP_RES;
  c.height = MINIMAP_RES;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(MINIMAP_RES, MINIMAP_RES);
  for (let py = 0; py < MINIMAP_RES; py += 1) {
    for (let px = 0; px < MINIMAP_RES; px += 1) {
      const wx = (px / MINIMAP_RES) * MAP_SIZE - HALF_MAP;
      const wz = (py / MINIMAP_RES) * MAP_SIZE - HALF_MAP;
      let r;
      let g;
      let b;
      if (isWater(wx, wz)) {
        r = 36; g = 86; b = 122; // water
      } else {
        const h = clamp(sampleTerrainHeight(wx, wz), 0, 3) / 3; // green lowland -> grey-brown highland
        r = Math.round(lerp(60, 124, h));
        g = Math.round(lerp(112, 98, h));
        b = Math.round(lerp(62, 82, h));
      }
      const i = (py * MINIMAP_RES + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  minimapTerrain = c;
}

function drawMinimap() {
  if (!minimapCanvas || !minimapTerrain) return;
  const ctx = minimapCanvas.getContext("2d");
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(minimapTerrain, 0, 0, W, H);
  const sx = W / MAP_SIZE;
  const sz = H / MAP_SIZE;
  for (const s of structures) {
    if (!s.alive) continue;
    const size = s.type === "hq" ? 5 : 3;
    ctx.fillStyle = colorHex(s.faction.color);
    ctx.fillRect((s.position.x + HALF_MAP) * sx - size / 2, (s.position.z + HALF_MAP) * sz - size / 2, size, size);
  }
  for (const u of units) {
    if (!u.alive) continue;
    ctx.fillStyle = colorHex(u.faction.color);
    ctx.fillRect((u.position.x + HALF_MAP) * sx - 1, (u.position.z + HALF_MAP) * sz - 1, 2, 2);
  }
  const aspect = window.innerWidth / window.innerHeight;
  const halfW = cameraState.distance * VIEW_TANGENT * aspect;
  const halfH = cameraState.distance * VIEW_TANGENT;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.strokeRect((cameraState.target.x - halfW + HALF_MAP) * sx, (cameraState.target.z - halfH + HALF_MAP) * sz, halfW * 2 * sx, halfH * 2 * sz);
}

function updateSuddenDeath(dt) {
  if (game.time < SUDDEN_DEATH_START) return;
  if (!game.suddenDeathOn) {
    game.suddenDeathOn = true;
    showMessage("SUDDEN DEATH — the strongest throne will endure");
    logEvent("Sudden death: the lands turn hostile — weaker HQs crumble fastest.");
  }
  const base = 7 + (game.time - SUDDEN_DEATH_START) * 0.1; // hp/sec, accelerating, so matches always conclude
  let maxArmy = 1;
  for (const faction of factions) if (!faction.defeated) maxArmy = Math.max(maxArmy, armyUnits(faction).length);
  for (const faction of factions) {
    if (faction.defeated || !faction.hq?.alive) continue;
    const weakness = 1 - armyUnits(faction).length / maxArmy; // 0 for the army leader, ->1 for the weakest
    damageEntity(faction.hq, base * (1 + 2 * weakness) * dt, null); // weaker armies decay up to 3x faster -> the strongest survives last
  }
}

function stepSimulation(dt) {
  if (game.over) {
    // hold on the victory banner, then auto-start the next skirmish
    game.restartTimer -= dt;
    if (game.restartTimer <= 0) startGame();
    return;
  }
  game.time += dt;
  updateKeyboardCamera(dt);
  rebuildSpatial();
  processPathQueue();
  updateFactions(dt);
  updateStructures(dt);
  updateUnits(dt);
  updateProjectiles(dt);
  updateEffects(dt);
  updateSuddenDeath(dt);
  checkWinner();
  updateMessage();
}

function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (!game.started || game.paused) dt = 0;
  if (dt > 0) for (let i = 0; i < gameSpeed; i += 1) stepSimulation(dt);
  if (skySphere) skySphere.rotation.y += dt * 0.01;
  enforceStructureAnchors();
  updateCamera();
  uiTimer -= dt || 0.016;
  updateUI();
  minimapTimer -= dt || 0.016;
  if (minimapTimer <= 0) {
    minimapTimer = 0.12; // ~8fps minimap refresh
    drawMinimap();
  }
  renderer.render(scene, camera);
}

function init() {
  initMaterials();
  createSkybox();
  createLighting();
  createTerrain();
  buildMinimapTerrain();
  resetWorld();
  game.started = false;
  game.paused = true;
  mainMenu.classList.remove("hidden");
  setMenuOpen(true);
  bindEvents();
  applyOfflineProgress();
  startLastSeenTracking();
  updateMenuStats();
  updateUI(true);
  animate();
}

init();
