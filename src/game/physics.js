export const CAR_LENGTH = 4.7
export const ROAD_SCALE = 7
export const LANES = [-.55, 0, .55]
// Okadas weave between the car lanes and along the kerbs.
const OKADA_LANES = [-.86, -.28, .28, .86]
export const KINDS = {
  car: { length: 4.7, width: 1.85, cruise: [45, 78] },
  taxi: { length: 4.5, width: 1.8, cruise: [45, 66] },
  danfo: { length: 5.8, width: 2, cruise: [52, 88] },
  keke: { length: 2.8, width: 1.45, cruise: [28, 40] },
  okada: { length: 2.1, width: .85, cruise: [42, 72] },
  brt: { length: 12, width: 2.55, cruise: [40, 55] },
  police: { length: 5.3, width: 1.9 },
}
const SPAWN = ['car', 'danfo', 'car', 'keke', 'taxi', 'okada', 'car', 'danfo', 'brt', 'car', 'okada', 'keke', 'taxi', 'car', 'danfo', 'okada', 'car', 'car', 'danfo', 'car', 'taxi', 'keke', 'car', 'danfo', 'okada', 'car', 'car', 'taxi', 'danfo', 'car', 'car', 'brt', 'car', 'danfo']
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const approach = (a, b, step) => a + clamp(b - a, -step, step)
const noise = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s) }
const kindOf = v => v.kind || (v.danfo ? 'danfo' : 'car')
// What every vehicle is, and what beating its driver is worth.
const SEDANS = [{ make: 'PEUGEOT', name: '504', year: 1982, tier: 1 }, { make: 'MERCEDES-BENZ', name: '190E', year: 1991, tier: 2 }, { make: 'TOYOTA', name: 'CAMRY', year: 2003, tier: 3 }, { make: 'DODGE', name: 'CHALLENGER', year: 2023, tier: 4 }, { make: 'TOYOTA', name: 'COROLLA', year: 2005, tier: 2 }, { make: 'HONDA', name: 'ACCORD', year: 2008, tier: 3 }, { make: 'LEXUS', name: 'RX 350', year: 2010, tier: 4 }, { make: 'MERCEDES-AMG', name: 'G 63', year: 2021, tier: 5 }, { make: 'LAMBORGHINI', name: 'HURACÁN', year: 2020, tier: 5 }, { make: 'FERRARI', name: 'F8 TRIBUTO', year: 2021, tier: 5 }, { make: 'BUGATTI', name: 'CHIRON', year: 2022, tier: 5 }]
export const TIER_VALUE = [60, 100, 200, 350, 600, 900]
export function vehicleInfo(v) {
  const kind = kindOf(v)
  if (kind === 'car' || kind === 'taxi') { const c = SEDANS[(v.model ?? 0) % (kind === 'taxi' ? 3 : SEDANS.length)]; return { ...c, taxi: kind === 'taxi', tier: kind === 'taxi' ? 1 : c.tier, value: TIER_VALUE[kind === 'taxi' ? 1 : c.tier] } }
  const other = { danfo: { make: 'VOLKSWAGEN', name: 'DANFO', year: 1987, tier: 1 }, brt: { make: 'LAGOS', name: 'BRT BUS', year: 2008, tier: 1 }, keke: { make: 'BAJAJ', name: 'KEKE', year: 2012, tier: 0 }, okada: { make: 'BAJAJ', name: 'OKADA', year: 2015, tier: 0 }, police: { make: 'TOYOTA', name: 'HILUX · POLICE', year: 2018, tier: 2 } }[kind] || SEDANS[0]
  return { ...other, value: TIER_VALUE[other.tier] }
}
// Each sedan's real body size (the 3D models match), so bumpers meet instead of sinking into each other.
const SEDAN_SIZE = [[4.5, 1.72], [4.45, 1.7], [4.8, 1.8], [5.0, 1.93], [4.53, 1.7], [4.93, 1.84], [4.77, 1.89], [4.82, 1.93], [4.52, 1.98], [4.61, 1.98], [4.54, 2.04]]
const sedanSize = v => (kindOf(v) === 'car' || kindOf(v) === 'taxi') && v.model !== undefined ? SEDAN_SIZE[v.model % (kindOf(v) === 'taxi' ? 3 : SEDAN_SIZE.length)] : null
export const vehicleLength = v => { const s = sedanSize(v); return s ? s[0] + .15 : (KINDS[kindOf(v)] || KINDS.car).length }
export const vehicleWidth = v => { const s = sedanSize(v); return s ? s[1] + .1 : (KINDS[kindOf(v)] || KINDS.car).width }
const lateralGap = (a, b) => (vehicleWidth(a) + vehicleWidth(b)) / 2 + .05
const lanesFor = kind => kind === 'okada' ? OKADA_LANES : kind === 'keke' ? [0, .55] : kind === 'brt' ? [-.55, 0] : LANES

// Spread traffic over every lane: a new vehicle goes into whichever of its lanes is emptiest nearby.
function quietestLane(traffic, kind, z, seed) {
  const load = x => traffic.filter(o => Math.abs(o.x - x) < .2 && Math.abs(o.z - z) < 250).length + noise(seed * 3.3 + x) * .5
  return lanesFor(kind).reduce((a, b) => load(b) < load(a) ? b : a)
}
// Reckless drivers: most danfos, a fair few taxis and okadas, some private cars. They speed, tailgate,
// weave and cut in, and now and then one picks a fight with you without being provoked.
const RECKLESS = { danfo: .55, taxi: .3, okada: .3, car: .15 }
function makeVehicle(id, kind, seed, z, lane = null, recklessMul = 1) {
  const lanes = lanesFor(kind), [lo, hi] = KINDS[kind].cruise
  const x = lane ?? lanes[Math.floor(noise(seed) * lanes.length)], cruise = lo + noise(seed + 7) * (hi - lo)
  const reckless = noise(seed * 1.37 + 11) < Math.min(.9, (RECKLESS[kind] || 0) * recklessMul)
  return { id, kind, danfo: kind === 'danfo', model: Math.floor(noise(seed + 3) * 8), tint: Math.floor(noise(seed + 5) * 8), x, tx: x, z, speed: cruise, cruise: reckless ? cruise * 1.18 : cruise, reckless, hold: 0, laneTimer: 0, dmg: null, skid: 0 }
}

export function newWorld() {
  // Traffic starts all around you (some behind, some alongside) and fills every lane.
  const traffic = []
  SPAWN.forEach((kind, i) => { const z = -60 + i * 34; traffic.push(makeVehicle(`npc${i}`, kind, i + 1, z, quietestLane(traffic, kind, z, i))) })
  // A danfo loading passengers at the kerb when you start.
  Object.assign(traffic[1], { z: 62, x: .55, tx: .55, speed: 0, hold: 6 })
  return { road: { ...START_ROAD }, street: 0, z: 30, x: 0, speed: 0, steer: 0, time: 0, heat: 0, wanted: 0, score: 0, message: '', race: null, contacts: {}, police: null, arrested: false, escape: 0, hornUntil: 0, ramUntil: 0, damage: 0, dmg: { front: 0, rear: 0, left: 0, right: 0 }, skid: 0, impactUntil: 0, events: [], traffic }
}

// Naija Rush: every drive is a 2 km race from a standing start against these four. They race flat out and fight dirty.
// Each rival has a colour: their car's paint (the danfo stays yellow), name marker, minimap dot and standings row all use it.
export const RIVALS = [
  { name: 'OJUELEGBA FLASH', kind: 'car', model: 3, tint: 1, skill: 1.01, color: '#ff3b30' },
  { name: 'AREA FATHER', kind: 'car', model: 7, tint: 4, skill: .98, color: '#a855f7' },
  { name: 'DANFO KING', kind: 'danfo', tint: 2, skill: 1.03, color: '#ffc61a' },
  { name: 'LEKKI BOSS', kind: 'car', model: 6, tint: 3, skill: .95, color: '#22b8ff' },
]
// Three laps of 3 km. The road is straight, so each lap ends at a LAP gantry and the last at the FINISH.
export const LAP_LENGTH = 3000, LAPS = 3
// A police checkpoint halfway round every lap: vans block the outer lanes; go through the middle under this speed.
export const CHECKPOINT_SPEED = 60
// About a third of free-roam traffic and no BRT buses, so the race flows (and there are no go-slows).
const RUSH_SPAWN = ['car', 'danfo', 'taxi', 'car', 'danfo', 'okada', 'car', 'danfo', 'okada', 'car', 'danfo', 'keke', 'car', 'danfo', 'taxi', 'okada', 'car', 'danfo', 'car', 'danfo', 'car', 'danfo', 'okada', 'taxi', 'car', 'danfo', 'car', 'danfo', 'okada', 'car', 'danfo', 'car', 'danfo']
// Race traffic drives worse: reckless odds nearly doubled (most danfos, half the taxis and okadas, a quarter of cars).
const RUSH_RECKLESS = 1.8
export const START_LINE = 50, COUNTDOWN = 3.6
// The fastest the rivals ever go (Challenger pace), and their strongest acceleration.
export const RIVAL_TOP_SPEED = 200, RIVAL_ACCEL = 46
export function newRace({ countdown = true } = {}) {
  const traffic = []
  RUSH_SPAWN.forEach((kind, i) => { const z = 160 + i * 55; traffic.push(makeVehicle(`npc${i}`, kind, i + 1, z, quietestLane(traffic, kind, z, i), RUSH_RECKLESS)) })
  // The grid: two rivals on the front row, you in the middle, two behind. Without a countdown (behind the title screen) they wait on the line.
  const grid = [[-.55, START_LINE - 4], [.55, START_LINE - 4], [-.55, START_LINE - 20], [.55, START_LINE - 20]]
  const racers = RIVALS.map((r, i) => ({ ...makeVehicle(`npcR${i}`, r.kind, 90 + i, grid[i][1], grid[i][0]), model: r.model ?? 0, tint: r.tint, color: r.kind === 'car' ? r.color : undefined, speed: 0, cruise: 0, reckless: false, skill: r.skill, rival: i }))
  const checkpoints = Array.from({ length: LAPS }, (_, i) => ({ z: START_LINE + i * LAP_LENGTH + LAP_LENGTH / 2, passed: false, warned: false }))
  const vans = checkpoints.flatMap((cp, i) => [-.55, .55].map((x, j) => ({ id: `npcCP${i}${j}`, kind: 'police', fixed: true, ax: x, az: cp.z, x, tx: x, z: cp.z, speed: 0, cruise: 0, hold: 1e9, reckless: false, laneTimer: 0, dmg: null, skid: 0, model: 0, tint: 0 })))
  const g = { ...newWorld(), z: START_LINE - 12, x: 0, traffic: [...racers, ...traffic, ...vans], rush: true, reckless: 0 }
  g.race = { grid: true, label: 'NAIJA RUSH', start: START_LINE, finish: START_LINE + LAPS * LAP_LENGTH, laps: LAPS, lap: 1, lapTimes: [], checkpoints, go: countdown ? COUNTDOWN : Infinity, rival: racers[0].id, rivals: racers.map(r => r.id), finished: [], times: {}, end: Infinity }
  return g
}
// Reckless driving fills a meter; when it is full, olokpa come for you.
export const RECKLESS_LIMIT = 45
const addReckless = (g, n) => { if (g.rush && !g.police && !g.race?.done) g.reckless = (g.reckless || 0) + n }

// Heavier vehicles barely move when hit; light ones get shoved.
const MASS = { okada: .35, keke: .55, car: 1.3, taxi: 1.2, danfo: 2, brt: 6, police: 2.1 }
const massOf = v => MASS[kindOf(v)] ?? 1.3
const emit = (g, e) => (g.events ||= []).push(e)
function hurt(v, side, amount) { v.dmg ||= { front: 0, rear: 0, left: 0, right: 0 }; v.dmg[side] = Math.min(1, v.dmg[side] + amount) }
// Your car takes 75% more hits to wreck: each hit counts for 1/1.75 of its old damage.
export const WRECK_TOUGHNESS = 1.75
export const hitDamage = amount => Math.min(7, amount * 14 + 1.5) / WRECK_TOUGHNESS
function hurtPlayer(g, side, amount) {
  g.damage = Math.min(100, (g.damage || 0) + hitDamage(amount)); hurt(g, side, amount)
  // Too many hits: the engine catches fire and the car is finished.
  if (g.damage >= 100 && !g.wrecked) { g.wrecked = true; g.wreckedAt = g.time; g.score -= 150; g.message = 'YOUR MOTOR DON CATCH FIRE! WRECKED · -150 REP'; emit(g, { type: 'wrecked' }) }
}

export function resolveContact(g, v, previousZ) {
  const gap = (vehicleLength(g) + vehicleLength(v)) / 2, dz = g.z - v.z, old = previousZ - (v.previousZ ?? v.z), side = lateralGap(g, v)
  const state = g.contacts[v.id] ||= { armed: true, count: 0 }
  if (Math.abs(dz) > gap + 2 || Math.abs(g.x - v.x) * ROAD_SCALE > side + 1.4) state.armed = true
  if (Math.abs(g.x - v.x) * ROAD_SCALE >= side) return false
  if (Math.abs(dz) >= gap && !(old * dz < 0)) return false
  // Mostly-sideways overlap is a side-swipe, handled by solidVehiclePair/scrape.
  if (!(old * dz < 0) && side - Math.abs(g.x - v.x) * ROAD_SCALE < gap - Math.abs(dz)) return false
  const dir = old === 0 ? (dz <= 0 ? -1 : 1) : Math.sign(old), impact = Math.abs(g.speed - v.speed), before = v.speed, npc = v.id.startsWith('npc')
  if (npc && dir > 0 && v.speed >= g.speed && (isRaging(g, v) || (isRacer(g, v.id) && !g.race.done))) return rammed(g, v, gap, impact)
  if (npc && dir < 0 && boosting(g)) { shove(g, v); return false }
  g.z = v.z + dir * (gap + .015)
  if (impact >= 7) {
    // Momentum exchange: shove the other vehicle, bounce the player back off it.
    const ratio = massOf(v) / 1.3
    if (npc) { v.speed = before - dir * impact * .45 * Math.min(1.5, 1 / ratio); if (v.hold < g.time + 60) v.hold = g.time + (isRacer(g, v.id) ? 1.2 : 5) }
    g.speed = before + dir * Math.min(impact * .12 * Math.sqrt(ratio), 14)
    const blow = Math.min(.5, impact / 160)
    hurtPlayer(g, dir < 0 ? 'front' : 'rear', blow * Math.sqrt(ratio)); hurt(v, dir < 0 ? 'rear' : 'front', blow / Math.sqrt(ratio))
    g.impactUntil = g.time + .35; g.shake = Math.min(.6, .15 + impact / 120)
    provoke(g, v, .8); addReckless(g, npc && !isRacer(g, v.id) ? 32 : 8)
    if (v.fixed && g.rush && !g.police && !g.race?.done) { g.heat = 35; g.cpWanted = 2; g.message = 'YOU JAM OLOKPA VAN?! Two stars, dem dey come!' }
    else if (g.police && npc && !v.fixed && !isRacer(g, v.id) && g.time > (g.crashStarAt || 0)) { g.crashStarAt = g.time + 4; raiseWanted(g, (g.wanted || 1) + 1) }
    emit(g, { type: 'crash', id: v.id, kind: kindOf(v), model: v.model, impact, x: (g.x + v.x) / 2, z: g.z - dir * vehicleLength(g) / 2 })
  } else g.speed = dir < 0 ? Math.min(g.speed, Math.max(0, before)) : Math.max(g.speed, Math.min(0, before))
  if (!state.armed || impact < 7) return false
  state.armed = false; state.count++; g.shake = .22; g.score += 25
  return true
}

// Every simulated vehicle has a solid body. Resolve swept longitudinal contacts
// and side penetrations, preserving the pre-contact order at high speeds.
export function solidVehiclePair(a, b) {
  const dx = (a.x - b.x) * ROAD_SCALE, dz = a.z - b.z, gap = (vehicleLength(a) + vehicleLength(b)) / 2, side = lateralGap(a, b)
  const oldZ = (a.previousZ ?? a.z) - (b.previousZ ?? b.z)
  const crossed = oldZ * dz < 0 && Math.abs(dx) < side
  if (Math.abs(dx) >= side || (!crossed && Math.abs(dz) >= gap)) return false
  if (!crossed && side - Math.abs(dx) < gap - Math.abs(dz)) {
    const shift = (side - Math.abs(dx) + .01) / ROAD_SCALE / 2, dir = Math.sign(dx) || 1
    a.x += dir * shift; b.x -= dir * shift
    return 'side'
  }
  const dir = Math.sign(oldZ) || Math.sign(dz) || 1
  const shift = (gap - dir * dz + .02) / 2
  a.z += dir * shift; b.z -= dir * shift
  const speed = Math.min(Math.max(0, a.speed), Math.max(0, b.speed))
  a.speed = speed; b.speed = speed
  return 'end'
}

// Nearest vehicle ahead of v whose body overlaps lane position x.
function leader(bodies, v, x) {
  let best = null
  for (const o of bodies) {
    if (o === v || Math.abs(o.x - x) * ROAD_SCALE >= lateralGap(v, o) + .25) continue
    const gap = o.z - v.z - (vehicleLength(v) + vehicleLength(o)) / 2
    if (o.z > v.z && (!best || gap < best.gap)) best = { v: o, gap }
  }
  return best
}
function laneClear(bodies, v, x) {
  return bodies.every(o => o === v || Math.abs(o.x - x) * ROAD_SCALE >= lateralGap(v, o) + .25 || o.z < v.z - vehicleLength(o) - 7 || o.z > v.z + vehicleLength(v) + 9)
}

export const isRacer = (g, id) => !!g.race && (g.race.rival === id || g.race.rivals?.includes(id))
const nearestLane = x => LANES.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a)
export const isRaging = (g, v) => !!v.rage && g.time < v.rage.until

// Lagos go-slow: in some 1.4 km blocks a 400 m stretch is jammed solid.
const JAM_BLOCK = 1400, JAM_START = 500, JAM_LEN = 400
export function jamAt(z, street = 0) {
  const k = Math.floor(z / JAM_BLOCK), o = z - k * JAM_BLOCK
  return noise(k * 7.31 + street * 5.9 + 3) > .4 && o > JAM_START && o < JAM_START + JAM_LEN
}
function nextJam(z, within, street = 0) {
  for (let k = Math.floor(z / JAM_BLOCK); k * JAM_BLOCK < z + within; k++) { const start = k * JAM_BLOCK + JAM_START; if (start + JAM_LEN > z && noise(k * 7.31 + street * 5.9 + 3) > .4) return { k, start: Math.max(start, z), end: start + JAM_LEN } }
  return null
}

// The city is a grid of dual carriageways crossing every 200 m. You drive on one road at a time: z is the
// distance along it (measured from the city's grid origin, so every junction sits at a multiple of 200) and
// x your lane. The road's median runs 11 m to your left; the cross street at each junction is a real road
// you can turn into, left or right, and keep driving.
export const BLOCK = 200, AXIS = 11, CORRIDOR = 26.6, TURN_SPEED = 110
export const JUNCTION_GAP = BLOCK
export const rightOf = d => ({ e: d.n, n: -d.e })
// Every road line has an id: north-south roads are even, east-west roads odd.
export const streetOf = road => road.de === 0 ? 2 * Math.round(road.oe / BLOCK) : 2 * Math.round(road.on / BLOCK) + 1
// Potholes and go-slows belong to one carriageway of one street.
const laneKey = g => { const r = g.road || START_ROAD; return streetOf(r) * 2 + ((r.de || r.dn) < 0 ? 1 : 0) }
export const START_ROAD = { oe: 0, on: 0, de: 0, dn: 1 }
// World position (east, north) of a point on the current road.
export function worldAt(road, z, x = 0) { const r = rightOf({ e: road.de, n: road.dn }), u = AXIS + x * ROAD_SCALE; return { e: road.oe + road.de * z + r.e * u, n: road.on + road.dn * z + r.n * u } }
// [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
// export function junctionAt(k, road = START_ROAD) {
  // const J = worldAt(road, k * BLOCK, -AXIS / ROAD_SCALE)   // where this road's median meets the cross street's
  // return { k, z: k * BLOCK, cross: road.de === 0 ? 2 * Math.round(J.n / BLOCK) + 1 : 2 * Math.round(J.e / BLOCK) }
// }
// export const nextJunction = g => junctionAt(Math.ceil((g.z - 20) / BLOCK), g.road || START_ROAD)
// export const turnTarget = j => j.cross

// Rain-filled potholes: roughly every other 180 m stretch has one, never inside a junction.
const HOLE_BLOCK = 180
export function potholeAt(k, street = 0) {
  const n = k + street * 977
  if (noise(n * 3.17 + 11) < .38) return null
  const z = k * HOLE_BLOCK + 30 + noise(n * 5.3) * 120, m = ((z % BLOCK) + BLOCK) % BLOCK
  if (m < CORRIDOR + 6 || m > BLOCK - CORRIDOR - 6 || Math.abs(z) < 60) return null
  return { k, z, x: LANES[Math.floor(noise(n * 9.1) * 3)] + (noise(n * 2.2) - .5) * .25, r: 1.5 + noise(n * 4.4) * .8 }
}
export function potholesNear(z, behind, ahead, street = 0) {
  const out = []
  for (let k = Math.floor((z - behind) / HOLE_BLOCK) - 1; k * HOLE_BLOCK < z + ahead; k++) { const h = potholeAt(k, street); if (h && h.z > z - behind && h.z < z + ahead) out.push(h) }
  return out
}
export const holeKey = laneKey
function potholes(g) {
  const key = laneKey(g)
  for (const h of potholesNear(g.z, 12, 12, key)) {
    // Any wheel in the water counts: the drawn puddle is about 1.15 r wide and 1.4 r long.
    if (g.lastHole === `${key}:${h.k}` || Math.abs(g.z - h.z) > h.r * 1.4 + vehicleLength(g) / 2 - .6) continue
    if (Math.abs(g.x - h.x) * ROAD_SCALE > h.r * 1.15 + vehicleWidth(g) / 2 - .2) continue
    const sp = Math.abs(g.speed); if (sp < 4) continue
    g.lastHole = `${key}:${h.k}`
    g.speed *= sp > 90 ? .86 : .93; g.shake = Math.max(g.shake, .2 + Math.min(.3, sp / 400))
    g.steer += (noise(g.time + h.z) - .5) * .9
    hurtPlayer(g, 'front', Math.min(.06, sp / 3000))
    g.message = 'GBOSA! WATER POTHOLE! You no see road?'
    emit(g, { type: 'splash', x: h.x, z: h.z, speed: sp })
  }
}

// Nitro: blue NOS bottles lie in the lanes. Drive through one to pick it up (hold up to three); each
// is one use: a few seconds of full thrust that blasts anything boxing you in out of the way.
export const NOS_TIME = 3.5, NOS_MAX = 3, NOS_BOOST = 60
// About two blocks in three have a bottle, always mid-block (never inside a junction).
const NOS_BLOCK = BLOCK
export function nitroAt(k, key = 0) {
  const n = k * 3 + key * 613
  if (noise(n * 1.71 + 5) < .35) return null
  const z = k * NOS_BLOCK + 45 + noise(n * 2.9) * 110
  if (Math.abs(z) < 80) return null
  return { k, z, x: LANES[Math.floor(noise(n * 4.3) * 3)], id: `${key}:${k}` }
}
export function nitrosNear(z, behind, ahead, key = 0) {
  const out = []
  for (let k = Math.floor((z - behind) / NOS_BLOCK) - 1; k * NOS_BLOCK < z + ahead; k++) { const p = nitroAt(k, key); if (p && p.z > z - behind && p.z < z + ahead) out.push(p) }
  return out
}
export const nitroKey = laneKey
// Beef Gala packs: health. Roughly one every other block, never in the same spot as a Pepsi.
export const GALA_HEAL = 30
export function galaAt(k, key = 0) {
  const n = k * 5 + key * 389 + 17
  if (noise(n * 2.31 + 9) < .5) return null
  const z = k * BLOCK + 70 + noise(n * 3.7) * 60
  if (Math.abs(z) < 80) return null
  return { k, z, x: LANES[Math.floor(noise(n * 6.1) * 3)], id: `g${key}:${k}` }
}
export function galasNear(z, behind, ahead, key = 0) {
  const out = []
  for (let k = Math.floor((z - behind) / BLOCK) - 1; k * BLOCK < z + ahead; k++) { const p = galaAt(k, key); if (p && p.z > z - behind && p.z < z + ahead) out.push(p) }
  return out
}
function galaPickups(g) {
  g.galaTaken ||= {}
  for (const p of galasNear(g.z, 6, 6, laneKey(g))) {
    if (g.galaTaken[p.id] || Math.abs(g.z - p.z) > vehicleLength(g) / 2 + .6 || Math.abs(g.x - p.x) * ROAD_SCALE > vehicleWidth(g) / 2 + .7) continue
    g.galaTaken[p.id] = true
    const healed = Math.min(g.damage || 0, GALA_HEAL); g.damage = (g.damage || 0) - healed
    for (const side in g.dmg) g.dmg[side] = Math.max(0, g.dmg[side] - .3)
    g.message = healed ? `BEEF GALA! +${Math.round(healed)} HEALTH · Motor don repair small` : 'BEEF GALA! Motor already sound, chop am anyway'
    emit(g, { type: 'gala', healed })
  }
}
export const boosting = g => g.time < (g.boostUntil || 0)
function nitroPickups(g) {
  g.nitroTaken ||= {}
  for (const p of nitrosNear(g.z, 6, 6, laneKey(g))) {
    if (g.nitroTaken[p.id] || Math.abs(g.z - p.z) > vehicleLength(g) / 2 + .6 || Math.abs(g.x - p.x) * ROAD_SCALE > vehicleWidth(g) / 2 + .7) continue
    if ((g.nitro || 0) >= NOS_MAX) { if (g.nitroFull !== p.id) { g.nitroFull = p.id; g.message = 'YOU DON CARRY 3 PEPSI ALREADY! Drink one first.' } continue }
    g.nitroTaken[p.id] = true; g.nitro = (g.nitro || 0) + 1; g.score += 10
    g.message = `PEPSI COLLECTED! ×${g.nitro} · Press N or tap PEPSI to blast`
    emit(g, { type: 'nitroPickup', count: g.nitro })
  }
}
// Push a vehicle out of your way, into whichever side has room.
function shove(g, v, report = true) {
  let away = v.x >= g.x ? 1 : -1
  if (Math.abs(v.x + away * .6) > 1.05) away = -away
  v.x = clamp(v.x + away * .6, -1.05, 1.05); v.tx = v.x; v.previousX = v.x; if (v.targetX !== undefined) { v.targetX = v.x; v.decision = g.time + 2 }
  if (v.z > g.z) v.speed = Math.max(0, Math.min(v.speed, g.speed * .5))
  if (v.id.startsWith('npc') && v.hold < g.time + 60) v.hold = g.time + 1.5
  hurt(v, v.z > g.z ? 'rear' : 'front', .08); g.shake = Math.max(g.shake, .25)
  if (report) { g.speed *= .97; emit(g, { type: 'crash', nitro: true, id: v.id, kind: kindOf(v), model: v.model, impact: 40, x: (g.x + v.x) / 2, z: g.z + vehicleLength(g) / 2 }) }
}
function fireNitro(g) {
  g.nitro--; g.boostUntil = g.time + NOS_TIME; g.arrestMeter = 0; g.shake = .35
  let cleared = 0
  for (const v of [...g.traffic, ...policeUnits(g)]) {
    const dz = v.z - g.z, dx = (v.x - g.x) * ROAD_SCALE
    if (dz > -9 && dz < 16 && Math.abs(dx) < 4.6) { shove(g, v, false); cleared++ }
  }
  g.message = cleared ? `PEPSI POWER!! BLASTED ${cleared} OUT THE WAY!` : 'PEPSI POWER!!'
  emit(g, { type: 'nitro', cleared })
}

// [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
// // Turning: steer towards the cross street as you reach the junction and the car drives a quarter circle
// // into its near lane (right turns hug the corner; left turns go into the junction and sweep across the
// // far carriageway), straightens up, and that street becomes the road you are on.
// const LANE_OFF = AXIS + LANES[2] * ROAD_SCALE   // the right-hand lane of the road you turn into
// function junctions(g) {
  // if (g.turning) return
  // const j = junctionAt(Math.round(g.z / BLOCK), g.road || START_ROAD), key = `${streetOf(g.road || START_ROAD)}:${j.k}`
  // if (g.turnedAt === key) return
  // const X0 = g.x * ROAD_SCALE, u0 = AXIS + X0
  // for (const side of ['right', 'left']) {
    // const sign = side === 'right' ? 1 : -1
    // if (g.x * sign < .2 || g.steer * sign < .35) continue
    // const R = j.z - sign * LANE_OFF - g.z, [lo, hi] = side === 'right' ? [6, 16] : [u0 + 18, u0 + 32]
    // if (R < lo || R > hi) continue
    // if (Math.abs(g.speed) > TURN_SPEED) { if (g.tooFast !== key) { g.tooFast = key; g.message = 'TOO FAST TO TURN! Slow down under 110 for the corner.' } return }
    // // Who is close enough to follow you round is settled as you commit to the corner.
    // const near = (v, reach) => { const d = g.z - v.z; return d > -12 && d < reach }
    // g.turning = { side, j, R, x0: X0, z0: g.z, s: 0, st: 0, psi: 0, px: X0, pz: 0, chasers: g.traffic.filter(v => isRaging(g, v) && near(v, 40)).map(v => v.id), cops: policeUnits(g).filter(u => u.phase === 'pursuit' && near(u, 60)).map(u => u.id), gaps: Object.fromEntries([...g.traffic, ...policeUnits(g)].map(v => [v.id, g.z - v.z])) }
    // g.turnedAt = key
    // emit(g, { type: 'turnStart', side })
    // return
  // }
// }
// function driveTurn(g, dt) {
  // const t = g.turning, sign = t.side === 'right' ? 1 : -1, arc = Math.PI / 2 * t.R
  // // You keep rolling through the corner, scrubbing down to a sensible cornering speed (tyres squeal if you come in hot).
  // const inArc = t.s < arc, hot = inArc && g.speed > 62
  // g.speed = clamp(hot ? approach(g.speed, 55, 75 * dt) : g.speed, 12, inArc ? TURN_SPEED : 999)
  // g.skid = hot ? .8 : 0
  // t.s += g.speed / 3.6 * dt
  // if (t.s < arc) { const th = t.s / t.R; t.psi = sign * th; t.px = t.x0 + sign * t.R * (1 - Math.cos(th)); t.pz = t.R * Math.sin(th) }
  // else {
    // t.st = t.s - arc; t.psi = sign * Math.PI / 2; t.px = t.x0 + sign * (t.R + t.st); t.pz = t.R
    // if (t.st > 8) { g.turning = null; takeTurn(g, t) }
  // }
// }
// // The corner is done: the cross street becomes your road. Whoever was right on your bumper turns with
// // you; everyone else loses you. The new street has its own traffic.
// function takeTurn(g, plan) {
  // const { side } = plan, road = g.road || START_ROAD, D = { e: road.de, n: road.dn }, R = rightOf(D), sg = side === 'right' ? 1 : -1
  // const D2 = { e: R.e * sg, n: R.n * sg }, J = worldAt(road, plan.j.z, -AXIS / ROAD_SCALE)
  // // Where the arc and the short straight left the car, in the world.
  // const a = plan.z0 + plan.R, b = AXIS + plan.x0 + sg * plan.R
  // const P = { e: road.oe + D.e * a + R.e * b + D2.e * plan.st, n: road.on + D.n * a + R.n * b + D2.n * plan.st }
  // const next = { oe: D2.e === 0 ? J.e : 0, on: D2.e === 0 ? 0 : J.n, de: D2.e, dn: D2.n }, R2 = rightOf(D2)
  // const newZ = (P.e - next.oe) * D2.e + (P.n - next.on) * D2.n, newX = ((P.e - next.oe) * R2.e + (P.n - next.on) * R2.n - AXIS) / ROAD_SCALE
  // g.road = next; g.street = streetOf(next); g.turnedAt = `${g.street}:${Math.round(newZ / BLOCK)}`
  // g.turn = { side, at: g.time }; g.turns = (g.turns || 0) + 1
  // g.x = clamp(newX, -1.08, 1.08); g.steer = 0
  // const gap = v => plan.gaps[v.id] ?? 999, close = (v, reach) => (reach === 60 ? plan.cops : plan.chasers).includes(v.id)
  // let shook = 0
  // for (const v of g.traffic) if (isRaging(g, v) && !close(v, 40)) { endRage(g, v, true); shook++ }
  // if (g.race) {
    // for (const id of g.race.rivals || []) { const v = g.traffic.find(o => o.id === id); if (v) { const [lo, hi] = KINDS[kindOf(v)].cruise; v.cruise = (lo + hi) / 2 } }
    // g.race = null
  // }
  // let lostPolice = false, bonus = 0
  // if (g.police) {
    // const kept = policeUnits(g).filter(u => u.phase === 'pursuit' && close(u, 60))
    // if (!kept.length) { lostPolice = true; bonus = 50 + 100 * g.wanted; g.score += bonus; g.police = null; g.backup = []; g.heat = 0; g.wanted = 0; g.arrestMeter = 0; g.escape = 0 }
    // else {
      // kept.forEach((u, i) => { u.id = i ? `police${i + 1}` : 'police'; u.role = ROLES[i]; u.x = clamp(g.x + (i % 2 ? .3 : -.3), -.85, .85); u.z = newZ - clamp(gap(u), 15, 60) - i * 8; u.previousZ = u.z })
      // g.police = kept[0]; g.backup = kept.slice(1); g.wanted = kept.length; g.police.started = g.time
    // }
  // }
  // const keep = new Set(g.traffic.filter(v => isRaging(g, v) && close(v, 40)).map(v => v.id))
  // for (const v of g.traffic) if (keep.has(v.id)) { v.z = newZ - clamp(gap(v), 12, 40); v.previousZ = v.z; v.speed = Math.max(v.speed, g.speed) }
  // g.z = g.previousZ = newZ
  // const others = g.traffic.filter(v => !keep.has(v.id))
  // others.forEach((v, i) => {
    // const seed = g.time * 17 + i * 3.7 + g.street, kind = SPAWN[Math.floor(noise(seed) * SPAWN.length)]
    // let z = g.z - 90 + (i + noise(seed + 2) * .6) * (720 / others.length)
    // if (Math.abs(z - g.z) < 22) z = g.z + 30 + noise(seed + 4) * 20
    // const nv = makeVehicle(v.id, kind, seed, z)
    // if (z < g.z) nv.cruise = Math.max(nv.cruise, g.speed + 15)
    // Object.assign(v, nv, { previousZ: z, previousX: nv.x, rage: null, stopUntil: 0, hits: 0, attackAt: 0, attackUntil: 0, ramUntil: 0 }); g.contacts[v.id] = { armed: true, count: 0 }
  // })
  // for (const v of g.traffic) if (keep.has(v.id)) { v.x = v.tx = clamp(g.x + (noise(v.z) > .5 ? .3 : -.3), -.86, .86); v.previousX = v.x }
  // g.score += 15 + shook * 10
  // g.message = lostPolice ? `OLOKPA LOST YOU AT THE CORNER! +${bonus} REP` : shook ? `YOU SHOOK THEM OFF! Dem miss the turn.` : keep.size ? 'THEY FOLLOWED YOU! Find another corner!' : side === 'right' ? 'TURNED RIGHT' : 'TURNED LEFT'
  // emit(g, { type: 'turn', side, street: g.street, shook, followed: keep.size, lostPolice })
// }

// A rival rear-ends you on purpose: a shunt that throws you sideways and costs you,
// and it never counts as your bump. Enough of the commotion brings olokpa.
function rammed(g, v, gap, impact) {
  g.z = v.z + gap + .015
  if (g.time < (v.rammedUntil || 0) || impact < 4) { v.speed = Math.min(v.speed, g.speed); return false }
  v.rammedUntil = g.time + .8; v.hits = (v.hits || 0) + 1
  const kick = Math.min(impact, 45)
  g.speed += kick * .25; v.speed = g.speed - 6 - kick * .35
  g.steer += (noise(g.time * 7 + v.z) > .5 ? 1 : -1) * (.5 + kick / 60)
  // Over a long Naija Rush a rival's ram does half the damage, so you can finish the race.
  hurtPlayer(g, 'rear', Math.min(.25, .05 + impact / 250) * (g.rush ? .5 : 1)); hurt(v, 'front', .07)
  g.impactUntil = g.time + .35; g.shake = Math.min(.6, .22 + impact / 100)
  v.attackUntil = 0; v.attackAt = g.time + .7   // drop back, line up, go again
  g.message = v.hits > 1 ? `RAMMED AGAIN! ${v.hits} HITS · This one wan finish you!` : 'DEM DON RAM YOU FROM BACK!'
  emit(g, { type: 'crash', rammed: true, id: v.id, kind: kindOf(v), model: v.model, impact, x: (g.x + v.x) / 2, z: g.z - vehicleLength(g) / 2 })
  // Olokpa only comes for you over a fight you're part of: a driver who attacked you unprovoked doesn't bring
  // the police down on you (hit them back twice, though, and the usual double-bump rule kicks in).
  // In a Naija Rush being rammed is not your recklessness, so it never brings olokpa by itself.
  if (!g.rush && !g.police && v.hits >= 2 && !v.rage?.unprovoked) { g.heat = 35; g.message = 'OLOKPA DON SEE THE WAHALA! Dem dey come!' }
  else if (v.rage?.unprovoked && v.hits >= 2) g.message = `RAMMED ${v.hits} TIMES · Dis one no get sense! Outrun am or hit back`
  return false
}

// A road-rage duel ends: outlast or outrun them to win their car's value; get pinned and you pay.
function endRage(g, v, won) {
  v.rage = null; v.tx = nearestLane(v.x)
  if (won === null) return
  const { value, make, name } = vehicleInfo(v)
  g.score += won ? value : -Math.round(value / 2)
  g.message = won ? `ROAD RAGE WON vs ${make} ${name}! +${value} REP` : `ROAD RAGE LOST · PAY FOR THE BUMPER · -${Math.round(value / 2)} REP`
  emit(g, { type: won ? 'rageWon' : 'rageLost', id: v.id, kind: kindOf(v), model: v.model, value })
}

// Somebody you hit wants payback: danfos always, taxis usually, big men always, others sometimes.
function provoke(g, v, chance) {
  if (!v.id.startsWith('npc') || v.fixed || isRacer(g, v.id) || ['okada', 'keke', 'brt'].includes(kindOf(v))) return
  const luxury = kindOf(v) === 'car' && [1, 3, 6, 7].includes(v.model)
  if (isRaging(g, v) || noise(g.time * 3 + v.z) > (kindOf(v) === 'danfo' || luxury ? 1 : chance)) return
  v.rage = { until: g.time + 45, honkAt: 0, checkAt: 0 }
  // Parked vehicles stay parked; moving ones shake off the crash quickly and come after you.
  if (v.hold < g.time + 60) v.hold = Math.min(v.hold, g.time + 1.5)
  emit(g, { type: 'rage', id: v.id, kind: kindOf(v), model: v.model })
}

// A reckless driver near you decides you're in their way and comes for you: no bump needed.
// One fight at a time, every 20-40 seconds or so; the road-rage driving below does the rest
// (ramming your bumper, leaning on your side, cutting in front and brake-checking).
const FIGHTERS = ['danfo', 'taxi', 'car'], UNPROVOKED_FIGHTS = false
function pickFight(g, v) {
  v.rage = { until: g.time + 40, honkAt: 0, checkAt: g.time + 1.5, unprovoked: true }
  v.attackAt = g.time; v.ramUntil = 0; v.laneTimer = 0; v.hold = 0
  // Ahead of you: swerve into your lane and stand on the brakes. Behind or beside: come straight at you.
  if (v.z > g.z) v.rage.brakeUntil = g.time + 1.4
  g.nextFight = g.time + (g.rush ? 10 + noise(g.time * 1.3) * 10 : 15 + noise(g.time * 1.3) * 15)
  g.message = `${kindOf(v) === 'danfo' ? 'DANFO' : kindOf(v) === 'taxi' ? 'TAXI' : 'DRIVER'} DEY COME FOR YOU! You no even touch am!`
  emit(g, { type: 'fight', id: v.id, kind: kindOf(v), model: v.model, z: v.z })
}
function driveTraffic(g, dt) {
  const units = policeUnits(g), bodies = [...g.traffic, g, ...units]
  const sirens = units.filter(u => u.phase === 'pursuit'), chase = g.police?.phase === 'pursuit'
  for (const v of g.traffic) {
    v.previousZ = v.z; v.previousX = v.x
    if (v.fixed) { v.speed = 0; continue }   // checkpoint van, parked
    const lastSpeed = v.speed, kind = kindOf(v), danfo = kind === 'danfo'
    // A vehicle stopped by a crash skids to a halt with its hazards on.
    if (g.time <= v.hold) { v.speed = approach(v.speed, 0, 40 * dt); v.z += v.speed / 3.6 * dt; v.skid = Math.abs(v.speed) > 25 ? 1 : 0; continue }
    const racing = isRacer(g, v.id) && !g.race.finished?.includes(v.id), raging = !racing && isRaging(g, v)
    // Waiting on the grid for the lights.
    if (racing && g.time < g.race.go) { v.speed = 0; continue }
    // Who fights you: the driver you hit, and in a Naija Rush every rival (otherwise only the one who challenged you).
    const fighter = raging || (racing && !g.race.done && (g.race.grid || v.id === g.race.rival))
    if (v.rage && !raging && !racing) endRage(g, v, true)   // they ran out of steam: you win
    const ahead = leader(bodies, v, v.x), lead = g.z - v.z, jammed = !racing && !raging && !g.rush && jamAt(v.z, laneKey(g))
    const reckless = v.reckless && !racing && !raging
    // Only the driver you hit comes after you; reckless drivers just drive badly (set true to bring back unprovoked fights).
    const fightsOn = UNPROVOKED_FIGHTS ? !g.race : g.rush && g.race.launched && !g.race.done
    if (fightsOn && reckless && FIGHTERS.includes(kind) && !jammed && !g.turning && g.time > (g.nextFight ?? 8) && Math.abs(lead) < 45 && Math.abs(g.speed) > 15
      && g.traffic.filter(o => isRaging(g, o)).length < 2 && noise(g.time * .7 + v.z) < dt * 1.5) { pickFight(g, v); continue }
    let target = v.cruise * (1 - (g.rain || 0) * .12)   // everyone eases off in the rain
    // Racers rubber-band hard: they never let you cruise off, and punish mistakes.
    // In a Naija Rush everyone runs their own pace with only a gentle pull towards you: fall behind and they are gone.
    if (racing) target = v.cruise * (v.skill || 1) + (g.rush ? clamp(lead * .4, -6, 30) : clamp(lead * .7, -35, 75))
    // Road rage: chase you down, sit on your bumper, brake-check you once in front.
    else if (raging) {
      target = clamp(g.speed + clamp(lead * .8, -25, 70), 0, KINDS[kind].cruise[1] * 2.3)
      if (g.time < v.rage.brakeUntil) target = Math.max(0, g.speed - 35)
      if (lead > 300) { endRage(g, v, true); continue }   // you got away
      if (lead < -260) { endRage(g, v, null); continue }
      // With olokpa coming they won't let it go: they keep you boxed in until the arrest.
      if (chase) v.rage.until = Math.max(v.rage.until, g.time + 6)
      // They pin you: stopped with the angry driver right on you means you lose.
      else if (Math.abs(lead) < 9 && Math.abs(g.speed) < 8) { v.rage.pin = (v.rage.pin || 0) + dt; if (v.rage.pin > 2.5) { endRage(g, v, false); continue } } else v.rage.pin = 0
    }
    // Chaos brake-check: stands on the brakes for no reason.
    if (g.time < (v.brakeUntil || 0)) target = Math.min(target, 4)
    // Checkpoint ahead: everyone but the racers slows right down and filters through the middle lane.
    if (!racing && g.race?.checkpoints) for (const cp of g.race.checkpoints) { const d = cp.z - v.z; if (d > -6 && d < 70) target = Math.min(target, 32) }
    // Go-slow: creep in stop-and-go waves.
    else if (jammed) target = Math.min(target, (5 + noise(v.z * .01 + kind.length) * 18) * (Math.sin(g.time * .45 + v.z * .06) > -.2 ? 1 : .15))
    // Danfo pickup: pull up at the kerb, load passengers, then barge back out.
    if (danfo && !racing && !raging && g.time < (v.stopUntil || 0)) target = 0
    const safe = racing ? 2.5 + v.speed / 10 : raging || reckless ? 2 + v.speed / 12 : danfo ? 3 + v.speed / 6 : 5 + v.speed / 4
    if (ahead && ahead.gap < safe) target = Math.min(target, Math.max(0, ahead.v.speed - (ahead.gap < safe * .5 ? 20 : 5)))
    if (g.time >= (v.laneTimer || 0)) {
      v.laneTimer = g.time + (racing || raging ? .3 : reckless ? .3 + noise(g.time + v.z) * .5 : danfo ? .5 + noise(g.time + v.z) * .6 : .8 + noise(g.time + v.z) * 1.4)
      let move = ahead && (racing || reckless ? ahead.gap < 22 + v.speed / 3 : ahead.gap < 14 + v.speed / 4 && (ahead.v.speed < v.cruise - 8 || danfo))
      const side = Math.abs(g.x - v.x)
      // Reckless drivers weave for no reason, and cut in sharp right in front of you.
      if (reckless && !jammed && noise(g.time * 2.1 + v.z) < .2) move = true
      if ((UNPROVOKED_FIGHTS || g.rush) && reckless && lead < -4 && lead > -25 && side > .3 && side < .85 && g.time > (v.cutAt || 0) && laneClear(bodies.filter(o => o !== g), v, nearestLane(g.x))) {
        v.tx = nearestLane(g.x); v.cutAt = g.time + 9; move = false
        emit(g, { type: 'cutIn', id: v.id, kind, model: v.model, z: v.z, x: v.x })
      }
      // Only the car you hit (the angry driver, or the rival who challenged you) blocks and rams you; other racers just race.
      if (fighter) {
        const droppingBack = raging && v.rage.unprovoked && g.time > (v.rage.brakeUntil || 0) && !chase
        if (!droppingBack && lead > -32 && lead < -3 && side < .75 && side > .1 && laneClear(bodies.filter(o => o !== g), v, nearestLane(g.x))) {
          // You're right behind: slam the door in your lane.
          v.tx = nearestLane(g.x); move = false
          if (raging && g.time > v.rage.checkAt && lead > -20) { v.rage.brakeUntil = g.time + 1; v.rage.checkAt = g.time + 7 }
        } else if (Math.abs(lead) < 4.5 && side < .8 && g.time > (v.ramUntil || 0) && Math.abs(g.speed) > (raging ? 20 : 40)) {
          // Side by side: lean on you to shove you off line.
          v.tx = g.x; v.ramUntil = g.time + (raging ? 1.2 : 2.2) + noise(v.z) * 1.2; move = false
        } else if (raging && lead > 4 && lead < 40 && side > .3) { v.tx = nearestLane(g.x); move = false }   // get on your tail
        else if (v.ramUntil && g.time > v.ramUntil - 1.6 && Math.abs((v.tx ?? v.x) - nearestLane(v.tx ?? v.x)) > .05) v.tx = nearestLane(v.x)
      }
      // Danfo stops for passengers now and then.
      if (danfo && !racing && !raging && !jammed && g.time > (v.pickupAt ?? (v.pickupAt = g.time + 10 + noise(v.z) * 30))) {
        v.pickupAt = g.time + 25 + noise(v.z + 1) * 40
        if (laneClear(bodies, v, .55)) { v.tx = .55; v.stopUntil = g.time + 4 + noise(v.z + 2) * 4; emit(g, { type: 'pickup', id: v.id, kind }) }
      }
      if (danfo && g.time < (v.stopUntil || 0)) move = false
      // Make way for olokpa, or for a driver leaning on the horn.
      if (!racing && !raging) for (const p of sirens) { const d = v.z - p.z; if (d > 0 && d < 45 && Math.abs(p.x - v.x) < .4) move = true }
      if (!racing && !raging && g.hornUntil > g.time) { const d = v.z - g.z; if (d > 0 && d < 30 && Math.abs(g.x - v.x) < .4) move = true }
      if (move) {
        // Danfos in a go-slow happily take the shoulder.
        const lanes = danfo && jammed ? [...LANES, -.86, .86] : lanesFor(kind)
        const options = lanes.filter(x => Math.abs(x - v.x) > .1).sort((p, q) => Math.abs(p - v.x) - Math.abs(q - v.x))
        const free = options.find(x => laneClear(bodies, v, x))
        if (free !== undefined) v.tx = free
        // Stuck behind someone slow: lean on the horn, and maybe say something.
        else if (ahead && ahead.gap < 12 && (danfo || kind === 'taxi' || raging) && g.time > (v.honkAt || 0)) {
          v.honkAt = g.time + 3 + noise(v.z) * 3
          emit(g, { type: 'npcHonk', id: v.id, kind, at: ahead.v.id, atKind: ahead.v === g ? 'player' : kindOf(ahead.v), z: v.z, x: v.x })
        }
      }
      if (raging && g.time > v.rage.honkAt && Math.abs(lead) < 60) { v.rage.honkAt = g.time + 2.5; emit(g, { type: 'rageHonk', id: v.id, kind, model: v.model, z: v.z, x: v.x }) }
    }
    // Rivals fight dirty: line up behind you and ram your bumper again and again, and once
    // olokpa is on you, get in front and stand on the brakes to hold you for the arrest.
    let attacking = false
    if (fighter) {
      // Naija Rush rivals mostly race: one at a time, every so often, a rival right behind you goes for your bumper.
      const rushRival = g.rush && racing
      if (rushRival) { if (lead > 1 && lead < 25 && Math.abs(g.speed) > 40 && g.time > (v.attackAt || 0) && g.time > (g.nextAttack || 0)) { v.attackUntil = g.time + 2.5; v.attackAt = g.time + 12 + noise(v.z + g.time) * 8; g.nextAttack = g.time + 7 + noise(g.time) * 6 } }
      else if (lead > 1 && lead < 60 && Math.abs(g.speed) > 5 && g.time > (v.attackAt || 0)) { v.attackUntil = g.time + 3; v.attackAt = g.time + (raging ? 1.8 : 3.2) + noise(v.z + g.time) * 1.5 }
      if (lead > 0 && g.time < (v.attackUntil || 0)) { attacking = true; v.tx = clamp(g.x, -1, 1); target = Math.max(target, g.speed + 40) }
      // An unprovoked attacker who ends up in front, once the brake-check is done, gets out of your lane and lets
      // you by, then comes at you from behind.
      else if (raging && v.rage.unprovoked && lead < -4 && !chase && g.time > (v.rage.brakeUntil || 0)) {
        target = Math.max(0, Math.min(target, Math.abs(g.speed) - 18))
        if (Math.abs(v.x - g.x) < .35) { const out = lanesFor(kind).filter(x => Math.abs(x - g.x) > .35).sort((p, q) => Math.abs(p - v.x) - Math.abs(q - v.x)).find(x => laneClear(bodies.filter(o => o !== g), v, x)); if (out !== undefined) v.tx = out }
      }
      // Holding you for olokpa: angry drivers always; rivals too, except in a Naija Rush, where they just race.
      else if (chase && lead < -1 && lead > -60 && !rushRival) {
        const lined = Math.abs(g.x - v.x) < .3
        if (lined && g.time > (v.blockSaidAt || 0)) { v.blockSaidAt = g.time + 9; emit(g, { type: 'blocking', id: v.id, kind, model: v.model, z: v.z }) }
        // Angry drivers brake-check you to a stop (in a Naija Rush they just squeeze you, so olokpa can close in);
        // racers sit in your line and hold you up.
        v.tx = clamp(g.x, -.86, .86)
        target = !lined ? Math.max(0, g.speed + 4) : raging && g.rush ? Math.max(0, g.speed - 15) : raging || Math.abs(g.speed) < 40 ? Math.max(0, Math.min(g.speed - 30, 25)) : g.speed - 8
      }
    }
    v.x = approach(v.x, v.tx ?? v.x, dt * (attacking ? 1.1 : racing || raging || reckless ? .75 : danfo ? .5 : .38))
    const pull = racing && g.rush ? accelAt(Math.min(g.accel || 30, RIVAL_ACCEL) * 1.05, v.speed, Math.max(60, v.cruise * (v.skill || 1))) : racing || raging ? 34 : reckless ? 26 : danfo ? 20 : 14
    v.speed = approach(v.speed, target, (target < v.speed ? 70 : attacking ? 80 : pull) * dt)
    v.z += v.speed / 3.6 * dt
    v.skid = (lastSpeed - v.speed) / dt > 65 && v.speed > 30 ? 1 : 0
  }
}

// Naija Rush chaos: every 5-11 seconds something kicks off 50-260 m ahead of you. A reckless driver dives into the next
// lane without looking, someone slams the brakes for no reason, or a tyre bursts and the vehicle skids to a stop with
// its hazards on. Whatever is behind has to react, and often doesn't: that's how the pile-ups start.
function roadChaos(g) {
  g.nextChaos ??= g.time + 6
  if (g.time < g.nextChaos) return
  g.nextChaos = g.time + 5 + noise(g.time * 3.1) * 6
  const pick = g.traffic.filter(v => !v.fixed && v.rival === undefined && !isRaging(g, v) && g.time > v.hold && v.z - g.z > 50 && v.z - g.z < 260 && v.speed > 25)
  if (!pick.length) return
  const v = pick[Math.floor(noise(g.time * 7.7) * pick.length)], roll = noise(g.time * 5.3), kind = kindOf(v)
  if (roll < .45) {
    const lanes = lanesFor(kind).filter(x => Math.abs(x - v.x) > .2 && Math.abs(x - v.x) < .7)
    if (!lanes.length) return
    v.tx = lanes[Math.floor(noise(g.time * 9.1) * lanes.length)]; v.laneTimer = g.time + 2.5
    emit(g, { type: 'chaos', what: 'swerve', id: v.id, kind, z: v.z })
  } else if (roll < .8) {
    v.brakeUntil = g.time + 1.4
    emit(g, { type: 'chaos', what: 'brake', id: v.id, kind, z: v.z })
  } else {
    v.hold = g.time + 7; v.skid = 1
    g.message = `WAHALA AHEAD! ${kind === 'danfo' ? 'Danfo' : kind === 'okada' ? 'Okada' : 'Motor'} tyre don burst!`
    emit(g, { type: 'chaos', what: 'blowout', id: v.id, kind, z: v.z })
  }
}

function recycleTraffic(g) {
  const bodies = [...g.traffic, g, ...policeUnits(g)]
  const jam = !g.rush && nextJam(g.z + 150, 900, laneKey(g)), pool = g.rush ? RUSH_SPAWN : SPAWN
  for (const v of g.traffic) {
    if (v.fixed || isRacer(g, v.id) || isRaging(g, v)) continue
    const behind = v.z < g.z - 110, farAhead = v.z > g.z + 900
    if (!behind && !farAhead) continue
    const seed = g.time * 13 + v.z, kind = pool[Math.floor(noise(seed) * pool.length)]
    // Pack the next go-slow; otherwise slow players get traffic from behind, fast ones ahead.
    const intoJam = jam && noise(seed + 9) > .25
    const z = intoJam ? jam.start + noise(seed + 1) * (jam.end - jam.start) : farAhead && g.speed < 60 ? g.z - 95 : g.z + 430 + noise(seed + 1) * 260
    const next = makeVehicle(v.id, kind, seed, z, quietestLane(g.traffic.filter(o => o !== v), kind, z, seed), g.rush ? RUSH_RECKLESS : 1)
    if (z < g.z) next.cruise = Math.max(next.cruise, g.speed + 25)
    if (intoJam) next.speed = 10
    if (!laneClear(bodies, next, next.x) || policeUnits(g).some(u => Math.abs(z - u.z) < 25)) continue
    Object.assign(v, next, { previousZ: z, previousX: next.x, rage: null, stopUntil: 0 }); g.contacts[v.id] = { armed: true, count: 0 }
  }
}

// Every police unit on your tail: the lead van (which makes the arrest) plus backup.
export const policeUnits = g => g.police ? [g.police, ...(g.backup || [])] : []
const ROLES = ['lead', 'left', 'right']
function makeUnit(g, slot) {
  return { id: slot ? `police${slot + 1}` : 'police', kind: 'police', role: ROLES[slot], x: clamp(g.x + [.5, -.55, .55][slot], -.85, .85), z: g.z - 40 - slot * 30, speed: Math.max(50, g.speed), phase: 'pursuit', decision: 0, targetX: 0, officer: null, arrest: 0, started: g.time }
}
export function beginPursuit(g) {
  if (g.police) return
  g.police = makeUnit(g, 0); g.backup = []
  g.escape = 0; g.wanted = 1
}
// One police car per star: two stars call one backup van, three stars call two.
export function raiseWanted(g, stars) {
  if (!g.police) return
  const next = clamp(stars, g.wanted || 1, 3)
  if (next > g.wanted) { g.wanted = next; g.message = next === 3 ? 'THREE STARS! ALL UNITS DEY COME!' : 'TWO STARS! BACKUP DON JOIN THE CHASE!'; emit(g, { type: 'wanted', stars: next }) }
  while (g.backup.length + 1 < g.wanted) { const u = makeUnit(g, g.backup.length + 1); g.backup.push(u); emit(g, { type: 'backup', id: u.id }) }
}

function driveUnit(g, p, dt) {
  p.previousZ = p.z; p.previousX = p.x
  if (p.phase !== 'pursuit') { p.speed = approach(p.speed, 0, 90 * dt); p.z += p.speed / 3.6 * dt; return }
  const slow = Math.abs(g.speed) < 25, side = g.x > -.3 ? -1 : 1
  // Lead tails and rams you. Flankers run either side; when you slow, one gets in front to block you.
  const goal = p.role === 'lead' ? { x: slow ? g.x + (g.x < .3 ? .42 : -.42) : g.x, z: slow ? g.z - 6 : g.z }
    : p.role === 'left' ? { x: slow && p.z > g.z + 6 ? g.x : g.x + side * .55, z: slow ? g.z + 9 : g.z + 2 }
      : { x: g.x - side * .5, z: slow ? g.z + 1 : g.z - 4 }
  const distance = goal.z - p.z
  if (g.time >= p.decision) {
    p.decision = g.time + .5
    const target = clamp(goal.x, -.85, .85), lanes = [-.8, -.55, -.28, 0, .28, .55, .8]
    const cost = x => Math.abs(x - target) * 2 + Math.abs(x - p.x) + g.traffic.reduce((n, v) => n + (v.z > p.z - 4 && v.z < p.z + 28 && Math.abs(v.x - x) * ROAD_SCALE < lateralGap(p, v) + .3 ? 8 : 0), 0)
    p.targetX = lanes.reduce((best, x) => cost(x) < cost(best) ? x : best, lanes[0])
  }
  p.x = approach(p.x, p.targetX, dt * .45)
  const cap = 235 + g.wanted * 15 + (distance > 110 ? 40 : 0)
  let targetSpeed = slow ? clamp(distance * 4, -15, 120) : clamp(g.speed + 15 + distance * .6, 50, cap)
  // Backup vans steer around you rather than ramming from behind; only the lead rams.
  const ahead = leader(p.role === 'lead' ? g.traffic : [...g.traffic, g], p, p.x)
  if (ahead && ahead.gap < Math.max(6, p.speed / 3.6 * 1.1)) targetSpeed = Math.min(targetSpeed, Math.max(0, ahead.v.speed - 5))
  p.speed = approach(p.speed, targetSpeed, (targetSpeed < p.speed ? 90 : 40) * dt); p.z += p.speed / 3.6 * dt
}

// A pursuing police van that catches you from behind rams you and bleeds your speed.
function policeRam(g, p) {
  if (p.phase !== 'pursuit' || g.time < g.ramUntil || boosting(g)) return
  const gap = g.z - p.z - (vehicleLength(g) + vehicleLength(p)) / 2
  if (gap < .5 && gap > -1 && Math.abs(g.x - p.x) * ROAD_SCALE < lateralGap(g, p) && p.speed > g.speed + 4) {
    emit(g, { type: 'crash', id: p.id, kind: 'police', impact: p.speed - g.speed, x: (g.x + p.x) / 2, z: g.z - vehicleLength(g) / 2 })
    hurtPlayer(g, 'rear', .08); hurt(p, 'front', .08); g.impactUntil = g.time + .3
    g.speed = Math.max(0, g.speed * .7 - 8); g.shake = .3; g.ramUntil = g.time + 1.1
    g.message = 'OLOKPA DON JAM YOU! Shake them off or pull over.'
  }
}

// Olokpa reaching you is an arrest: while a police unit is within a few metres and you are
// slow, the arrest meter fills; drive away to drain it. Full meter = BUSTED.
export const ARREST_TIME = 1.6
export function updateArrest(g, dt) {
  const p = g.police; if (!p) return
  const units = policeUnits(g), dist = u => Math.hypot((u.x - g.x) * ROAD_SCALE, u.z - g.z)
  // In a Naija Rush you can only be arrested nearly stopped, so slowing for a checkpoint mid-chase isn't an automatic bust.
  const nearest = Math.min(...units.map(dist)), slow = Math.abs(g.speed) < (g.rush ? 25 : 40) && !boosting(g)
  if (nearest < 7.5 && slow) {
    if (!g.arrestMeter) g.message = 'OLOKPA DON REACH YOU! Drive off before dem arrest you!'
    g.arrestMeter = (g.arrestMeter || 0) + dt * (Math.abs(g.speed) < 10 ? 1.4 : 1)
  } else g.arrestMeter = Math.max(0, (g.arrestMeter || 0) - dt * 1.2)
  if (g.arrestMeter >= ARREST_TIME) {
    const cop = units.reduce((a, u) => dist(u) < dist(a) ? u : a, p)
    g.arrested = true; g.speed = 0; g.heat = 0; g.race = null; g.score -= 100
    for (const u of units) u.phase = 'arrested'
    // The officer from the closest van stands at your driver door.
    p.officer = { x: g.x * ROAD_SCALE - 1.45, z: g.z + .4, moving: false, heading: Math.atan2(g.x - cop.x, g.z - cop.z) }
    g.message = 'BUSTED · -100 REP'
    return
  }
  // You escape only when every unit has lost you.
  g.escape = nearest > 170 ? g.escape + dt : 0
  if (g.escape > 6) { g.score += 50 + 100 * g.wanted; g.message = `OLOKPA EVADED! +${50 + 100 * g.wanted} REP`; g.police = null; g.backup = []; g.heat = 0; g.wanted = 0; g.arrestMeter = 0 }
  else g.heat = 35
}

// Six-speed automatic: engine revs follow road speed through the gear ratio, with
// clutch slip pulling away, a short torque cut on each upshift and a rev limiter.
const RATIOS = [0, 112, 70, 48, 35, 26, 19]
export function updateGearbox(g, gas, dt, engine = {}, neutral = false) {
  const idle = engine.idle || 800, redline = engine.redline || 6200, sp = Math.abs(g.speed)
  g.gear ||= 1; g.rpm ||= idle
  g.throttle = approach(g.throttle || 0, gas ? 1 : 0, dt * (neutral ? 10 : 6))
  g.shifted = 0
  // Out of gear (on the grid): the engine spins up fast with no load and bounces off the limiter.
  if (neutral) {
    const target = gas ? redline + 400 : idle
    g.rpm = approach(g.rpm, target, dt * (gas ? 12000 : 6000))
    if (g.rpm >= redline) g.rpm = redline - (Math.floor(g.time * 22) % 2) * 450
    return
  }
  if (g.speed < -1) g.gear = -1
  else if (g.gear === -1) g.gear = 1
  let target
  if (g.gear === -1) target = idle + sp * 120
  else {
    if (sp * RATIOS[g.gear] > (gas ? redline - 350 : 2700) && g.gear < 6) { g.gear++; g.shifted = 1; g.shiftUntil = g.time + .22 }
    else if (g.gear > 1 && sp * RATIOS[g.gear] < (gas ? 2600 : 1500) && sp * RATIOS[g.gear - 1] < redline - 600) { g.gear--; g.shifted = -1 }
    target = idle * .9 + sp * RATIOS[g.gear]
    if (gas && g.gear === 1 && sp < 30) target = Math.max(target, 2600 + sp * 70)
  }
  if (!gas && sp < 2) target = idle
  if (target >= redline) target = redline - (Math.floor(g.time * 18) % 2) * 300
  g.rpm = approach(g.rpm, Math.max(idle, target), dt * (target > g.rpm ? 9000 : 7000))
}

// Acceleration fades as you near top speed: strong off the line, little pull in the top gears. A 190E takes about
// 9 s to 100 km/h and 20 s to get near its top speed; a Challenger about 5 s and 17 s.
export const accelAt = (accel, speed, top) => accel * .55 * Math.max(.1, 1 - Math.pow(Math.max(0, speed) / Math.max(1, top), 1.6))
export const RACE_DISTANCE = 2000
const PRIZES = [500, 200, 75]
// Second bump: the car you hit challenges you, and up to two nearby drivers join in.
export function startRace(g, v, settings, label) {
  const joiners = g.traffic.filter(o => o !== v && ['car', 'taxi', 'danfo'].includes(kindOf(o)) && Math.abs(o.z - g.z) < 140 && o.hold <= g.time)
    .sort((a, b) => Math.abs(a.z - g.z) - Math.abs(b.z - g.z)).slice(0, 2)
  const racers = [v, ...joiners]
  g.race = { end: g.time + 80, finish: g.z + RACE_DISTANCE, start: g.z, rival: v.id, rivals: racers.map(r => r.id), finished: [], label }
  g.heat = 35
  racers.forEach((r, i) => { r.hold = 0; r.cruise = settings.maxSpeed * (kindOf(r) === 'danfo' ? .9 : .97); r.skill = .92 + noise(r.z + i) * .14; r.ramUntil = 0 })
  g.message = `RACE ON! ${racers.length + 1} DRIVERS · FIRST TO THE FINISH · OLOKPA IN PURSUIT`
  emit(g, { type: 'race', id: v.id, kind: kindOf(v) })
  for (const r of joiners) emit(g, { type: 'raceJoin', id: r.id, kind: kindOf(r) })
}
export function racePosition(g, peers = []) {
  const r = g.race; if (!r) return null
  const all = [...g.traffic, ...peers], rivals = (r.rivals || [r.rival]).map(id => all.find(v => v.id === id)).filter(Boolean)
  return { place: 1 + rivals.filter(v => r.finished?.includes(v.id) || v.z > g.z).length, of: rivals.length + 1, rivals }
}
export function stepWorld(g, k, dt, settings, peers = [], onBump = () => {}) {
  if (g.arrested) return
  // A burning wreck: no more control, it rolls to a stop.
  if (g.wrecked) { k = {}; g.speed *= .94; g.boostUntil = 0 }
  g.events ||= []
  g.time += dt; g.shake = Math.max(0, (g.shake || 0) - dt)
  // Naija Rush: held on the grid through the 3-2-1, then the rivals launch flat out. Once you've finished you just coast.
  const race = g.race
  if (race?.grid && !race.launched) {
    g.revving = !!(k.w || k.arrowup); k = {}; g.speed = 0
    const n = Math.ceil(race.go - g.time)
    if (n >= 1 && n <= 3 && n !== race.count) { race.count = n; emit(g, { type: 'countdown', n }) }
    if (g.time >= race.go) {
      race.launched = true
      // Rivals run at your car's pace, up to Challenger pace: a supercar can pull away from them.
      for (const v of g.traffic) if (v.rival !== undefined) v.cruise = Math.min(settings.maxSpeed, RIVAL_TOP_SPEED) * (kindOf(v) === 'danfo' ? .95 : 1)
      // Launch: hold the revs in the sweet spot at GO for a flying start; bounce off the limiter and you spin the wheels.
      const revs = (g.rpm || 0) / (settings.engine?.redline || 6200)
      if (revs > .55 && revs < .9) { g.speed = 30; g.message = 'PERFECT START!'; emit(g, { type: 'perfectStart' }) }
      else if (revs >= .9) { g.speed = 4; g.skid = 1; g.message = 'WHEELSPIN! Too many revs.' }
      else g.message = 'GO! GO! GO!'
      g.revving = false; emit(g, { type: 'raceGo' })
    }
  }
  if (race?.done) k = {}
  g.accel = settings.acceleration
  // Heavy damage costs top speed.
  const maxSpeed = settings.maxSpeed * (1 - (g.damage || 0) / 400)
  const gas = k.w || k.arrowup, reverse = k.s || k.arrowdown, brake = k[' ']
  // Wet roads: longer braking and lazier steering in the rain.
  const wet = 1 - (g.rain || 0) * .22
  const nos = !!(k.n || k.shift)
  if ((k.nTap || (nos && !g.nosHeld)) && (g.nitro || 0) > 0 && !boosting(g) && !g.turning) fireNitro(g)
  g.nosHeld = nos || !!k.nTap
  const boost = boosting(g)
  if (boost && !brake) g.speed = Math.min(maxSpeed + NOS_BOOST, Math.max(g.speed, 0) + Math.max(75, settings.acceleration * 2.5) * dt)
  else if (brake) g.speed = Math.sign(g.speed) * Math.max(0, Math.abs(g.speed) - 85 * wet * dt)
  else if (reverse) g.speed = Math.max(-28, g.speed - (g.speed > 0 ? 72 : 20) * dt)
  else if (gas) g.speed = g.speed > maxSpeed ? g.speed - 20 * dt : Math.min(maxSpeed, g.speed + accelAt(settings.acceleration, g.speed, maxSpeed) * dt * (g.time < (g.shiftUntil || 0) ? .3 : 1))
  else g.speed = Math.sign(g.speed) * Math.max(0, Math.abs(g.speed) - 9 * dt)
  g.braking = !!(brake || (reverse && g.speed > 0))
  const neutral = !!(race?.grid && !race.launched)
  updateGearbox(g, !!(gas || boost || (reverse && g.speed <= 0) || (neutral && g.revving)), dt, settings.engine, neutral)
  if (k.h && g.hornUntil < g.time) g.hornUntil = g.time + .7
// [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
  // if (g.turning) {
    // driveTurn(g, dt)
    // driveTraffic(g, dt)
    // if (g.police) for (const u of policeUnits(g)) driveUnit(g, u, dt)
    // return
  // }
  const steer = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0)
  g.steer += (steer - g.steer) * Math.min(1, dt * 7 * wet); g.previousX = g.x
  g.x += g.steer * dt * settings.handling * Math.min(Math.abs(g.speed) / 35, 1) * Math.sign(g.speed)
  // Grinding the kerb scrubs speed.
  if (Math.abs(g.x) > 1.08) {
    // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
    // const m = ((g.z % BLOCK) + BLOCK) % BLOCK, mouth = m < CORRIDOR + 4 || m > BLOCK - CORRIDOR - 8
    g.x = Math.sign(g.x) * 1.08
    g.speed -= Math.sign(g.speed) * Math.min(Math.abs(g.speed), 35 * dt); g.shake = .08
  }
  // Tyre squeal: hard braking, cornering at speed, or the moment of impact.
  const sp = Math.abs(g.speed)
  g.skid = Math.max(g.braking ? clamp((sp - 70) / 110, 0, 1) : 0, clamp(Math.abs(g.steer) * (sp - 140) / 120, 0, 1), g.time < g.impactUntil && sp > 20 ? .7 : 0)
  const old = g.z; g.previousZ = old; g.z += g.speed / 3.6 * dt; g.score += Math.abs(g.z - old) / 25
  potholes(g)
  nitroPickups(g)
  galaPickups(g)
  // junctions(g)
  driveTraffic(g, dt)
  if (g.rush && race?.launched && !race.done) roadChaos(g)
  recycleTraffic(g)
  const jam = !g.rush && nextJam(g.z, 250, laneKey(g))
  if (jam && `${laneKey(g)}:${jam.k}` !== g.jamWarned) { g.jamWarned = `${laneKey(g)}:${jam.k}`; emit(g, { type: 'jamAhead', distance: Math.round(jam.start - g.z) }); g.message = 'GO-SLOW AHEAD! Traffic don hold for front.' }
  for (const v of [...g.traffic, ...peers]) if (resolveContact(g, v, old)) {
    const count = g.contacts[v.id].count; if (!g.rush) g.message = 'FIRST BUMP · Reverse clear, then hit again'
    if (!v.id.startsWith('npc')) onBump(v.id)
    else if (count % 2 === 0 && !g.race) startRace(g, v, settings, v.danfo ? 'DANFO ROAD RAGE' : 'STREET RACE')
  }
  // Near misses: slipping past a vehicle with less than a metre to spare.
  for (const v of g.traffic) {
    const passed = (old - (v.previousZ ?? v.z)) < 0 && g.z - v.z >= 0, gap = Math.abs(g.x - v.x) * ROAD_SCALE - lateralGap(g, v)
    if (passed && gap > 0 && gap < .9 && g.speed > 60) { g.score += 10; addReckless(g, 5); emit(g, { type: 'nearMiss', id: v.id, kind: kindOf(v), x: v.x, z: v.z }) }
  }
  // Flat out (over 140 km/h) raises the meter; clean driving slowly lowers it. Full meter: olokpa.
  if (g.rush && !g.police && race?.launched && !race.done) {
    g.reckless = Math.max(0, (g.reckless || 0) + dt * (sp > settings.maxSpeed * .9 ? 1.6 : sp > settings.maxSpeed * .75 ? .6 : -1.2))
    if (g.reckless >= RECKLESS_LIMIT) { g.reckless = 0; g.heat = 35; g.message = 'OLOKPA DON SEE YOUR RECKLESS DRIVING! Dem dey come!'; emit(g, { type: 'policeAlert' }) }
  }
  // Checkpoints: warn on approach; through under the limit you're waved on, faster and they come after you.
  if (race?.checkpoints && race.launched && !race.done) for (const cp of race.checkpoints) {
    if (!cp.warned && cp.z - g.z < 260 && cp.z > g.z) { cp.warned = true; g.message = `POLICE CHECKPOINT AHEAD! Slow below ${CHECKPOINT_SPEED} and use the middle lane`; emit(g, { type: 'checkpointAhead' }) }
    if (!cp.passed && old < cp.z && g.z >= cp.z) {
      cp.passed = true
      if (sp > CHECKPOINT_SPEED && !g.police) { g.heat = 35; g.cpWanted = 2; g.message = 'YOU BLAST THE CHECKPOINT! Two stars, olokpa dey come!'; emit(g, { type: 'checkpointRun' }) }
      else if (sp <= CHECKPOINT_SPEED) { g.score += 75; g.message = 'CHECKPOINT CLEARED · "Oga, you fit go." +75 RP'; emit(g, { type: 'checkpointOk' }) }
    }
  }
  if (g.heat > 0 && !g.police) { beginPursuit(g); if (g.cpWanted) { raiseWanted(g, g.cpWanted); g.cpWanted = 0 } }
  // In a Naija Rush olokpa give up after 50 seconds unless they're already boxing you in.
  if (g.rush && g.police && g.time - g.police.started > 50 && !(g.arrestMeter > 0)) {
    g.police = null; g.backup = []; g.heat = 0; g.wanted = 0; g.escape = 0; g.score += 100
    g.message = 'OLOKPA DON TIRE! Dem don give up · +100 RP'; emit(g, { type: 'policeGaveUp' })
  }
  if (g.police) {
    // Stars climb with the length of the chase: quicker in a Naija Rush.
    const [two, three] = g.rush ? [12, 25] : [20, 45]
    raiseWanted(g, Math.max(g.wanted || 1, 1 + (g.time - g.police.started > two) + (g.time - g.police.started > three)))
    for (const u of policeUnits(g)) { driveUnit(g, u, dt); policeRam(g, u) }
  }
  const units = policeUnits(g), bodies = [...g.traffic, ...units]
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const p = bodies[i], q = bodies[j], rel = Math.abs(p.speed - q.speed)
      if (solidVehiclePair(p, q) === 'end' && pass === 0 && rel > 18 && p.id.startsWith('npc') && q.id.startsWith('npc') && !isRacer(g, p.id) && !isRacer(g, q.id) && !p.fixed && !q.fixed) {
        p.hold = q.hold = g.time + 4; hurt(p, p.z > q.z ? 'rear' : 'front', rel / 150); hurt(q, q.z > p.z ? 'rear' : 'front', rel / 150)
        emit(g, { type: 'npcCrash', id: p.z > q.z ? q.id : p.id, other: p.z > q.z ? p.id : q.id, kind: kindOf(p.z > q.z ? q : p), otherKind: kindOf(p.z > q.z ? p : q), impact: rel, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 })
      }
    }
    // Remote players are treated as solid snapshots, never authoritative objects.
    for (const u of units) {
      if (boosting(g) && u.z > g.z && u.z - g.z < (vehicleLength(g) + vehicleLength(u)) / 2 + 1 && Math.abs(u.x - g.x) * ROAD_SCALE < lateralGap(g, u)) shove(g, u)
      const hit = solidVehiclePair(u, g)
      if (hit === 'side') scrape(g, u)
      // Ramming olokpa yourself earns another star.
      if (hit && g.time > (g.copHitUntil || 0) && ((g.z < u.z && g.speed > u.speed + 15) || (hit === 'side' && Math.abs(g.speed) > 40))) { g.copHitUntil = g.time + 4; raiseWanted(g, g.wanted + 1) }
      for (const peer of peers) solidVehiclePair(u, { ...peer })
    }
    for (const v of g.traffic) if (solidVehiclePair(g, v) === 'side') scrape(g, v)
  }
  for (const v of g.traffic) { v.x = clamp(v.x, -1.08, 1.08); if (v.fixed) { v.x = v.ax; v.z = v.az; v.speed = 0 } }
  for (const u of units) u.x = clamp(u.x, -1.05, 1.05)
  if (g.police) updateArrest(g, dt)
  if (race?.grid && race.launched && !race.done) {
    const lap = Math.min(race.laps, Math.floor((g.z - race.start) / LAP_LENGTH) + 1)
    if (lap > race.lap) {
      race.lapTimes.push(g.time - race.go - race.lapTimes.reduce((a, b) => a + b, 0)); race.lap = lap
      g.message = lap === race.laps ? 'FINAL LAP! Na now e matter!' : `LAP ${lap} OF ${race.laps}`
      emit(g, { type: 'lap', lap, final: lap === race.laps })
    }
  }
  if (g.race) finishRace(g, peers)
}

// Side-swipes grind paint off both cars and throw sparks.
function scrape(g, v) {
  if (Math.abs(g.speed - v.speed) < 8 && Math.abs(g.speed) < 15) return
  if (g.time < (v.scrapeUntil || 0)) return
  v.scrapeUntil = g.time + .55
  const right = v.x > g.x
  hurtPlayer(g, right ? 'right' : 'left', .06); hurt(v, right ? 'left' : 'right', .1)
  g.speed *= .95; g.shake = Math.max(g.shake, .12)
  if (v.id.startsWith('npc')) provoke(g, v, .5)
  addReckless(g, isRacer(g, v.id) ? 4 : 10)
  emit(g, { type: 'scrape', id: v.id, kind: kindOf(v), model: v.model, racer: isRacer(g, v.id), x: (g.x + v.x) / 2, z: (g.z + v.z) / 2 })
}

function finishRace(g, peers) {
  const r = g.race, all = [...g.traffic, ...peers]
  r.finished ||= []
  for (const id of r.rivals || [r.rival]) { const v = all.find(o => o.id === id); if (v && v.z >= r.finish && !r.finished.includes(id)) { r.finished.push(id); if (r.times) r.times[id] = g.time - r.go } }
  if (r.grid) { finishRush(g, r, all); return }
  const total = (r.rivals || [r.rival]).length
  let place = null
  if (g.z >= r.finish) place = r.finished.length + 1
  else if (g.time >= r.end || r.finished.length >= total) place = racePosition(g, peers).place
  if (place === null) return
  const challenger = all.find(o => o.id === r.rival), mult = challenger ? [.8, 1, 1.5, 2, 3, 4][vehicleInfo(challenger).tier] : 1
  const won = place === 1, prize = Math.round((PRIZES[place - 1] || 0) * mult), winner = won ? r.rival : r.finished[0] || r.rival, wv = all.find(o => o.id === winner)
  g.score += prize
  g.message = won ? `1ST PLACE! RACE WON · +${prize} REP` : `${place === 2 ? '2ND' : place === 3 ? '3RD' : place + 'TH'} PLACE${prize ? ` · +${prize} REP` : ''}`
  emit(g, { type: 'raceEnd', won, place, id: winner, kind: wv ? kindOf(wv) : 'car' })
  for (const id of r.rivals || []) { const v = g.traffic.find(o => o.id === id); if (v) { const [lo, hi] = KINDS[kindOf(v)].cruise; v.cruise = (lo + hi) / 2; v.tx = nearestLane(v.x) } }
  g.race = null
}
// Naija Rush finish: your place, time and prize. Crossing the line clean also shakes off olokpa.
const RUSH_PRIZES = [600, 300, 150, 50, 0], ORDINAL = ['1ST', '2ND', '3RD', '4TH', '5TH']
function finishRush(g, r, all) {
  // The race is yours to finish: even in last place you cross the line and get a time.
  if (r.done || g.z < r.finish) return
  const place = r.finished.length + 1, prize = RUSH_PRIZES[place - 1] || 0
  r.done = { place, time: g.time - r.go, prize, at: g.time }
  g.score += prize
  g.police = null; g.backup = []; g.wanted = 0; g.heat = 0; g.arrestMeter = 0; g.escape = 0
  g.message = place === 1 ? `1ST PLACE! YOU WIN THE RUSH · +${prize} RP` : `${ORDINAL[place - 1]} PLACE${prize ? ` · +${prize} RP` : ''}`
  const winner = place === 1 ? r.rival : r.finished[0], wv = all.find(o => o.id === winner)
  emit(g, { type: 'raceEnd', won: place === 1, place, id: winner, kind: wv ? kindOf(wv) : 'car' })
}

// The finishing order for the results screen: everyone home in order (you included), then whoever is still racing.
export function rushResults(g) {
  const r = g.race; if (!r?.grid || !r.done) return null
  const byId = id => g.traffic.find(v => v.id === id)
  const rival = id => { const v = byId(id), info = v ? vehicleInfo(v) : {}; return { id, name: RIVALS[v?.rival ?? 0].name, car: `${info.make} ${info.name}`, time: r.times[id] ?? null, gap: v && r.times[id] === undefined ? Math.max(0, Math.round(r.finish - v.z)) : null } }
  const home = r.finished.map(rival), still = r.rivals.filter(id => !r.finished.includes(id)).sort((a, b) => (byId(b)?.z ?? 0) - (byId(a)?.z ?? 0)).map(rival)
  const order = [...home.slice(0, r.done.place - 1), { id: 'player', me: true, time: r.done.time, gap: null }, ...home.slice(r.done.place - 1), ...still]
  return { ...r.done, order: order.map((e, i) => ({ ...e, pos: i + 1 })) }
}
