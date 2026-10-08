// The city: a grid of dual carriageways crossing every BLOCK metres, with blocks of shops, markets,
// bus stops and filling stations between them. Pieces are built once as templates and cloned onto the
// grid around the player, so turning a corner keeps you in the same world: the buildings you saw down
// the side street are the ones you drive past. Everything lives in world coordinates (east = +x,
// north = -z) inside one group, which is moved and rotated each frame so the player's road points ahead.
import * as T from 'three'
import { rand } from './textures.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Batch, boxGeo } from './models.js'
import { BLOCK, AXIS, CORRIDOR, worldAt } from './physics.js'
// [ROAD NETWORK DISABLED] import { rightOf, vehicleLength } from './physics.js'

const INNER = BLOCK / 2 - CORRIDOR          // half the side of a block of buildings
const PIECE = BLOCK - 2 * CORRIDOR          // a road between two junctions
const EDGE_KINDS = ['shops', 'busstop', 'shops', 'market', 'kiosks', 'billboard', 'shops', 'filling', 'mosque', 'suya', 'church', 'market', 'shops', 'suya']
// [ROAD NETWORK DISABLED] street-name signs at junctions
// const SHORT = n => n.replace(/ (ROAD|STREET|AVENUE|WAY|CRESCENT|EXPRESSWAY)$/, m => ({ ' ROAD': ' RD', ' STREET': ' ST', ' AVENUE': ' AVE', ' EXPRESSWAY': ' EXPY' })[m] || m)
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s) }

export function createCity(scene, { kit, tex, C, city, high }) {
  const { std } = kit
  const root = new T.Group(); scene.add(root)
  // Shared street materials
  const road = tex.photo(new T.MeshStandardMaterial({ color: '#4a4c4e', roughness: .92 }), 'road', { normalScale: .9 })
  const pavement = tex.photo(new T.MeshStandardMaterial({ color: '#a8a395', roughness: .95 }), 'pavement', { normalScale: .6 })
  const kerbMat = new T.MeshStandardMaterial({ map: tex.kerb(), roughness: .7 })
  const walls = C.palette.map(c => tex.photo(new T.MeshStandardMaterial({ color: c, roughness: .92 }), 'wall', { normalScale: .5 }))
  const tin = tex.photo(new T.MeshStandardMaterial({ color: '#8c8f8a', roughness: .5, metalness: .5 }), 'roof', { normalScale: .5 })
  const line = std('#eeeadf', .6), yellow = std('#e2b51c', .6), concrete = std('#b5b0a3', .9), dark = std('#2b2925', .95), grass = std('#62783a', 1), rail = std('#7a8288', .4, .6) // , roofDark = std('#55524c', .9)   [ROAD NETWORK DISABLED] block rooftops
  const signMats = new Map(), greenSign = lines => { const k = lines.join('|'); if (!signMats.has(k)) signMats.set(k, new T.MeshStandardMaterial({ map: tex.sign(lines, { w: 768, h: 192, bg: '#1b6b3f' }), roughness: .5 })); return signMats.get(k) }
  const towerWindows = tex.windows(7), glassTower = new T.MeshStandardMaterial({ map: towerWindows, emissiveMap: towerWindows, emissive: '#ffd9a0', emissiveIntensity: 0, roughness: .15, metalness: .6 })
  // Signs in any colour, and the materials for mosques, churches, suya spots and flag bunting.
  const colourSign = (lines, bg) => { const k = bg + lines.join('|'); if (!signMats.has(k)) signMats.set(k, new T.MeshStandardMaterial({ map: tex.sign(lines, { w: 768, h: 192, bg }), roughness: .5 })); return signMats.get(k) }
  const plaster = std('#f1ece0', .85), mosqueGreen = std('#1f8a4c', .45, .2), gold = std('#e2b51c', .35, .7), churchWall = std('#e9e2cf', .85), churchRoof = std('#7a2f22', .7), coal = std('#2a1a12', .6, 0, { emissive: '#ff5a14', emissiveIntensity: 1.1 })
  const flagMat = new T.MeshStandardMaterial({ map: tex.canvasTexture(96, 64, (c, w, h) => { c.fillStyle = '#008751'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(w / 3, 0, w / 3, h) }), side: T.DoubleSide, roughness: .8 })
  const CHURCHES = [['GRACE & GLORY ASSEMBLY', 'SUNDAY SERVICE 7AM · ALL ARE WELCOME'], ['MOUNTAIN OF MERCY CHURCH', 'NIGHT VIGIL EVERY FRIDAY · 10PM'], ['LIVING FAITH TABERNACLE', 'COME AND RECEIVE YOUR MIRACLE']]
  // Shop-front facades: one shared material per design, lit up together at night.
  const facadeMats = {}
  for (let f = 2; f <= 6; f++) facadeMats[f] = [0, 1, 2].map(v => { const t = tex.facade(f * 31 + v * 7 + (city === 'Lagos' ? 0 : 500), C.palette[(f + v) % C.palette.length], C.shops[(f * 3 + v) % C.shops.length], f); return new T.MeshStandardMaterial({ map: t, emissiveMap: t.userData.night, emissive: '#ffffff', emissiveIntensity: 0, roughness: .85 }) })
  // [ROAD NETWORK DISABLED] traffic lights at junctions
  // const lightRed = std('#ff2a2a', .3, 0, { emissive: '#ff2a2a', emissiveIntensity: 1.2 }), lightGreen = std('#2aff6a', .3, 0, { emissive: '#2aff6a', emissiveIntensity: 1.2 }), lightOff = std('#222', .5)

  function strip(b, mat, x, w, y, h, z0, z1, uv = 0) { b.add(boxGeo(w, h, z1 - z0, uv), mat, x, y, (z0 + z1) / 2) }
  function freeze(group) { for (const o of group.children) if (o.isMesh) { o.updateMatrix(); o.matrixAutoUpdate = false } }
  // Collapse a finished template into one mesh per material (a block draws in a couple of dozen calls,
  // not a hundred), carrying the people specs across into the template's own frame.
  function flatten(group) {
    group.updateMatrixWorld(true)
    const inv = new T.Matrix4().copy(group.matrixWorld).invert(), rel = new T.Matrix4(), byMat = new Map(), specs = [], q = new T.Quaternion(), pos = new T.Vector3(), scl = new T.Vector3(), eul = new T.Euler()
    group.traverse(o => {
      rel.multiplyMatrices(inv, o.matrixWorld)
      if (o.isMesh) { const k = o.material.uuid + (o.castShadow ? 'c' : ''); if (!byMat.has(k)) byMat.set(k, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] }); byMat.get(k).geos.push(o.geometry.clone().applyMatrix4(rel)) }
      for (const sp of o.userData.specs || []) {
        rel.decompose(pos, q, scl); eul.setFromQuaternion(q, 'YXZ')
        const p = new T.Vector3(sp.x, sp.y, sp.z).applyMatrix4(rel)
        specs.push({ ...sp, x: p.x, y: p.y, z: p.z, ry: sp.ry + eul.y, walk: sp.walk ? { ...sp.walk, lx: sp.x, lz: sp.z, frame: [rel.elements[0], rel.elements[2], rel.elements[8], rel.elements[10], rel.elements[12], rel.elements[14]] } : undefined })
      }
    })
    const out = new T.Group()
    for (const { mat, cast, receive, geos } of byMat.values()) {
      // Same layout for every piece (non-indexed, same attributes) so they merge into one.
      if (geos.length > 1) for (let i = 0; i < geos.length; i++) {
        let g = geos[i].index ? geos[i].toNonIndexed() : geos[i]
        const ref = i ? geos[0] : g
        for (const name of Object.keys(ref.attributes)) if (!g.attributes[name]) { const a = ref.attributes[name]; g.setAttribute(name, new T.BufferAttribute(new Float32Array(g.attributes.position.count * a.itemSize).fill(name === 'color' ? 1 : 0), a.itemSize)) }
        for (const name of Object.keys(g.attributes)) if (!ref.attributes[name]) g.deleteAttribute(name)
        g.morphAttributes = {}; geos[i] = g
      }
      const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0]
      for (const geo of merged ? [merged] : geos) { const m = new T.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; out.add(m) }
    }
    out.userData.specs = specs
    return out
  }

  // One building on a block edge. Edge frame: the road is towards -x, the shop front faces it at x = 15.6.
  function building(b, z0, z1, seed) {
    const len = z1 - z0 - 1.2, cz = (z0 + z1) / 2
    const tower = city === 'Abuja' && rand(seed + 2) > .55
    const floors = tower ? 7 + Math.floor(rand(seed) * 7) : 2 + Math.floor(rand(seed) * 5)
    const h = floors * 3.4 + 1.2, depth = 10 + rand(seed + 1) * 5, inner = 15.6, x = inner + depth / 2
    b.add(boxGeo(depth, h, len, 3), tower ? glassTower : walls[seed % walls.length], x, h / 2 - .1, cz)
    b.add(boxGeo(depth + .4, .5, len + .4), concrete, x, h + .1, cz)
    if (tower) {
      const g = boxGeo(.05, h, len); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 6, uv.getY(i) * floors / 2)
      b.add(g, glassTower, inner - .02, h / 2, cz)
    } else {
      b.add(new T.PlaneGeometry(len, h - .2), facadeMats[clamp(floors, 2, 6)][seed % 3], inner - .02, h / 2 - .1, cz, 0, -Math.PI / 2)
      b.add(boxGeo(1.6, .12, len - 1), tin, inner - .8, 3.3, cz, 0, 0, .12)
      for (let k = 0; k < 1 + (seed % 2); k++) kit.waterTank(b, x + (rand(seed + k) - .5) * depth * .6, h + .35, cz + (k - .5) * len * .5)
    }
  }
  // People and parked danfos are kept as plain specs in the templates (cloning can't copy their rigs);
  // each placed tile fills them in from a reusable pool.
  const spec = (group, s) => { (group.userData.specs ||= []).push(s); return s }
  const person = (group, opts, x, z, ry, mode, extra = {}) => spec(group, { type: 'person', opts, x, y: opts.seated ? -.05 : .25, z, ry, mode, ...extra })
  const bubble = (p, text, y, hawker = false) => { p.bubble = { text, y, hawker, offset: rand(y + text.length) * 6 } }

  // A block edge: shop fronts, bus stops, markets, kiosks, a filling station or a billboard, plus the people on its pavement.
  function edge(seed, half = INNER, corner = true) {
    const group = new T.Group(), b = new Batch(), chunks = Math.max(1, Math.round(2 * half / 36.7)), cl = 2 * half / chunks
    for (let c = 0; c < chunks; c++) {
      const z0 = -half + c * cl, z1 = z0 + cl, zb = c === 0 && corner ? z0 + 16.4 : z0, mid = (z0 + z1) / 2, s = seed * 7 + c
      const kind = EDGE_KINDS[Math.floor(rand(seed * 3.1 + c * 1.7) * EDGE_KINDS.length)]
      if (kind === 'busstop') {
        kit.busStop(b, 14.2, mid, 1)
        // Parked half up on the kerb, Lagos style, clear of the traffic lanes.
        spec(group, { type: 'danfo', seed: s, x: 10.2, y: .12, z: mid - 5, ry: 0 })
        for (const [x, dz, role] of [[13.3, -1, 'agbero'], [13.5, 4, 'agbero'], [14.4, 1, 'idle'], [14.6, 3.2, 'idle']]) {
          const p = person(group, { seed: s * 13 + dz, role: role === 'agbero' ? 'agbero' : 'walker' }, x, mid + dz, Math.PI / 2 + (rand(dz + s) - .5) * .8, role)
          if (role === 'agbero') bubble(p, C.calls[(s + dz + 9) % C.calls.length], 2.6)
        }
        building(b, Math.max(zb, mid + 4), z1, s)
        if (zb < mid - 6) building(b, zb, mid - 4, s + 1)
      } else if (kind === 'filling') {
        strip(b, concrete, 22, 13, 0, .2, z0 + 3, z1 - 3)
        for (const [x, dz] of [[17, -5], [17, 5], [26, -5], [26, 5]]) b.add(boxGeo(.5, 5, .5), std('#e9e9e9', .5), x, 2.5, mid + dz)
        b.add(boxGeo(12, .7, 14), std('#f4f4f2', .4), 21.5, 5.2, mid); b.add(boxGeo(12.1, .25, 14.1), std('#1f8a4c', .5), 21.5, 4.85, mid)
        for (const dz of [-3, 3]) { b.add(boxGeo(.8, 1.6, .5), std('#1f8a4c', .5), 21.5, .9, mid + dz); b.add(boxGeo(.7, .4, .52), std('#111', .3, 0, { emissive: '#ffcf4a', emissiveIntensity: .4 }), 21.5, 1.4, mid + dz) }
        b.add(boxGeo(.3, 7, .3), rail, 16.2, 3.5, z0 + 4)
        b.add(new T.PlaneGeometry(4, 2.4), greenSign(['MEGA FILLING STATION', 'PMS ₦1,050 / LITRE · DPK · AGO']), 16.0, 6, z0 + 4, 0, -Math.PI / 2)
        for (const dz of [-3, 3]) person(group, { seed: s * 5 + dz, role: 'walker' }, 20.5, mid + dz, Math.PI / 2, 'idle')
      } else if (kind === 'mosque') {
        // Mosque: white hall behind a low wall, green dome with a gold crescent, and a minaret by the road.
        const x = 24, h = 7
        b.add(boxGeo(14, h, 18), plaster, x, h / 2, mid); b.add(boxGeo(14.6, .5, 18.6), plaster, x, h + .2, mid)
        b.add(new T.SphereGeometry(5.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mosqueGreen, x, h + .4, mid)
        b.add(new T.CylinderGeometry(.08, .08, 1.6), gold, x, h + 6, mid); b.add(new T.TorusGeometry(.5, .09, 6, 16, Math.PI * 1.35), gold, x, h + 7.2, mid, 0, Math.PI / 2, .4)
        b.add(new T.CylinderGeometry(1, 1.2, 20, 10), plaster, 17.6, 10, mid + 7.5); b.add(new T.CylinderGeometry(1.6, 1.6, .5, 12), mosqueGreen, 17.6, 14, mid + 7.5)
        b.add(new T.ConeGeometry(1.15, 2.8, 10), mosqueGreen, 17.6, 21.4, mid + 7.5); b.add(new T.CylinderGeometry(.05, .05, 1.2), gold, 17.6, 23.3, mid + 7.5)
        b.add(boxGeo(.4, 1.4, cl - 6), plaster, 15.9, .7, mid); b.add(new T.PlaneGeometry(3.2, 3.8), mosqueGreen, 16.95, 1.9, mid, 0, -Math.PI / 2)
        if (mid - 10 - zb > 6) building(b, zb, mid - 10, s)
        if (z1 - mid - 11 > 6) building(b, mid + 11, z1, s + 1)
      } else if (kind === 'church') {
        // Church: gable-roofed hall, a bell tower with a cross at the front, and its sign by the road.
        const x = 24, h = 6.5, len = 20, roofW = 7.6
        b.add(boxGeo(12, h, len), churchWall, x, h / 2, mid)
        for (const sx of [-1, 1]) b.add(boxGeo(roofW, .35, len + .8), churchRoof, x + sx * 3.05, h + 2.1, mid, 0, 0, sx * .58)
        b.add(boxGeo(4, 13, 4), churchWall, 17.8, 6.5, mid - 7); b.add(boxGeo(4.4, .4, 4.4), churchRoof, 17.8, 13.2, mid - 7)
        b.add(boxGeo(.35, 3, .35), gold, 17.8, 15, mid - 7); b.add(boxGeo(.35, .35, 1.6), gold, 17.8, 15.6, mid - 7)
        b.add(new T.PlaneGeometry(6, 1.5), colourSign(CHURCHES[s % CHURCHES.length], '#1d3b8a'), 15.9, 3.4, mid + 3, 0, -Math.PI / 2)
        if (mid - 11 - zb > 6) building(b, zb, mid - 11, s)
        if (z1 - mid - 11 > 6) building(b, mid + 11, z1, s + 1)
      } else if (kind === 'suya') {
        // Suya spot: a tin-roofed stall with a glowing grill, the mallam at work and the sign out front.
        building(b, zb, mid - 3, s); building(b, mid + 5, z1, s + 1)
        for (const dz of [-2.6, 2.6]) for (const dx of [-1.6, 1.6]) b.add(boxGeo(.12, 2.6, .12), rail, 13.6 + dx, 1.3, mid + 1 + dz)
        b.add(boxGeo(3.8, .1, 6.2), tin, 13.6, 2.65, mid + 1, 0, 0, -.08)
        b.add(boxGeo(1.2, .8, 2.2), dark, 12.9, .4, mid + 1); b.add(boxGeo(1.1, .06, 2.1), coal, 12.9, .82, mid + 1)
        b.add(new T.PlaneGeometry(4.4, 1.1), colourSign(['MALLAM SUYA SPOT', 'BEEF · KIDNEY · CHICKEN · ₦500'], '#b3261e'), 11.7, 3.2, mid + 1, 0, -Math.PI / 2)
        person(group, { seed: s * 31, role: 'hawker' }, 13.9, mid + 1, -Math.PI / 2, 'idle')
      } else if (kind === 'billboard') {
        kit.billboard(b, 17.5, mid - 6, C.billboards[s % C.billboards.length], s, 1); building(b, mid + 2, z1, s)
      } else {
        building(b, zb, mid, s); building(b, mid, z1, s + 1)
        if (kind === 'market') for (let k = 0; k < 4; k++) { const z = z0 + 4 + k * (cl - 8) / 3; kit.umbrellaStall(b, 13.6, z, s + k); person(group, { seed: s * 17 + k, seated: true }, 14.4, z - .6, Math.PI / 2, 'sit') }
        if (kind === 'kiosks') { kit.kiosk(b, 13.8, mid - 8, s, 1); kit.kiosk(b, 13.8, mid + 8, s + 1, 1) }
        if (kind !== 'shops' || rand(s) > .5) { const h = person(group, { seed: s * 29, role: 'hawker', tray: true }, 10.3, mid + 3, Math.PI / 2, 'hawker', { hawker: true }); bubble(h, ['PURE WATER!', 'GALA! GALA!', 'PLANTAIN CHIPS!', 'BOLE & FISH!'][s % 4], 2.9, true) }
      }
    }
    // Pedestrians walking the pavement
    for (let k = 0; k < (high ? 2 : 1); k++) person(group, { seed: seed * 23 + k * 5 }, 11.2 + rand(seed + k) * 3, -half + rand(seed * 7 + k) * 2 * half, 0, 'walk', { walk: { half, dir: rand(seed * 3 + k) > .5 ? 1 : -1, speed: 1.1 + rand(k + seed) * .6 } })
    b.build(group, { cast: high }); freeze(group)
    return group
  }
  // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back the city grid, junctions and cross-street traffic.
  // // A block: four edges facing the four roads around it, and rooftops filling the middle.
  // function block(seed) {
    // const group = new T.Group()
    // for (let i = 0; i < 4; i++) {
      // const pivot = new T.Group(); pivot.rotation.y = i * Math.PI / 2
      // const e = edge(seed * 4 + i); e.rotation.y = Math.PI; e.position.x = INNER + 15.6
      // pivot.add(e); group.add(pivot)
    // }
    // const b = new Batch(), core = INNER - 30
    // for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { const h = 6 + rand(seed + x * 3 + z * 7) * 12; b.add(boxGeo(core * .62, h, core * .62, 3), walls[(seed + x + z + 3) % walls.length], x * core * .66, h / 2, z * core * .66); b.add(boxGeo(core * .62 + .3, .4, core * .62 + .3), roofDark, x * core * .66, h + .2, z * core * .66) }
    // b.build(group, { cast: false }); freeze(group)
    // return flatten(group)
  // }
  // A stretch of dual carriageway between two junctions, running along local z. u (local x) is measured from the median.
  function roadPiece(footbridge, len = PIECE) {
    const group = new T.Group(), b = new Batch(), L = len / 2
    strip(b, road, 0, 41, -.15, .3, -L, L, 6)
    for (const s of [-1, 1]) {
      for (const u of [9.075, 12.925]) for (let z = -L + 2; z < L - 5; z += 10) strip(b, line, s * u, .14, .01, .02, z, z + 4.5)
      for (const u of [5.15, 16.85]) strip(b, line, s * u, .14, .01, .02, -L, L)
      strip(b, yellow, s * 1.85, .14, .01, .02, -L, L)
      strip(b, kerbMat, s * 1.35, .3, .1, .32, -L, L, 1)
      strip(b, kerbMat, s * 20.65, .3, .1, .32, -L, L, 1)
      strip(b, dark, s * 21.1, .6, -.08, .1, -L, L)
      for (let z = -L + 1; z < L - 1; z += 3) b.add(boxGeo(.75, .08, 1.2), concrete, s * 21.1, .2, z)
      strip(b, pavement, s * 23.7, 5.2, .12, .26, -L, L, 2.5)
      // Power lines along both pavements
      for (let z = -L + 20; z < L; z += 40) b.add(boxGeo(.22, 9, .22), std('#6b5a43', .9), s * 25.6, 4.5, z)
      for (const y of [8.3, 8.7]) b.add(new T.CylinderGeometry(.015, .015, len, 4, Math.ceil(len / 8)).rotateX(Math.PI / 2), dark, s * 25.6, y, 0)
    }
    strip(b, grass, 0, 2.4, .1, .28, -L, L)
    // Lamps every 40 m, on the same grid as the night-time light pools; palms in between.
    for (const z of L === BLOCK / 2 ? [-80, -40, 0, 40, 80] : [-40, 0, 40]) kit.palm(b, 0, z, Math.round(z) + 77)
    for (const z of L === BLOCK / 2 ? [-100, -60, -20, 20, 60] : [-60, -20, 20, 60]) {
      kit.streetlight(b, 0, z)
      for (const sx of [-1, 1]) b.add(new T.PlaneGeometry(1.1, .7), flagMat, sx * .62, 5.6, z, 0, Math.PI / 2, 0)   // a flag either side of the pole
    }
    if (footbridge) {
      const deckY = 6.6
      for (const u of [-25, 25]) for (const dz of [-1.2, 1.2]) b.add(boxGeo(.6, deckY, .6), concrete, u, deckY / 2, dz)
      b.add(boxGeo(51, .5, 2.8), concrete, 0, deckY + .25, 0)
      for (const dz of [-1.35, 1.35]) { b.add(boxGeo(51, .08, .08), rail, 0, deckY + 1.5, dz); for (let u = -25; u <= 25; u += 1.5) b.add(boxGeo(.05, 1.0, .05), rail, u, deckY + 1, dz) }
      for (const u of [-25, 25]) { const ramp = Math.hypot(deckY, 12); b.add(boxGeo(1.8, .3, ramp), concrete, u, deckY / 2, 8.2, Math.atan2(deckY, 12)) }
      for (const s of [-1, 1]) b.add(new T.PlaneGeometry(12, 1.3), greenSign(['USE THE OVERHEAD BRIDGE', 'Save your life · Avoid accident']), 0, deckY - .3, s * 1.42, 0, s > 0 ? 0 : Math.PI)
      for (let k = 0; k < 3; k++) person(group, { seed: 300 + k }, -20 + k * 15, 0, Math.PI / 2, 'walk', { walk: { axis: 'x', dir: k % 2 ? 1 : -1, speed: 1.2 + k * .15 } }).y = deckY + .5
    }
    b.build(group, { cast: high }); freeze(group)
    return flatten(group)
  }
  // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back the city grid, junctions and cross-street traffic.
  // // A junction: open tarmac, zebra crossings on every arm, corner kerbs and traffic lights.
  // function junction() {
    // const group = new T.Group(), b = new Batch(), H = CORRIDOR
    // strip(b, road, 0, 2 * H, -.15, .3, -H, H, 6)
    // for (let arm = 0; arm < 4; arm++) {
      // const rot = (x, z) => { const a = arm * Math.PI / 2; return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)] }
      // for (let u = -19.5; u <= 19.5; u += 1.4) { if (Math.abs(u) < 1.6) continue; const [x, z] = rot(u, -H + 3.5); b.add(boxGeo(arm % 2 ? 3.2 : .7, .02, arm % 2 ? .7 : 3.2), line, x, .012, z) }
      // const [sx, sz] = rot(10.5, -H + 6.3); b.add(boxGeo(arm % 2 ? .4 : 19, .02, arm % 2 ? 19 : .4), line, sx, .012, sz)
      // // Corner: kerbed pavement square and a traffic light
      // const [cx, cz] = rot(H - 3, -H + 3); strip(b, pavement, cx, 6, .12, .26, cz - 3, cz + 3, 2.5)
      // const [px, pz] = rot(21.4, -H + 7); b.add(boxGeo(.16, 4.2, .16), rail, px, 2.1, pz); b.add(boxGeo(.45, 1.2, .45), std('#1c1c1c', .5), px, 4.5, pz)
      // b.add(boxGeo(.3, .3, .3), arm % 2 ? lightGreen : lightRed, px, 4.85, pz); b.add(boxGeo(.3, .3, .3), lightOff, px, 4.2, pz)
    // }
    // b.build(group, { cast: high }); freeze(group)
    // return flatten(group)
  // }

  // const blockTemplates = Array.from({ length: 6 }, (_, i) => block(i * 37 + (city === 'Lagos' ? 1 : 900)))
  // const roadTemplates = [roadPiece(false), roadPiece(false), roadPiece(true), roadPiece(false)]
  // const junctionTemplate = junction()
  // const roadName = id => C.roads[((id % C.roads.length) + C.roads.length) % C.roads.length]

  // One straight street: each 200 m tile is the dual carriageway plus shop fronts, markets and bus stops on both sides.
  function streetTile(seed, footbridge) {
    const group = new T.Group()
    group.add(roadPiece(footbridge, BLOCK))
    const right = edge(seed * 2, BLOCK / 2, false); right.position.x = AXIS; group.add(right)
    const left = edge(seed * 2 + 1, BLOCK / 2, false); left.rotation.y = Math.PI; left.position.x = -AXIS; group.add(left)
    return flatten(group)
  }
  const streetTemplates = Array.from({ length: 6 }, (_, i) => streetTile(i * 37 + (city === 'Lagos' ? 1 : 900), i === 3))

  const pool = new Map(), bubbleMats = new Map()
  function acquire(sp) {
    const key = sp.type === 'danfo' ? `danfo:${sp.seed % 6}` : `p:${sp.opts.role || ''}:${sp.opts.seated ? 1 : 0}:${sp.opts.tray ? 1 : 0}:${Math.abs(Math.round(sp.opts.seed)) % 10}`
    const o = pool.get(key)?.pop() || (sp.type === 'danfo' ? kit.danfo(sp.seed % 6) : kit.person({ ...sp.opts, seed: Math.abs(Math.round(sp.opts.seed)) % 10 + (sp.opts.role === 'agbero' ? 50 : 0) }))
    o.userData.poolKey = key; o.position.set(sp.x, sp.y, sp.z); o.rotation.set(0, sp.ry, 0); o.visible = true
    o.userData.mode = sp.mode; o.userData.walk = sp.walk ? { ...sp.walk } : null
    if (sp.bubble) {
      if (!bubbleMats.has(sp.bubble.text)) bubbleMats.set(sp.bubble.text, new T.SpriteMaterial({ map: tex.bubble(sp.bubble.text), depthWrite: false }))
      const s = new T.Sprite(bubbleMats.get(sp.bubble.text)); s.scale.set(2.6, .65, 1); s.position.set(0, sp.bubble.y, 0); s.userData.bubble = sp.bubble; o.add(s); o.userData.bubbleSprite = s
    }
    return o
  }
  function release(o) {
    o.parent?.remove(o); if (o.userData.bubbleSprite) { o.remove(o.userData.bubbleSprite); o.userData.bubbleSprite = null }
    const list = pool.get(o.userData.poolKey) || []; list.push(o); pool.set(o.userData.poolKey, list)
  }

  // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back the city grid, junctions and cross-street traffic.
  // // Live tiles around the player, keyed by grid position.
  // const live = new Map(), RADIUS = 380
  // function makeTile(key) {
    // const [type, i, j] = key.split(':'), I = +i, J = +j
    // let obj
    // if (type === 'b') {
      // const h = hash(I, J); obj = blockTemplates[Math.floor(h * blockTemplates.length)].clone(); obj.position.set((I + .5) * BLOCK, 0, -(J + .5) * BLOCK); obj.rotation.y = Math.floor(h * 97) % 4 * Math.PI / 2
    // } else if (type === 'v' || type === 'h') {
      // obj = roadTemplates[Math.floor(hash(I * 3 + 1, J * 5 + (type === 'h' ? 7 : 0)) * roadTemplates.length)].clone()
      // if (type === 'v') obj.position.set(I * BLOCK, 0, -(J + .5) * BLOCK)
      // else { obj.position.set((I + .5) * BLOCK, 0, -J * BLOCK); obj.rotation.y = Math.PI / 2 }
    // } else {
      // obj = junctionTemplate.clone(); obj.position.set(I * BLOCK, 0, -J * BLOCK)
      // // Green street-name signs on two corners, one for each road.
      // const ns = roadName(2 * I), ew = roadName(2 * J + 1)
      // for (const [x, z, ry, name] of [[22, 22, 0, ns], [22, -22, -Math.PI / 2, ew]]) {
        // const post = new T.Mesh(boxGeo(.1, 3.2, .1), rail); post.position.set(x, 1.6, z); obj.add(post)
        // const sign = new T.Mesh(new T.PlaneGeometry(3.4, .6), greenSign([SHORT(name)])); sign.position.set(x, 3.1, z); sign.rotation.y = ry; obj.add(sign)
      // }
    // }
    // // Fill in the people and parked danfos from the pool.
    // const hosts = []; obj.traverse(o => { if (o.userData.specs) hosts.push(o) })
    // const people = [], spawned = []
    // for (const host of hosts) for (const sp of host.userData.specs) {
      // const o = acquire(sp); host.add(o); spawned.push(o)
      // if (sp.type === 'danfo') for (const r of o.userData.riders || []) { r.userData.mode = 'agbero'; people.push(r) } else people.push(o)
    // }
    // obj.userData.people = people; obj.userData.spawned = spawned; obj.userData.key = key
    // root.add(obj); return obj
  // }
  // function syncTiles(pe, pn) {
    // const want = new Set(), i0 = Math.floor((pe - RADIUS) / BLOCK), i1 = Math.ceil((pe + RADIUS) / BLOCK), j0 = Math.floor((pn - RADIUS) / BLOCK), j1 = Math.ceil((pn + RADIUS) / BLOCK)
    // const near = (e, n) => Math.hypot(e - pe, n - pn) < RADIUS + 30
    // for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      // if (near((i + .5) * BLOCK, (j + .5) * BLOCK)) want.add(`b:${i}:${j}`)
      // if (near(i * BLOCK, (j + .5) * BLOCK)) want.add(`v:${i}:${j}`)
      // if (near((i + .5) * BLOCK, j * BLOCK)) want.add(`h:${i}:${j}`)
      // if (near(i * BLOCK, j * BLOCK)) want.add(`x:${i}:${j}`)
    // }
    // for (const [k, o] of live) if (!want.has(k)) { root.remove(o); for (const p of o.userData.spawned) release(p); live.delete(k) }
    // let built = 0
    // for (const k of want) if (!live.has(k) && built++ < 6) live.set(k, makeTile(k))
  // }

  // // Cross-street traffic: cars on the other roads of the grid, queueing at your road's junctions.
  // const ambient = Array.from({ length: high ? 8 : 5 }, (_, k) => {
    // const kind = ['car', 'danfo', 'car', 'taxi', 'okada', 'car', 'keke', 'danfo', 'car', 'brt'][k], obj = kit.vehicle({ kind, model: k % 4, tint: (k * 5) % 8 })
    // // Far-off cross traffic: no shadows, no badges or interior detail.
    // obj.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.userData.detail) o.visible = false } }); obj.visible = false; root.add(obj)
    // return { obj, kind, model: k % 4, live: false, seed: k * 13.7, s: 0, len: 4.8 }
  // })
  // // Every cross-street car belongs to one lane of one road, identified by the junction it is heading to or
  // // from, its direction and lane; s is its position along that lane (negative = before the junction).
  // const laneOf = a => `${Math.round(a.junction.e)}:${Math.round(a.junction.n)}:${a.dir.e}:${a.dir.n}:${Math.round(a.lane)}`
  // function spawnAmbient(a, road, z, t) {
    // const D = { e: road.de, n: road.dn }, R = rightOf(D)
    // const k = Math.round(z / BLOCK) + Math.floor(rand(a.seed + t) * 4) - 1, J = worldAt(road, k * BLOCK, -AXIS / 7)
    // const side = rand(a.seed + t * 3) > .5 ? 1 : -1, off = 50 + rand(a.seed + t * 7) * 220, toward = rand(a.seed + t * 11) > .4
    // a.dir = { e: R.e * (toward ? -side : side), n: R.n * (toward ? -side : side) }
    // a.junction = J; a.toward = toward
    // a.lane = AXIS + [-3.85, 0, 3.85][Math.floor(rand(a.seed + t * 5) * 3)] + (a.kind === 'okada' ? 2 : 0)
    // a.s = toward ? -off : CORRIDOR + 4 + rand(a.seed + t) * 120
    // a.len = vehicleLength({ kind: a.kind, model: a.model })
    // // Never appear on top of another car in the same lane.
    // const key = laneOf(a)
    // if (ambient.some(o => o !== a && o.live && laneOf(o) === key && Math.abs(o.s - a.s) < (o.len + a.len) / 2 + 8)) { a.live = false; a.obj.visible = false; return }
    // a.speed = (a.kind === 'brt' ? 40 : 45 + rand(a.seed + t * 2) * 25) / 3.6; a.live = true; a.obj.visible = true
  // }
  // function updateAmbient(road, z, t, dt, pe, pn) {
    // const onMyRoad = a => (road.de === 0 ? a.dir.e === 0 && Math.abs(a.junction.e - (road.oe)) < 1 : a.dir.n === 0 && Math.abs(a.junction.n - road.on) < 1)
    // for (const a of ambient) if (!a.live || onMyRoad(a)) spawnAmbient(a, road, z, t + a.seed)
    // for (const a of ambient) {
      // if (!a.live) continue
      // // Follow the car ahead in the lane with a gap, and stop at the junction with your road.
      // const key = laneOf(a)
      // let limit = a.toward ? -(CORRIDOR + 6) - a.len / 2 : Infinity
      // for (const o of ambient) if (o !== a && o.live && o.s > a.s && laneOf(o) === key) limit = Math.min(limit, o.s - (o.len + a.len) / 2 - 2.5)
      // const before = a.s
      // a.s = Math.max(a.s, Math.min(a.s + a.speed * dt, limit))
      // const R = rightOf(a.dir), e = a.junction.e + a.dir.e * a.s + R.e * a.lane, n = a.junction.n + a.dir.n * a.s + R.n * a.lane
      // a.obj.position.set(e, 0, -n); a.obj.rotation.y = Math.atan2(-a.dir.e, a.dir.n)
      // for (const w of a.obj.userData.wheels || []) w.userData.spin.rotation.x -= (a.s - before) / w.userData.r
      // if (Math.hypot(e - pe, n - pn) > RADIUS + 40 || a.s > 300) { a.live = false; a.obj.visible = false }
    // }
  // }
  // Live street tiles around the player, keyed by their index along the road.
  const live = new Map(), RADIUS = 380
  function makeTile(k) {
    const obj = streetTemplates[Math.floor(hash(k, 7) * streetTemplates.length)].clone()
    obj.position.set(0, 0, -(k + .5) * BLOCK)
    // Fill in the people and parked danfos from the pool.
    const hosts = []; obj.traverse(o => { if (o.userData.specs) hosts.push(o) })
    const people = [], spawned = []
    for (const host of hosts) for (const sp of host.userData.specs) {
      const o = acquire(sp); host.add(o); spawned.push(o)
      if (sp.type === 'danfo') for (const r of o.userData.riders || []) { r.userData.mode = 'agbero'; people.push(r) } else people.push(o)
    }
    obj.userData.people = people; obj.userData.spawned = spawned; obj.userData.key = k
    root.add(obj); return obj
  }
  function syncTiles(z) {
    const want = new Set()
    for (let k = Math.floor((z - RADIUS) / BLOCK); k <= Math.floor((z + RADIUS) / BLOCK); k++) want.add(k)
    for (const [k, o] of live) if (!want.has(k)) { root.remove(o); for (const p of o.userData.spawned) release(p); live.delete(k) }
    let built = 0
    for (const k of want) if (!live.has(k) && built++ < 3) live.set(k, makeTile(k))
  }

  const tmp = new T.Vector3()
  return {
    root,
    materials: { road, pavement },
    // Place the world so the player's road runs straight ahead (-z) from the origin.
    update({ road: rd, z, t, dt, speed, mode }) {
      const P = worldAt(rd, z), phi = Math.atan2(rd.de, rd.dn)
      root.rotation.y = phi
      tmp.set(P.e, 0, -P.n).applyAxisAngle(T.Object3D.DEFAULT_UP, phi); root.position.set(-tmp.x, 0, -tmp.z)
      syncTiles(z)
      // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back the city grid, junctions and cross-street traffic.
      // updateAmbient(rd, z, t, dt, P.e, P.n)
      // People: animate those near you; hawkers turn to you when you slow down.
      for (const o of live.values()) {
        const dx = o.position.x - P.e, dn = -o.position.z - P.n, near = dx * dx + dn * dn < 150 * 150
        for (const p of o.userData.people) {
          // Only people within about 100 m are drawn (and animated).
          let show = near
          if (near) { p.getWorldPosition(tmp); show = tmp.z < 25 && tmp.z > -100 && Math.abs(tmp.x) < 60 }
          p.visible = show
          if (!show) continue
          const m = p.userData.mode, walk = p.userData.walk
          if (walk) {
            const step = walk.dir * walk.speed * dt
            // Walk along their own pavement (or footbridge), in the frame they were laid out in.
            let mx = 0, mz = 0
            if (walk.axis === 'x') { walk.lx += step; if (walk.lx > 25) walk.lx = -25; if (walk.lx < -25) walk.lx = 25; mx = walk.dir }
            else { const hl = walk.half || INNER; walk.lz -= step; if (walk.lz < -hl) walk.lz = hl; if (walk.lz > hl) walk.lz = -hl; mz = -walk.dir }
            const f = walk.frame; p.position.x = f[0] * walk.lx + f[2] * walk.lz + f[4]; p.position.z = f[1] * walk.lx + f[3] * walk.lz + f[5]
            p.rotation.y = Math.atan2(-(f[0] * mx + f[2] * mz), -(f[1] * mx + f[3] * mz))
            kit.animatePerson(p, t, 'walk', walk.speed)
          } else if (m === 'hawker') {
            p.getWorldPosition(tmp); const close = mode === 'drive' && Math.abs(speed) < 15 && tmp.z > -18 && tmp.z < 6 && Math.abs(tmp.x) < 18
            kit.animatePerson(p, t, close ? 'hawker' : 'idle')
          } else if (m) kit.animatePerson(p, t, m === 'sit' ? 'idle' : m)
          for (const s of p.children) if (s.userData.bubble) { const bb = s.userData.bubble; s.visible = bb.hawker ? Math.abs(speed) < 15 : (t + bb.offset) % 6 < 2.6 }
        }
      }
      return phi
    },
    setNight(glow) { for (let f = 2; f <= 6; f++) for (const m of facadeMats[f]) m.emissiveIntensity = glow * 1.15; glassTower.emissiveIntensity = glow * .7 },
    setWet(rain) { road.roughness = .92 - rain * .58; road.envMapIntensity = 1 + rain * 1.5; pavement.roughness = .95 - rain * .45 },
    dispose() { scene.remove(root); for (const m of signMats.values()) m.dispose(); for (const m of bubbleMats.values()) m.dispose() },
  }
}
