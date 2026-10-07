import * as T from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rand } from './textures.js'

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const tmp = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), scl = new T.Vector3()

// Untextured, opaque, non-glowing standard materials can be folded into shared vertex-colour
// materials, grouped by surface finish and by the LOD/shadow flags they carry.
const plainColour = m => m.type === 'MeshStandardMaterial' && !m.map && !m.transparent && !m.vertexColors && m.emissive.getHex() === 0 && !m.userData.tail && !m.userData.keep
const colourMaterials = new Map()
function sharedColourMaterial(m) {
  const rough = Math.round(m.roughness * 4) / 4, metal = m.metalness > .5 ? 1 : 0, key = `${rough}:${metal}:${m.side}:${!!m.userData.detail}:${!!m.userData.noShadow}`
  if (!colourMaterials.has(key)) {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: m.side })
    mat.userData = { detail: m.userData.detail, noShadow: m.userData.noShadow, shared: true }
    colourMaterials.set(key, mat)
  }
  return colourMaterials.get(key)
}

// Collects static geometry per material and merges it into one mesh per material,
// keeping draw calls low for vehicles and street segments.
export class Batch {
  constructor() { this.parts = new Map() }
  add(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    g.clearGroups()
    tmp.compose(pos.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), scl.set(sx, sy, sz)); g.applyMatrix4(tmp)
    if (!this.parts.has(material)) this.parts.set(material, [])
    this.parts.get(material).push(g); geo.dispose()
    return this
  }
  build(parent, { cast = true, receive = true } = {}) {
    // Plain-coloured parts (trim, poles, kerbs, seats…) share a few vertex-coloured materials,
    // so a car or a street block costs a handful of draw calls instead of one per colour.
    for (const [material, list] of [...this.parts]) {
      if (!plainColour(material)) continue
      const target = sharedColourMaterial(material)
      const c = material.color
      for (const g of list) { const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new T.BufferAttribute(col, 3)) }
      this.parts.delete(material)
      if (!this.parts.has(target)) this.parts.set(target, [])
      this.parts.get(target).push(...list)
    }
    for (const [material, list] of this.parts) {
      let geo = mergeGeometries(list, false)
      if (material.userData.smooth) { const creased = toCreasedNormals(geo, .85); geo.dispose(); geo = creased }
      const mesh = new T.Mesh(geo, material)
      mesh.castShadow = cast && !material.userData.noShadow; mesh.receiveShadow = receive; mesh.userData.owned = true; mesh.userData.detail = !!material.userData.detail; parent.add(mesh)
      for (const g of list) g.dispose()
    }
    this.parts.clear(); return parent
  }
}

// Box with UVs scaled to world metres so tiled photo textures keep a constant size.
export function boxGeo(w, h, d, uvScale = 0) {
  const g = new T.BoxGeometry(w, h, d)
  if (uvScale) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / uvScale, uv.getY(k) * dims[f][1] / uvScale) }
  }
  return g
}

export function createModelKit(tex, city) {
  const mats = new Map(), geos = new Map()
  const M = (key, make) => { if (!mats.has(key)) mats.set(key, make()); return mats.get(key) }
  const G = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key) }
  const std = (color, roughness = .75, metalness = 0, extra = {}) => M(`s:${color}:${roughness}:${metalness}:${extra.emissive || ''}`, () => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra }))
  // Paint and glass use the standard material: the physical clearcoat shader cost seconds of start-up compile. Low roughness and
  // strong reflections keep the polished look.
  const paint = color => M(`p:${color}`, () => { const m = new T.MeshStandardMaterial({ color, roughness: .28, metalness: .2, envMapIntensity: .9 }); m.userData.smooth = true; return m })
  const textured = (key, map, extra = {}) => M(`t:${key}`, () => new T.MeshStandardMaterial({ map: typeof map === 'function' ? map() : map, roughness: .55, ...extra }))
  // Tinted see-through glass for hollow cabins; opaque dark glass for solid bodies.
  const glass = M('glass', () => new T.MeshStandardMaterial({ color: '#1d2a30', roughness: .03, metalness: .1, side: T.DoubleSide, envMapIntensity: 1.8, transparent: true, opacity: .5, depthWrite: false }))
  const glassDark = M('glassDark', () => new T.MeshStandardMaterial({ color: '#141d22', roughness: .04, metalness: .2, side: T.DoubleSide, envMapIntensity: 2 }))
  const chrome = std('#d9dee0', .18, 1), rubber = std('#161616', .92), trim = std('#1c1d1f', .6), headlamp = std('#fff9e6', .2, 0, { emissive: '#fff4cf', emissiveIntensity: .5 })
  const taillamp = std('#8f0d14', .3, 0, { emissive: '#ff1d1d', emissiveIntensity: .45 }), indicator = std('#e88f1c', .3, 0, { emissive: '#ff9a1f', emissiveIntensity: .3 })
  taillamp.userData.tail = true
  const paintDouble = color => M(`pd:${color}`, () => new T.MeshStandardMaterial({ color, roughness: .28, metalness: .2, envMapIntensity: .9, side: T.DoubleSide }))
  const decal = (key, make, extra = {}) => M(`d:${key}`, () => { const map = make(); const mat = new T.MeshStandardMaterial({ map, transparent: true, alphaTest: .05, roughness: .35, metalness: .6, ...extra }); mat.userData.detail = mat.userData.noShadow = true; return mat })
  // Rear lamp cluster: its texture doubles as the emissive map, so brake lights can glow per vehicle.
  const tailMat = style => M(`tail:${style}`, () => { const map = tex.tailLight(style); const m = new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .35, roughness: .3 }); m.userData.tail = true; return m })
  const seatMat = std('#2b2622', .9), dashMat = std('#151515', .7)
  for (const mat of [seatMat, dashMat, chrome, indicator]) mat.userData.detail = true
  for (const mat of [seatMat, dashMat, glass, glassDark, chrome, indicator, headlamp]) mat.userData.noShadow = true
  const plateMats = [0, 1, 2, 3, 4, 5].map(i => textured(`plate${i}`, city === 'Lagos'
    ? tex.plate(`${['LSR', 'KJA', 'EKY', 'AAA', 'LND', 'FKJ'][i]} ${100 + Math.floor(rand(i) * 899)} ${['AB', 'XA', 'GG', 'KT', 'EP', 'YY'][i]}`)
    : tex.plate(`${['ABJ', 'KUJ', 'GWA', 'BWR', 'ABC', 'RBC'][i]} ${100 + Math.floor(rand(i) * 899)} ${['AA', 'FC', 'TY', 'KD', 'MN', 'BC'][i]}`, 'FCT ABUJA', 'CENTRE OF UNITY')))

  function extrude(points, width, bevel = .05, arches = null) {
    const s = new T.Shape()
    if (arches) {
      // Bottom edge with wheel arches cut out, then the supplied upper outline.
      const { y, wheels, R, cy } = arches, [x0] = points[0]
      s.moveTo(x0, y)
      for (const wx of wheels) { s.lineTo(wx - R, y); s.lineTo(wx - R, cy); s.absarc(wx, cy, R, Math.PI, 0, true); s.lineTo(wx + R, y) }
      for (const [x, py] of points.slice(1)) s.lineTo(x, py)
    } else { s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p) }
    s.closePath()
    const depth = Math.max(.01, width - bevel * 2)
    const g = new T.ExtrudeGeometry(s, { depth, steps: 6, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 })
    g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2)
    return g
  }
  // Flat panel tilted between two (length, height) profile points.
  function slopedPanel(b, material, from, to, width, lift = .1) {
    const dz = -(to[0] - from[0]), dy = to[1] - from[1], len = Math.hypot(dz, dy), th = Math.atan2(dz, dy)
    const cz = -(from[0] + to[0]) / 2, cy = (from[1] + to[1]) / 2
    b.add(new T.PlaneGeometry(width, len), material, 0, cy + Math.abs(Math.sin(th)) * lift, cz - Math.cos(th) * lift * Math.sign(dz || 1), th)
  }
  function sideDecal(b, material, x, y, z, w, h) {
    b.add(new T.PlaneGeometry(w, h), material, x, y, z, 0, Math.PI / 2)
    b.add(new T.PlaneGeometry(w, h), material, -x, y, z, 0, -Math.PI / 2)
  }
  function wheel(r, w, rimColor = '#c8cdd0', style = 'steel', side = 1) {
    const g = new T.Group(), spin = new T.Group(); g.add(spin)
    const tire = new T.Mesh(G(`tire${r}${w}`, () => { const h = w / 2, pts = [[r * .62, -h], [r * .9, -h - .005], [r * .98, -h * .8], [r, -h * .4], [r, h * .4], [r * .98, h * .8], [r * .9, h + .005], [r * .62, h]].map(([a, b]) => new T.Vector2(a, b)); return new T.LatheGeometry(pts, 28).rotateZ(Math.PI / 2) }), rubber)
    const rim = new T.Mesh(G(`rim${r}${w}`, () => new T.CylinderGeometry(r * .64, r * .64, w + .01, 16).rotateZ(Math.PI / 2)), std(rimColor, .25, .9))
    const face = new T.Mesh(G(`face${r}`, () => new T.CircleGeometry(r * .66, 24)), M(`rimFace:${style}`, () => new T.MeshStandardMaterial({ map: tex.rimFace(style), transparent: true, alphaTest: .1, roughness: .25, metalness: .85 })))
    face.position.x = side * (w / 2 + .012); face.rotation.y = side * Math.PI / 2
    const lip = new T.Mesh(G(`lip${r}`, () => new T.TorusGeometry(r * .65, .016, 6, 28).rotateY(Math.PI / 2)), chrome); lip.position.x = side * (w / 2 + .014)
    void rim; lip.userData.detail = true
    tire.castShadow = true; spin.add(tire, face, lip); g.userData.spin = spin; g.userData.r = r
    return g
  }
  const shadowMat = M('contactShadow', () => new T.MeshBasicMaterial({ map: tex.canvasTexture(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w) }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  function finish(root, b, wheels, extra = {}) {
    b.build(root)
    const sl = (extra.length || 4.5) + .7, sw = (extra.width || .8) + .6
    const shadow = new T.Mesh(G(`shadow${sl.toFixed(1)}:${sw.toFixed(1)}`, () => new T.PlaneGeometry(sw, sl).rotateX(-Math.PI / 2)), shadowMat); shadow.position.y = .025; shadow.renderOrder = -1; root.add(shadow)
    root.userData.wheels = []
    for (const [x, y, z, r, w, front] of wheels) { const wh = wheel(r, w, extra.rim, extra.rimStyle, Math.sign(x) || 1); wh.position.set(x, y, z); wh.userData.front = front; root.add(wh); root.userData.wheels.push(wh) }
    Object.assign(root.userData, extra)
    return root
  }
  // Bend the boxy body into a car: taper the nose and tail in plan view, pull the cabin in towards
  // the roof (tumblehome) and crown the bonnet, roof and boot. Applied to every part so glass,
  // lamps and trim stay attached to the panels.
  function shapeBody(b, { L, W, belt, roof, crown, taper, tumble }) {
    const hw = W / 2, smooth = t => t * t * (3 - 2 * t)
    for (const list of b.parts.values()) for (const g of list) {
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i)
        const z = p.getZ(i), zn = Math.min(1, Math.abs(z) / (L / 2)), up = clamp((y - belt + .04) / (roof - belt), 0, 1)
        x *= 1 - taper * zn ** 4 - tumble * up
        y -= crown * Math.min(1, (x / hw) ** 2) * smooth(clamp((y - belt + .15) / .3, 0, 1))
        p.setXY(i, x, y)
      }
      p.needsUpdate = true; g.computeBoundingSphere()
    }
  }
  function slopedBox(b, mat, from, to, x, w, d) {
    const dz = -(to[0] - from[0]), dy = to[1] - from[1], len = Math.hypot(dz, dy)
    b.add(boxGeo(w, len, d), mat, x, (from[1] + to[1]) / 2, -(from[0] + to[0]) / 2, Math.atan2(dz, dy))
  }
  // Flat shape on both flanks of the car, readable from either side.
  function flankShape(b, mat, pts, x) {
    for (const sx of [-1, 1]) b.add(new T.ShapeGeometry(new T.Shape(pts.map(([u, v]) => new T.Vector2(u, v)))).rotateY(Math.PI / 2), mat, sx * x)
  }
  const front = (b, geo, mat, x, y, z) => b.add(geo, mat, x, y, z, 0, Math.PI, 0)
  const lampShape = (pts, sx) => new T.ShapeGeometry(new T.Shape(pts.map(([u, v]) => new T.Vector2(u * sx, v))))

  // 0 Peugeot 504 · 1 Mercedes-Benz 190E (W201) · 2 Toyota Camry (XV30) · 3 Dodge Challenger
  // 4 Toyota Corolla (E120) · 5 Honda Accord "Evil Spirit" (8th gen) · 6 Lexus RX 350 (AL10) · 7 Mercedes-AMG G63 (W463)
  const SEDANS = {
    0: { L: 4.5, W: 1.72, belt: .86, roof: 1.42, hood: 1.25, trunk: 1.0, ws: .55, rw: .42, clear: .26, r: .32, overhang: .85, bevel: .04, rim: 'hubcap', doors: 4, cq: .26 },
    1: { L: 4.45, W: 1.7, belt: .86, roof: 1.39, hood: 1.2, trunk: .95, ws: .6, rw: .5, clear: .22, r: .31, overhang: .8, bevel: .04, rim: 'bundt', doors: 4, cq: .2 },
    2: { L: 4.8, W: 1.8, belt: .92, roof: 1.46, hood: 1.15, trunk: .95, ws: .82, rw: .62, clear: .22, r: .33, overhang: .9, bevel: .08, rim: 'fivespoke', doors: 4, cq: .16 },
    3: { L: 5.0, W: 1.93, belt: .92, roof: 1.34, hood: 1.6, trunk: .95, ws: .85, rw: .55, clear: .2, r: .36, overhang: .95, bevel: .06, rim: 'split', doors: 2, cq: .34 },
    4: { L: 4.53, W: 1.7, belt: .9, roof: 1.47, hood: 1.05, trunk: .85, ws: .8, rw: .6, clear: .2, r: .31, overhang: .85, bevel: .08, rim: 'fivespoke', doors: 4, cq: .16 },
    5: { L: 4.93, W: 1.84, belt: .95, roof: 1.47, hood: 1.2, trunk: .9, ws: .88, rw: .68, clear: .2, r: .34, overhang: .95, bevel: .09, rim: 'split', doors: 4, cq: .14 },
    6: { L: 4.77, W: 1.89, belt: 1.08, roof: 1.72, hood: 1.1, trunk: .12, ws: .82, rw: .5, clear: .32, r: .38, overhang: .9, bevel: .1, rim: 'fivespoke', doors: 4, cq: .3, crown: .05, taper: .1, tumble: .1 },
    7: { L: 4.82, W: 1.93, belt: 1.13, roof: 1.98, hood: 1.2, trunk: .04, ws: .2, rw: .04, clear: .38, r: .41, overhang: .72, bevel: .03, rim: 'split', doors: 4, cq: .1, crown: .008, taper: .015, tumble: .03 },
    // 8 Lamborghini Huracán · 9 Ferrari F8 Tributo · 10 Bugatti Chiron: mid-engined, so a short nose, a cab-forward bubble and a long engine deck.
    8: { L: 4.52, W: 1.98, belt: .72, roof: 1.15, hood: 1.1, trunk: 1.05, ws: 1.0, rw: .9, clear: .12, r: .33, overhang: .95, bevel: .05, rim: 'split', doors: 2, cq: .45, crown: .03, taper: .14, tumble: .2 },
    9: { L: 4.61, W: 1.98, belt: .74, roof: 1.19, hood: 1.15, trunk: 1.05, ws: .95, rw: .85, clear: .12, r: .34, overhang: .95, bevel: .06, rim: 'fivespoke', doors: 2, cq: .42, crown: .035, taper: .13, tumble: .18 },
    10: { L: 4.54, W: 2.04, belt: .78, roof: 1.21, hood: 1.2, trunk: .95, ws: .9, rw: .75, clear: .12, r: .36, overhang: .92, bevel: .08, rim: 'split', doors: 2, cq: .4, crown: .04, taper: .12, tumble: .17 },
  }
  function sedan(model, color, { taxi = false, plate = 0, driver = true } = {}) {
    const s = SEDANS[model] || SEDANS[0], { L, W, belt, roof, hood, trunk, ws, rw, clear, r, bevel } = s
    const root = new T.Group(), b = new Batch(), body = paint(color)
    const wf = L / 2 - s.overhang, wr = -L / 2 + s.overhang, R = r + .07
    b.add(extrude([[-L / 2, clear], [L / 2, clear], [L / 2 + .03, clear + .26], [L / 2 - .06, belt - .07], [L / 2 - hood * .35, belt - .01], [L / 2 - hood, belt], [-L / 2 + trunk, belt + .01], [-L / 2 + .05, belt - .03], [-L / 2 - .02, clear + .26]], W, bevel, { y: clear, wheels: [wr, wf], R, cy: r }), body)
    const wsBase = [L / 2 - hood, belt], roofF = [L / 2 - hood - ws, roof], roofR = [-L / 2 + trunk + rw, roof], rwBase = [-L / 2 + trunk, belt]
    const cw = W * .86, hx = cw / 2 - .035, midZ = -(roofF[0] + roofR[0]) / 2, bZ = midZ + .1

    // Hollow greenhouse: roof, pillars and glass, so the cabin and driver show through.
    b.add(new T.BoxGeometry(cw, .07, roofF[0] - roofR[0] + .1, 8, 1, 6), body, 0, roof, midZ)
    for (const sx of [-1, 1]) { slopedBox(b, body, wsBase, roofF, sx * hx, .07, .07); slopedBox(b, body, rwBase, roofR, sx * hx, .07, .07); b.add(boxGeo(.07, roof - belt, .09), body, sx * hx, (roof + belt) / 2, bZ) }
    const cq = s.cq
    flankShape(b, paintDouble(color), [[rwBase[0], belt], [rwBase[0] + cq + .12, belt], [roofR[0] + cq, roof], [roofR[0], roof]], hx + .004)
    flankShape(b, glass, [[rwBase[0] + cq + .12, belt], [wsBase[0], belt], [roofF[0], roof], [roofR[0] + cq, roof]], hx)
    slopedPanel(b, glass, wsBase, roofF, cw - .06, 0); slopedPanel(b, glass, rwBase, roofR, cw - .06, 0)
    // Interior: dashboard, seats, steering wheel, driver
    const steerZ = -(wsBase[0] - .5)
    b.add(boxGeo(cw - .08, .14, .4), dashMat, 0, belt + .05, -(wsBase[0] - .2))
    const seatH = (roof - belt) * .6
    for (const sx of [-1, 1]) { b.add(boxGeo(.46, seatH, .1), seatMat, sx * cw * .24, belt + seatH / 2 - .04, steerZ + .62); b.add(boxGeo(.24, .12, .08), seatMat, sx * cw * .24, belt + seatH + .04, steerZ + .64) }
    if (s.doors === 4) b.add(boxGeo(cw - .14, .42, .12), seatMat, 0, belt + .14, -(rwBase[0] + .28))
    b.add(new T.TorusGeometry(.16, .022, 6, 18), dashMat, -cw * .24, belt + .2, steerZ, -.35)
    const riders = []
    if (driver) {
      const sc = clamp((roof - belt) / .66, .66, .88), dx = -cw * .24, dz = steerZ + .5, n = model * 17 + plate * 5 + 3
      const skinM = std(SKIN[n % SKIN.length], .7), shirt = std(CLOTH[(n * 3) % CLOTH.length], .9)
      b.add(new T.CylinderGeometry(.19 * sc, .16 * sc, .42 * sc, 8).scale(1, 1, .62), shirt, dx, belt + .1, dz)
      b.add(new T.SphereGeometry(.11 * sc, 10, 8), skinM, dx, belt + .1 + .36 * sc, dz - .02)
      b.add(new T.SphereGeometry(.115 * sc, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std('#120d0a', .95), dx, belt + .12 + .37 * sc, dz - .02)
      for (const sx of [-1, 1]) b.add(new T.CapsuleGeometry(.05 * sc, .36 * sc, 3, 6), shirt, dx + sx * .2 * sc, belt + .14, dz - .22, 1.2)
    }

    // Shared details: door shut-lines, handles, mirrors, wipers, plates, exhaust
    const fz = -L / 2 - .03, rz = L / 2 + .03, sideX = W / 2 + .004
    const seams = s.doors === 4 ? [-(wsBase[0] - .06), bZ, -(rwBase[0] + .12)] : [-(wsBase[0] - .06), -(rwBase[0] + .3)]
    for (const sx of [-1, 1]) {
      for (const z of seams) b.add(boxGeo(.006, belt - clear - .14, .012), trim, sx * sideX, (belt + clear) / 2 + .03, z)
      for (const z of s.doors === 4 ? [bZ - .14, seams[2] - .14] : [seams[1] - .16]) b.add(boxGeo(.025, .035, .13), chrome, sx * (sideX + .008), belt - .08, z)
      b.add(boxGeo(.03, .03, .1), trim, sx * (W / 2 + .03), belt + .08, -(wsBase[0] - .12)); b.add(boxGeo(.08, .1, .16), model === 1 || model === 0 ? trim : body, sx * (W / 2 + .1), belt + .12, -(wsBase[0] - .12))
      b.add(boxGeo(.42, .012, .025), trim, sx * .2, belt + .05, -(wsBase[0] - .08), 0, 0, sx * .08)
    }
    const pm = plateMats[plate % plateMats.length]
    front(b, new T.PlaneGeometry(.52, .14), pm, 0, clear + .3, fz - .1); b.add(new T.PlaneGeometry(.52, .14), pm, 0, clear + .32, rz + .1)
    if (model !== 3 && model !== 7 && model < 8) b.add(new T.CylinderGeometry(.035, .035, .2, 10).rotateX(Math.PI / 2), chrome, -W * .3, clear + .04, rz)

    if (model === 0) {
      // Peugeot 504: trapezoid lamps, barred grille, lion shield, chrome bumpers with rubber overriders, drip rails
      for (const sx of [-1, 1]) {
        front(b, lampShape([[-.2, -.075], [.2, -.075], [.15, .075], [-.22, .075]], sx), chrome, sx * W * .32, belt - .16, fz - .005)
        front(b, lampShape([[-.17, -.06], [.17, -.06], [.13, .06], [-.19, .06]], sx), headlamp, sx * W * .32, belt - .16, fz - .012)
        b.add(boxGeo(.07, .18, .1), trim, sx * .38, clear + .12, fz - .1); b.add(boxGeo(.07, .18, .1), trim, sx * .38, clear + .12, rz + .1)
        b.add(new T.PlaneGeometry(.34, .14), tailMat('504'), sx * W * .3, belt - .12, rz)
        b.add(boxGeo(.02, .02, roofF[0] - roofR[0]), chrome, sx * (cw / 2 + .005), roof + .03, midZ)
        b.add(boxGeo(.012, .02, L * .86), chrome, sx * (sideX + .002), belt - .14, 0)
      }
      b.add(boxGeo(W * .3, .14, .04), trim, 0, belt - .16, fz - .01)
      for (let k = 0; k < 4; k++) b.add(boxGeo(W * .3, .012, .05), chrome, 0, belt - .215 + k * .035, fz - .015)
      front(b, new T.PlaneGeometry(.09, .1), decal('emb-peugeot', () => tex.emblem('peugeot')), 0, belt - .04, fz - .02)
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .06, .12, .12), chrome, 0, clear + .12, z)
      b.add(new T.PlaneGeometry(.22, .055), decal('badge-504', () => tex.badge('504 GL')), W * .26, belt - .02, rz + .002)
    } else if (model === 1) {
      // Mercedes-Benz 190E: upright chrome grille with the three-pointed star, wide lamps, "Sacco" side cladding, ribbed tail lamps
      b.add(boxGeo(.38, .25, .06), chrome, 0, belt - .13, fz - .02)
      b.add(boxGeo(.32, .2, .06), trim, 0, belt - .13, fz - .03)
      for (let x = -.12; x <= .121; x += .04) b.add(boxGeo(.012, .2, .07), chrome, x, belt - .13, fz - .035)
      // Bonnet star ornament
      b.add(new T.TorusGeometry(.045, .007, 6, 20), chrome, 0, belt + .06, fz + .08)
      for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * Math.PI * 2 / 3; b.add(boxGeo(.008, .045, .006), chrome, Math.cos(a) * .022, belt + .06 + Math.sin(a) * .022, fz + .08, 0, 0, a - Math.PI / 2) }
      b.add(new T.CylinderGeometry(.006, .01, .04), chrome, 0, belt + .005, fz + .08)
      front(b, new T.PlaneGeometry(.09, .09), decal('emb-merc', () => tex.emblem('merc')), 0, belt - .13, fz - .07)
      for (const sx of [-1, 1]) {
        b.add(boxGeo(W * .25, .17, .04), chrome, sx * W * .29, belt - .14, fz - .012)
        b.add(boxGeo(W * .21, .14, .04), headlamp, sx * W * .28, belt - .14, fz - .02)
        b.add(boxGeo(.07, .14, .04), indicator, sx * W * .43, belt - .14, fz - .02)
        b.add(boxGeo(.03, .19, (wf - wr) - 2 * R - .1), std('#6b6f72', .8), sx * (sideX + .012), clear + .2, -(wf + wr) / 2)
        b.add(new T.PlaneGeometry(.5, .17), tailMat('ribbed'), sx * W * .27, belt - .13, rz)
      }
      for (const z of [fz - .03, rz + .03]) b.add(boxGeo(W + .06, .2, .14), std('#6b6f72', .8), 0, clear + .15, z)
      b.add(new T.PlaneGeometry(.08, .08), decal('emb-merc', () => tex.emblem('merc')), 0, belt - .01, rz + .002)
      b.add(new T.PlaneGeometry(.24, .055), decal('badge-190', () => tex.badge('190 E 2.3')), W * .28, belt - .03, rz + .002)
    } else if (model === 2) {
      // Toyota Camry: body-coloured bumpers, chrome grille bar with the Toyota ellipses, swept lamps, fog lamps, wraparound tail lamps
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .04, .24, .16), body, 0, clear + .14, z)
      b.add(boxGeo(W * .5, .08, .05), trim, 0, clear + .08, fz - .1)
      b.add(boxGeo(W * .4, .13, .04), trim, 0, belt - .15, fz - .01); b.add(boxGeo(W * .44, .035, .05), chrome, 0, belt - .14, fz - .02)
      front(b, new T.PlaneGeometry(.13, .09), decal('emb-toyota', () => tex.emblem('toyota')), 0, belt - .14, fz - .05)
      for (const sx of [-1, 1]) {
        front(b, lampShape([[-.24, -.075], [.2, -.09], [.25, .05], [-.13, .085]], sx), chrome, sx * W * .32, belt - .14, fz - .006)
        front(b, lampShape([[-.21, -.06], [.18, -.075], [.22, .04], [-.12, .07]], sx), headlamp, sx * W * .32, belt - .14, fz - .012)
        front(b, new T.CircleGeometry(.05, 14), headlamp, sx * W * .36, clear + .1, fz - .1)
        b.add(new T.PlaneGeometry(.42, .14), tailMat('camry'), sx * W * .3, belt - .12, rz)
        b.add(new T.PlaneGeometry(.2, .12), tailMat('camry'), sx * (sideX + .003), belt - .12, rz - .12, 0, sx * Math.PI / 2)
      }
      b.add(new T.PlaneGeometry(.11, .07), decal('emb-toyota', () => tex.emblem('toyota')), 0, belt - .02, rz + .002)
      b.add(new T.PlaneGeometry(.22, .05), decal('badge-camry', () => tex.badge('CAMRY')), -W * .28, belt - .03, rz + .002)
    } else if (model === 3) {
      // Dodge Challenger: black grille with quad halo lamps, bonnet bulge and scoops, stripes, full-width tail bar, ducktail, dual exhaust
      b.add(boxGeo(W * .88, .2, .05), trim, 0, belt - .16, fz - .01)
      for (const sx of [-1, 1]) for (const k of [.3, .42]) {
        front(b, new T.CircleGeometry(.085, 18), dashMat, sx * W * k, belt - .16, fz - .04)
        front(b, new T.TorusGeometry(.068, .013, 6, 20), headlamp, sx * W * k, belt - .16, fz - .05)
        front(b, new T.CircleGeometry(.035, 12), headlamp, sx * W * k, belt - .16, fz - .045)
      }
      front(b, new T.PlaneGeometry(.12, .06), decal('emb-rt', () => tex.emblem('rt')), -W * .15, belt - .16, fz - .04)
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .04, .2, .16), body, 0, clear + .13, z)
      b.add(boxGeo(W * .45, .06, hood * .7), body, 0, belt + .02, -(L / 2 - hood * .5))
      for (const sx of [-1, 1]) { b.add(boxGeo(.14, .045, .2), trim, sx * .2, belt + .05, -(L / 2 - hood * .3)); b.add(boxGeo(.16, .012, hood - .05), trim, sx * .22, belt + .056, -(L / 2 - hood / 2)); b.add(boxGeo(.16, .012, roofF[0] - roofR[0]), trim, sx * .22, roof + .04, midZ); b.add(boxGeo(.16, .012, trunk - .1), trim, sx * .22, belt + .02, -(-L / 2 + trunk / 2)) }
      b.add(new T.PlaneGeometry(W * .9, .13), tailMat('bar'), 0, belt - .1, rz)
      b.add(boxGeo(W * .9, .04, .1), body, 0, belt + .03, rz - .06)
      for (const sx of [-1, 1]) b.add(new T.CylinderGeometry(.055, .055, .14, 14).rotateX(Math.PI / 2), chrome, sx * W * .33, clear + .05, rz + .02)
      b.add(new T.CylinderGeometry(.065, .065, .02, 16).rotateZ(Math.PI / 2), chrome, sideX + .01, belt - .1, -(rwBase[0] - .25))
      b.add(new T.PlaneGeometry(.42, .07), decal('badge-chall', () => tex.badge('CHALLENGER')), 0, belt - .2, rz + .002)
    } else if (model === 4) {
      // Toyota Corolla: rounded nose with a thin chrome grille, swept lamps, body-coloured bumpers
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .03, .22, .15), body, 0, clear + .13, z)
      b.add(boxGeo(W * .36, .1, .04), trim, 0, belt - .13, fz - .01); b.add(boxGeo(W * .38, .025, .05), chrome, 0, belt - .1, fz - .02)
      b.add(boxGeo(W * .42, .07, .05), trim, 0, clear + .08, fz - .1)
      front(b, new T.PlaneGeometry(.11, .08), decal('emb-toyota', () => tex.emblem('toyota')), 0, belt - .12, fz - .05)
      for (const sx of [-1, 1]) {
        front(b, lampShape([[-.2, -.06], [.17, -.075], [.21, .045], [-.11, .07]], sx), chrome, sx * W * .31, belt - .12, fz - .006)
        front(b, lampShape([[-.18, -.05], [.15, -.064], [.19, .035], [-.1, .06]], sx), headlamp, sx * W * .31, belt - .12, fz - .012)
        b.add(new T.PlaneGeometry(.36, .13), tailMat('camry'), sx * W * .3, belt - .1, rz)
      }
      b.add(new T.PlaneGeometry(.1, .065), decal('emb-toyota', () => tex.emblem('toyota')), 0, belt - .02, rz + .002)
      b.add(new T.PlaneGeometry(.24, .05), decal('badge-corolla', () => tex.badge('COROLLA')), -W * .27, belt - .03, rz + .002)
    } else if (model === 5) {
      // Honda Accord "Evil Spirit": wide chrome grille bar with the Honda H, sharp lamps, boomerang tail lamps, chrome window line
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .04, .24, .16), body, 0, clear + .14, z)
      b.add(boxGeo(W * .5, .15, .04), trim, 0, belt - .14, fz - .01)
      b.add(boxGeo(W * .56, .05, .06), chrome, 0, belt - .08, fz - .025)
      front(b, new T.PlaneGeometry(.12, .1), decal('emb-honda', () => tex.emblem('honda')), 0, belt - .1, fz - .06)
      b.add(boxGeo(W * .55, .08, .05), trim, 0, clear + .08, fz - .1)
      for (const sx of [-1, 1]) {
        front(b, lampShape([[-.26, -.05], [.16, -.08], [.24, .06], [-.2, .07]], sx), chrome, sx * W * .33, belt - .12, fz - .006)
        front(b, lampShape([[-.23, -.04], [.14, -.068], [.21, .05], [-.18, .06]], sx), headlamp, sx * W * .33, belt - .12, fz - .012)
        front(b, new T.CircleGeometry(.045, 14), headlamp, sx * W * .38, clear + .1, fz - .1)
        b.add(new T.PlaneGeometry(.44, .15), tailMat('accord'), sx * W * .29, belt - .1, rz)
        b.add(new T.PlaneGeometry(.18, .12), tailMat('accord'), sx * (sideX + .003), belt - .1, rz - .1, 0, sx * Math.PI / 2)
      }
      b.add(boxGeo(W * .4, .04, .03), chrome, 0, belt - .02, rz + .01)
      b.add(new T.PlaneGeometry(.11, .09), decal('emb-honda', () => tex.emblem('honda')), 0, belt - .08, rz + .03)
      b.add(new T.PlaneGeometry(.26, .05), decal('badge-accord', () => tex.badge('ACCORD')), -W * .28, belt - .2, rz + .002)
    } else if (model === 6) {
      // Lexus RX 350: tall crossover, big dark grille with a chrome frame, swept lamps, roof rails, black arch cladding, LED tail lamps
      for (const z of [fz - .02, rz + .02]) b.add(boxGeo(W + .04, .3, .16), body, 0, clear + .16, z)
      b.add(boxGeo(W * .44, .3, .04), trim, 0, belt - .18, fz - .01)
      for (const [y, w] of [[belt - .03, .46], [belt - .33, .4]]) b.add(boxGeo(W * w, .03, .05), chrome, 0, y, fz - .02)
      for (let y = belt - .3; y < belt - .05; y += .05) b.add(boxGeo(W * .42, .01, .05), chrome, 0, y, fz - .025)
      front(b, new T.PlaneGeometry(.12, .09), decal('emb-lexus', () => tex.emblem('lexus')), 0, belt - .17, fz - .06)
      for (const sx of [-1, 1]) {
        front(b, lampShape([[-.25, -.05], [.14, -.07], [.22, .05], [-.2, .06]], sx), chrome, sx * W * .33, belt - .1, fz - .006)
        front(b, lampShape([[-.22, -.04], [.12, -.06], [.2, .04], [-.18, .05]], sx), headlamp, sx * W * .33, belt - .1, fz - .012)
        b.add(new T.PlaneGeometry(.4, .14), tailMat('lexus'), sx * W * .3, belt + .05, rz)
        b.add(boxGeo(.04, .04, roofF[0] - roofR[0] - .1), std('#2a2c2e', .5, .5), sx * cw * .42, roof + .07, midZ)
        for (const z of [-wf, -wr]) b.add(boxGeo(.05, .14, R * 2.1), trim, sx * (sideX + .012), clear + R + .02, z)
        b.add(boxGeo(.03, .16, (wf - wr) - 2 * R - .1), trim, sx * (sideX + .01), clear + .12, -(wf + wr) / 2)
      }
      b.add(new T.PlaneGeometry(.11, .08), decal('emb-lexus', () => tex.emblem('lexus')), 0, belt - .05, rz + .002)
      b.add(new T.PlaneGeometry(.26, .05), decal('badge-rx', () => tex.badge('RX 350')), W * .27, belt - .14, rz + .002)
      for (const sx of [-1, 1]) b.add(new T.CylinderGeometry(.04, .04, .16, 12).rotateX(Math.PI / 2), chrome, sx * W * .3, clear + .06, rz)
    } else if (model === 7) {
      // Mercedes-AMG G63: the box. Vertical-slat grille, round headlamps, indicators on the wings, fender flares,
      // side exhausts, spare wheel on the tailgate, square tail lamps.
      b.add(boxGeo(W * .5, .4, .05), trim, 0, belt - .22, fz - .01)
      for (let x = -W * .22; x <= W * .221; x += W * .044) b.add(boxGeo(.018, .38, .06), chrome, x, belt - .22, fz - .025)
      front(b, new T.PlaneGeometry(.16, .16), decal('emb-merc', () => tex.emblem('merc')), 0, belt - .2, fz - .07)
      for (const z of [fz - .03, rz + .03]) b.add(boxGeo(W + .08, .26, .2), trim, 0, clear + .12, z)
      for (const sx of [-1, 1]) {
        front(b, new T.CircleGeometry(.12, 22), chrome, sx * W * .38, belt - .2, fz - .02)
        front(b, new T.CircleGeometry(.1, 22), headlamp, sx * W * .38, belt - .2, fz - .03)
        b.add(boxGeo(.09, .06, .14), indicator, sx * W * .4, belt + .04, fz + .12)
        for (const z of [-wf, -wr]) b.add(boxGeo(.12, .08, R * 2.3), trim, sx * (sideX + .04), clear + R * 1.95, z)
        b.add(boxGeo(.05, .05, (wf - wr) - 2 * R), chrome, sx * (sideX + .04), clear + .02, -(wf + wr) / 2)
        for (const dz of [-.12, .02]) b.add(new T.CylinderGeometry(.04, .04, .12, 10).rotateZ(Math.PI / 2), chrome, sx * (sideX + .08), clear + .06, -(wf + wr) / 2 + dz - .6)
        b.add(new T.PlaneGeometry(.2, .3), tailMat('g'), sx * W * .4, belt - .14, rz)
        b.add(boxGeo(.03, .03, roofF[0] - roofR[0]), trim, sx * cw * .48, roof + .03, midZ)
      }
      // Spare wheel on the tailgate
      b.add(new T.CylinderGeometry(R + .02, R + .02, .24, 24).rotateX(Math.PI / 2), rubber, 0, belt + .12, rz + .14)
      b.add(new T.CircleGeometry(R * .7, 24), body, 0, belt + .12, rz + .262)
      b.add(new T.PlaneGeometry(.12, .12), decal('emb-merc', () => tex.emblem('merc')), 0, belt + .12, rz + .265)
      b.add(new T.PlaneGeometry(.26, .06), decal('badge-g63', () => tex.badge('G 63 AMG')), -W * .3, belt - .3, rz + .002)
    }
    if (model >= 8) {
      // Supercars: carbon splitter and big intakes up front, side intakes behind the doors, diffuser and race exhausts out back.
      b.add(boxGeo(W * .96, .04, .2), trim, 0, clear + .02, fz + .05)
      for (const sx of [-1, 1]) {
        front(b, new T.PlaneGeometry(W * .3, .16), trim, sx * W * .3, clear + .16, fz - .02)
        front(b, lampShape([[-.26, -.02], [.18, -.05], [.26, .02], [-.2, .045]], sx), headlamp, sx * W * .34, belt - .1, fz - .012)
        b.add(boxGeo(.02, .2, .5), trim, sx * (sideX + .005), (belt + clear) / 2 + .02, -(rwBase[0] - .45))
      }
      b.add(boxGeo(W * .9, .14, .12), trim, 0, clear + .08, rz + .02)
      for (let x = -W * .36; x <= W * .361; x += W * .12) b.add(boxGeo(.012, .14, .16), trim, x, clear + .08, rz + .04)
      if (model === 8) {
        // Huracán: Y-shaped lamps, thin tail bar, two big exhausts high in the middle, a small ducktail.
        b.add(new T.PlaneGeometry(W * .86, .07), tailMat('bar'), 0, belt - .08, rz)
        for (const sx of [-1, 1]) b.add(new T.CylinderGeometry(.06, .06, .12, 6).rotateX(Math.PI / 2), chrome, sx * .12, clear + .26, rz + .02)
        b.add(boxGeo(W * .8, .03, .14), body, 0, belt + .02, rz - .05, -.25)
        b.add(new T.PlaneGeometry(.3, .06), decal('badge-huracan', () => tex.badge('HURACÁN')), 0, belt - .17, rz + .002)
      } else if (model === 9) {
        // F8 Tributo: twin round tail lamps each side, stacked exhausts, a rear spoiler lip.
        for (const sx of [-1, 1]) for (const k of [.28, .4]) b.add(new T.CircleGeometry(.065, 18), taillamp, sx * W * k, belt - .08, rz + .001)
        for (const sx of [-1, 1]) b.add(new T.CylinderGeometry(.05, .05, .12, 14).rotateX(Math.PI / 2), chrome, sx * .16, clear + .2, rz + .02)
        b.add(boxGeo(W * .7, .025, .16), body, 0, belt + .03, rz - .04, -.3)
        b.add(new T.PlaneGeometry(.26, .06), decal('badge-f8', () => tex.badge('F8 TRIBUTO')), 0, belt - .2, rz + .002)
      } else {
        // Chiron: horseshoe grille, the C-shaped side curve, a full-width lamp bar and one big centre exhaust.
        front(b, new T.TorusGeometry(.2, .03, 8, 20, Math.PI), chrome, 0, clear + .32, fz - .03)
        front(b, new T.CircleGeometry(.2, 20, 0, Math.PI), trim, 0, clear + .32, fz - .02)
        for (const sx of [-1, 1]) b.add(new T.TorusGeometry(.42, .025, 6, 24, Math.PI).rotateY(sx * Math.PI / 2), chrome, sx * (sideX + .01), (belt + clear) / 2 + .02, -(wsBase[0] - .9))
        b.add(new T.PlaneGeometry(W * .92, .05), tailMat('bar'), 0, belt - .05, rz)
        b.add(new T.CylinderGeometry(.09, .09, .12, 18).rotateX(Math.PI / 2), chrome, 0, clear + .16, rz + .03)
        b.add(new T.PlaneGeometry(.24, .06), decal('badge-chiron', () => tex.badge('CHIRON')), 0, belt - .17, rz + .002)
      }
    }
    if (taxi) {
      const stripe = textured('taxi', () => tex.taxiSide())
      sideDecal(b, stripe, sideX + .002, (clear + belt) / 2 + .05, 0, L * .9, belt - clear - .1)
      b.add(boxGeo(.5, .18, .22), std('#f2b41e', .5), 0, roof + .12, midZ)
    }
    // Beltline trim: chrome on the classics, black on the newer cars.
    for (const sx of [-1, 1]) b.add(boxGeo(.02, .025, wsBase[0] - rwBase[0]), model < 2 || model === 5 ? chrome : trim, sx * (hx + .02), belt + .015, -(wsBase[0] + rwBase[0]) / 2)
    shapeBody(b, { L, W, belt, roof, crown: s.crown ?? (model === 3 ? .035 : .05), taper: s.taper ?? (model === 0 ? .05 : .08), tumble: s.tumble ?? (model === 3 ? .14 : .1) })
    return finish(root, b, [[W / 2 - .12, r, -wf, r, .24, true], [-W / 2 + .12, r, -wf, r, .24, true], [W / 2 - .12, r, -wr, r, .26, false], [-W / 2 + .12, r, -wr, r, .26, false]], { length: L, width: W, belt, kind: taxi ? 'taxi' : 'car', rimStyle: s.rim, riders })
  }

  function police() {
    const L = 5.3, W = 1.86, belt = 1.12, roof = 1.84, clear = .5, r = .4, bevel = .05
    const root = new T.Group(), batch = new Batch(), body = paint('#10151f'), white = paint('#eef1f4')
    const wf = L / 2 - .95, wr = -L / 2 + 1.15
    batch.add(extrude([[-L / 2, clear], [L / 2, clear], [L / 2 + .03, clear + .3], [L / 2 - .05, belt - .08], [L / 2 - 1.05, belt], [-L / 2 + .05, belt], [-L / 2, clear + .3]], W, bevel, { y: clear, wheels: [wr, wf], R: r + .08, cy: r + .02 }), body)
    const wsBase = [L / 2 - 1.05, belt], roofF = [L / 2 - 1.75, roof], roofR = [-.55, roof], back = [-.45, belt]
    batch.add(extrude([back, wsBase, roofF, roofR], W * .9, bevel), body)
    const gx = W * .45 + .006
    const win = new T.Shape([new T.Vector2(wsBase[0] - .15, belt + .07), new T.Vector2(roofF[0] - .03, roof - .07), new T.Vector2(roofR[0] + .05, roof - .07), new T.Vector2(back[0] + .06, belt + .07)])
    batch.add(new T.ShapeGeometry(win).rotateY(Math.PI / 2), glassDark, gx); batch.add(new T.ShapeGeometry(win).rotateY(Math.PI / 2), glassDark, -gx)
    batch.add(boxGeo(.08, roof - belt, W * .9 + .03), body, 0, (roof + belt) / 2, -.35)
    slopedPanel(batch, glassDark, [wsBase[0] - .03, belt + .04], [roofF[0] + .02, roof - .03], W * .82)
    // Open load bed with the tailgate.
    const bedStart = -.5, bedEnd = -L / 2 + .05, bedLen = bedStart - bedEnd, bz = -(bedStart + bedEnd) / 2
    batch.add(boxGeo(W - .1, .05, bedLen), trim, 0, belt - .25, bz)
    for (const sx of [-1, 1]) batch.add(boxGeo(.06, .3, bedLen), body, sx * (W / 2 - .06), belt + .12, bz)
    batch.add(boxGeo(W - .1, .3, .06), body, 0, belt + .12, -bedEnd - .03)
    // Bull bar, light bar, livery
    for (const sx of [-.32, .32]) batch.add(new T.CylinderGeometry(.04, .04, .8), trim, sx * W, clear + .4, -L / 2 - .18)
    batch.add(new T.CylinderGeometry(.04, .04, W * .8).rotateZ(Math.PI / 2), trim, 0, clear + .75, -L / 2 - .18)
    batch.add(new T.CylinderGeometry(.04, .04, W * .8).rotateZ(Math.PI / 2), trim, 0, clear + .25, -L / 2 - .2)
    for (const sx of [-1, 1]) batch.add(boxGeo(W * .24, .15, .05), headlamp, sx * W * .33, belt - .2, -L / 2 - .03)
    batch.add(boxGeo(W * .34, .2, .05), chrome, 0, belt - .22, -L / 2 - .035)
    for (const sx of [-1, 1]) batch.add(boxGeo(.16, .3, .05), taillamp, sx * (W / 2 - .12), belt - .05, L / 2 + .03)
    batch.add(boxGeo(1.25, .1, .32), trim, 0, roof + bevel + .05, -(roofF[0] + roofR[0]) / 2)
    batch.add(new T.PlaneGeometry(.52, .14), plateMats[0], 0, clear + .2, L / 2 + .06)
    const livery = textured('police', () => tex.policeSide())
    sideDecal(batch, livery, W / 2 + .006, (clear + belt) / 2 + .03, -.55, 3.2, belt - clear - .12)
    batch.add(boxGeo(W * .9, .02, .6), white, 0, roof + bevel + .002, -(roofF[0] + roofR[0]) / 2 + .2)
    const lightGeo = boxGeo(.55, .12, .26)
    const red = new T.Mesh(lightGeo, new T.MeshStandardMaterial({ color: '#ff1f35', emissive: '#ff1f35', emissiveIntensity: 2 })); red.position.set(-.33, roof + bevel + .16, -(roofF[0] + roofR[0]) / 2)
    const blue = new T.Mesh(lightGeo.clone(), new T.MeshStandardMaterial({ color: '#2570ff', emissive: '#2570ff', emissiveIntensity: 2 })); blue.position.set(.33, roof + bevel + .16, red.position.z)
    root.add(red, blue)
    // Two officers riding in the back, as on Nigerian patrol vans.
    for (const [x, z] of [[-.45, bz - .3], [.45, bz + .4]]) { const o = person({ seed: 900 + x * 10, uniform: true, seated: true }); o.position.set(x, belt - .7, z); o.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(o) }
    return finish(root, batch, [[W / 2 - .1, r, -wf, r, .3, true], [-W / 2 + .1, r, -wf, r, .3, true], [W / 2 - .1, r, -wr, r, .3, false], [-W / 2 + .1, r, -wr, r, .3, false]], { length: L, width: W, belt, kind: 'police', red, blue, rim: '#2a2d30' })
  }

  function danfo(seed = 0) {
    const L = 5.2, W = 1.95, belt = 1.12, roof = 2.02, clear = .3, r = .34, bevel = .07
    const root = new T.Group(), batch = new Batch(), body = paint('#f1b51c')
    const wf = L / 2 - .7, wr = -L / 2 + .85
    batch.add(extrude([[-L / 2, clear], [L / 2, clear], [L / 2 + .02, clear + .35], [L / 2 - .02, belt], [-L / 2 + .05, belt], [-L / 2, clear + .35]], W, bevel, { y: clear, wheels: [wr, wf], R: r + .07, cy: r }), body)
    const side = textured(`danfo${seed % 8}`, () => tex.danfoSide(seed % 8))
    sideDecal(batch, side, W / 2 + .004, (clear + belt) / 2 + .02, .1, L - .5, belt - clear - .1)
    // Hollow passenger cabin: roof, pillars, glass and a packed load of passengers.
    const hx = W / 2 - .03
    batch.add(boxGeo(W - .02, .09, L - .35), body, 0, roof, .14)
    batch.add(boxGeo(W - .04, .22, .06), body, 0, roof - .14, L / 2 - .05); batch.add(boxGeo(W - .04, .06, .06), body, 0, belt + .03, L / 2 - .05)
    for (const sx of [-1, 1]) { slopedBox(batch, body, [L / 2 - .02, belt], [L / 2 - .32, roof], sx * hx, .08, .08); batch.add(boxGeo(.08, roof - belt, .08), body, sx * hx, (roof + belt) / 2, L / 2 - .07) }
    flankShape(batch, glass, [[-L / 2 + .05, belt], [L / 2 - .02, belt], [L / 2 - .32, roof - .05], [-L / 2 + .05, roof - .05]], hx)
    batch.add(new T.PlaneGeometry(W - .1, roof - belt - .25), glass, 0, (roof + belt) / 2 - .08, L / 2 - .05)
    for (let z = -L / 2 + .9; z < L / 2 - .4; z += .95) for (const sx of [-1, 1]) batch.add(boxGeo(.04, roof - belt, .09), body, sx * (hx + .01), (roof + belt) / 2, z)
    slopedPanel(batch, glass, [L / 2 - .02, belt], [L / 2 - .32, roof], W - .1, 0)
    for (const [row, z] of [-1.25, -.25, .7, 1.65].entries()) {
      batch.add(boxGeo(W - .2, .5, .1), seatMat, 0, belt + .12, z + .32)
      for (const x of [-.58, 0, .58]) {
        if (row === 0 && x === 0) continue
        const n = seed * 13 + row * 3 + x * 10
        batch.add(new T.CylinderGeometry(.17, .15, .52, 8).scale(1, 1, .7), std(CLOTH[Math.abs(Math.round(n)) % CLOTH.length], .9), x, belt + .12, z)
        batch.add(new T.SphereGeometry(.11, 10, 8), std(SKIN[Math.abs(Math.round(n * 3)) % SKIN.length], .7), x, belt + .5, z - .02)
      }
    }
    for (const sx of [-1, 1]) { batch.add(new T.CylinderGeometry(.015, .015, .3).rotateZ(Math.PI / 2), trim, sx * (W / 2 + .15), belt + .25, -L / 2 + .45); batch.add(boxGeo(.06, .2, .14), trim, sx * (W / 2 + .3), belt + .25, -L / 2 + .45) }
    batch.add(boxGeo(W * .95, .14, .05), trim, 0, belt - .25, -L / 2 - .04)
    for (const sx of [-1, 1]) batch.add(new T.CylinderGeometry(.1, .1, .05, 14).rotateX(Math.PI / 2), headlamp, sx * W * .36, belt - .25, -L / 2 - .04)
    for (const sx of [-1, 1]) batch.add(boxGeo(.14, .3, .05), taillamp, sx * (W / 2 - .12), belt - .1, L / 2 + .04)
    batch.add(boxGeo(W + .04, .16, .14), trim, 0, clear + .12, -L / 2 - .05); batch.add(boxGeo(W + .04, .16, .14), trim, 0, clear + .12, L / 2 + .05)
    batch.add(new T.PlaneGeometry(.52, .14), plateMats[(seed + 1) % 6], 0, clear + .32, L / 2 + .13)
    // Open sliding door on the kerb side, with a conductor hanging out.
    // Roof rack loaded with bags
    for (const sx of [-1, 1]) batch.add(boxGeo(.04, .04, L * .8), trim, sx * W * .42, roof + bevel + .08, .1)
    for (let k = 0; k < 3; k++) batch.add(boxGeo(.5 + rand(seed + k) * .3, .3, .5), std(['#4e3c99', '#a52a2a', '#2f6f4f', '#c79b45'][(seed + k) % 4], .9), (rand(seed + k * 3) - .5) * .6, roof + bevel + .25, -1 + k * .9)
    const back = textured(`danfoBack${seed % 4}`, () => tex.sign(['NO KING AS GOD', 'GOD\'S OWN', 'NO CONDITION IS PERMANENT', 'SMALL STOUT'][seed % 4], { w: 512, h: 96, bg: '#f1b51c', fg: '#151515', border: null }))
    batch.add(new T.PlaneGeometry(W * .8, .2), back, 0, belt + .2, L / 2 + .085)
    const conductor = person({ seed: seed + 40, role: 'agbero' }); conductor.position.set(W / 2 + .2, clear + .05, -.95); conductor.rotation.y = -Math.PI / 2 + .3; root.add(conductor)
    return finish(root, batch, [[W / 2 - .12, r, -wf, r, .24, true], [-W / 2 + .12, r, -wf, r, .24, true], [W / 2 - .12, r, -wr, r, .26, false], [-W / 2 + .12, r, -wr, r, .26, false]], { length: L, width: W, belt, kind: 'danfo', riders: [conductor] })
  }

  function keke(seed = 0) {
    const root = new T.Group(), batch = new Batch(), body = paint(city === 'Lagos' ? '#f2c21e' : '#2f8a4a'), canopy = std('#151515', .8), green = paint('#1f7a3d')
    batch.add(extrude([[-1.2, .28], [1.25, .28], [1.35, .55], [1.2, 1.15], [.9, 1.2], [.7, .75], [-1.1, .75], [-1.25, .5]], 1.35, .06), body)
    batch.add(boxGeo(1.36, .07, 1.6), green, 0, .7, .2)
    batch.add(boxGeo(1.4, .06, 2.3), canopy, 0, 1.82, .1)
    for (const [x, z] of [[-.65, -1], [.65, -1], [-.65, 1.15], [.65, 1.15]]) batch.add(new T.CylinderGeometry(.025, .025, 1.1), trim, x, 1.27, z)
    slopedPanel(batch, glassDark, [1.15, 1.18], [.95, 1.78], 1.1)
    batch.add(boxGeo(1.2, .5, .06), std('#e8dcc0', .8), 0, 1.05, .7)
    batch.add(new T.CylinderGeometry(.08, .08, .05, 12).rotateX(Math.PI / 2), headlamp, 0, .95, -1.32)
    batch.add(boxGeo(1.3, .3, .05), body, 0, 1.0, 1.23); for (const sx of [-1, 1]) batch.add(boxGeo(.12, .1, .03), taillamp, sx * .5, .95, 1.26)
    const driver = person({ seed: seed + 60, seated: true }); driver.position.set(0, .1, -.45); root.add(driver)
    const riders = [driver]
    for (let k = 0; k < 2; k++) { const p = person({ seed: seed + 70 + k, seated: true }); p.position.set(k ? .35 : -.35, .12, .6); root.add(p); riders.push(p) }
    return finish(root, batch, [[0, .27, -1.0, .27, .14, true], [.62, .27, .75, .27, .16, false], [-.62, .27, .75, .27, .16, false]], { length: 2.8, width: 1.35, belt: .95, kind: 'keke', riders })
  }

  function okada(seed = 0) {
    const root = new T.Group(), batch = new Batch(), body = paint(['#b31d1d', '#1d3fb3', '#141414', '#d4d4d4'][seed % 4])
    batch.add(boxGeo(.12, .14, 1.1), trim, 0, .55, 0, -.1)
    batch.add(boxGeo(.3, .2, .45), body, 0, .82, -.25)
    batch.add(boxGeo(.28, .1, .8), std('#191919', .9), 0, .86, .3)
    batch.add(new T.CylinderGeometry(.025, .025, .7).rotateZ(Math.PI / 2), chrome, 0, 1.08, -.62)
    batch.add(new T.CylinderGeometry(.03, .03, .55), chrome, 0, .8, -.72, -.35)
    batch.add(new T.CylinderGeometry(.07, .07, .06, 12).rotateX(Math.PI / 2), headlamp, 0, .98, -.78)
    batch.add(new T.CylinderGeometry(.04, .05, .6).rotateX(Math.PI / 2), chrome, .14, .38, .35)
    const rider = person({ seed: seed + 80, seated: true, head: rand(seed) > .5 ? 'helmet' : 'cap' }); rider.position.set(0, .02, .05); rider.userData.bike = true; for (const leg of rider.userData.legs) leg.rotation.x = .85; root.add(rider)
    const riders = [rider]
    if (rand(seed + 4) > .35) { const p = person({ seed: seed + 81, seated: true }); p.position.set(0, .07, .5); for (const leg of p.userData.legs) leg.rotation.x = .85; root.add(p); riders.push(p) }
    return finish(root, batch, [[0, .3, -.72, .3, .1, true], [0, .3, .62, .3, .12, false]], { length: 2.1, kind: 'okada', riders })
  }

  function brt() {
    const L = 12, W = 2.55, H = 3.15, clear = .35, r = .5
    const root = new T.Group(), batch = new Batch(), body = paint('#1d4f9c')
    batch.add(extrude([[-L / 2, clear], [L / 2, clear], [L / 2 + .02, H - .3], [L / 2 - .15, H], [-L / 2 + .1, H], [-L / 2, H - .2]], W, .08, { y: clear, wheels: [-L / 2 + 2.6, L / 2 - 2.4], R: r + .08, cy: r }), body)
    const livery = textured(`brt${city}`, () => tex.brtSide(city))
    sideDecal(batch, livery, W / 2 + .005, 1.05, 0, L - .3, 1.3)
    sideDecal(batch, glassDark, W / 2 + .006, 2.25, .2, L - 1.6, .95)
    for (let z = -L / 2 + 1.2; z < L / 2 - .5; z += 1.4) for (const sx of [-1, 1]) batch.add(boxGeo(.03, .95, .1), body, sx * (W / 2 + .012), 2.25, z)
    batch.add(new T.PlaneGeometry(W * .9, 1.5), glassDark, 0, 2.15, -L / 2 - .09, 0, Math.PI)
    const dest = textured(`brtDest${city}`, () => tex.sign(city === 'Lagos' ? 'CMS – IKORODU' : 'CENTRAL – NYANYA', { w: 512, h: 64, bg: '#111', fg: '#ffb31a', border: null }))
    batch.add(new T.PlaneGeometry(1.8, .24), dest, 0, H - .2, -L / 2 - .1, 0, Math.PI)
    for (const sx of [-1, 1]) { batch.add(boxGeo(.3, .18, .05), headlamp, sx * W * .36, .8, -L / 2 - .06); batch.add(boxGeo(.2, .35, .05), taillamp, sx * W * .4, 1.0, L / 2 + .06) }
    return finish(root, batch, [[W / 2 - .2, r, L / 2 - 2.4, r, .32, false], [-W / 2 + .2, r, L / 2 - 2.4, r, .32, false], [W / 2 - .2, r, -L / 2 + 2.6, r, .32, true], [-W / 2 + .2, r, -L / 2 + 2.6, r, .32, true]], { length: L, width: W, belt: 1.7, kind: 'brt' })
  }

  // ---- People -------------------------------------------------------------
  const SKIN = ['#3b2418', '#4a2c1d', '#5a3825', '#6b4430', '#2e1c13', '#7a5038']
  const CLOTH = ['#f2f0e9', '#1e3b78', '#b8312f', '#2f6b45', '#d7a43a', '#2b2b2b', '#6a4a8c', '#c96f2c', '#e9d9b8', '#3f8fb0']
  function person({ seed = 0, role = 'walker', uniform = false, seated = false, head, tray = false } = {}) {
    seed = Math.abs(Math.round(seed * 7))
    const root = new T.Group(), body = new T.Group(); root.add(body)
    const skin = std(SKIN[Math.floor(rand(seed) * SKIN.length)], .7)
    const female = !uniform && role !== 'agbero' && rand(seed + 1) > .5
    const fabric = rand(seed + 2) > .55 ? M(`ank${seed % 6}`, () => new T.MeshStandardMaterial({ map: tex.ankara(seed % 6), roughness: .85 })) : std(CLOTH[Math.floor(rand(seed + 3) * CLOTH.length)], .9)
    const topMat = uniform ? std('#141c2c', .8) : role === 'agbero' ? std(['#f2f0e9', '#2b2b2b', '#c43d3d', '#3f8fb0'][seed % 4], .9) : fabric
    const legMat = uniform ? std('#141c2c', .8) : role === 'agbero' ? std('#2b3d5c', .9) : std(CLOTH[Math.floor(rand(seed + 4) * CLOTH.length)], .9)
    const limb = (r, len, mat) => new T.Mesh(G(`limb${r}${len}`, () => new T.CapsuleGeometry(r, len, 4, 8).translate(0, -len / 2 - r * .5, 0)), mat)
    const legs = [], arms = []
    for (const sx of [-1, 1]) {
      const hip = new T.Group(); hip.position.set(sx * .1, .92, 0); body.add(hip)
      const leg = limb(.072, .74, legMat); hip.add(leg)
      const shoe = new T.Mesh(G('shoe', () => new T.BoxGeometry(.11, .07, .24)), std(uniform ? '#0a0a0a' : '#3b2a1e', .6)); shoe.position.set(0, -.88, -.05); hip.add(shoe)
      legs.push(hip)
      const shoulder = new T.Group(); shoulder.position.set(sx * .23, 1.44, 0); body.add(shoulder)
      shoulder.add(limb(.058, .5, role === 'agbero' && seed % 2 ? skin : topMat))
      const hand = new T.Mesh(G('hand', () => new T.SphereGeometry(.055, 8, 6)), skin); hand.position.y = -.64; shoulder.add(hand)
      arms.push(shoulder)
    }
    const pb = new Batch()
    pb.add(G('torso', () => new T.CylinderGeometry(.2, .16, .58, 10).scale(1, 1, .62)).clone(), topMat, 0, 1.22, 0)
    if (female && rand(seed + 5) > .3) { fabric.side = T.DoubleSide; pb.add(G('skirt', () => new T.CylinderGeometry(.17, .27, .62, 12, 1, true)).clone(), fabric, 0, .66, 0) }
    pb.add(G('neck', () => new T.CylinderGeometry(.05, .05, .1, 8)).clone(), skin, 0, 1.55, 0)
    pb.add(G('head', () => new T.SphereGeometry(.115, 14, 10).scale(1, 1.12, 1.02)).clone(), skin, 0, 1.68, 0)
    pb.add(G('hair', () => new T.SphereGeometry(.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)).clone(), std('#120d0a', .95), 0, 1.7, 0)
    const wear = head || (uniform ? 'beret' : female ? (rand(seed + 6) > .4 ? 'gele' : 'none') : rand(seed + 7) > .6 ? 'cap' : 'none')
    if (wear === 'gele') { pb.add(G('gele', () => new T.TorusGeometry(.12, .06, 8, 14).rotateX(Math.PI / 2).scale(1.15, 1.4, 1.15)).clone(), fabric, 0, 1.8, 0); pb.add(G('geleTop', () => new T.ConeGeometry(.15, .18, 10)).clone(), fabric, 0, 1.9, 0) }
    if (wear === 'cap') { const capMat = std(CLOTH[seed % CLOTH.length], .8); pb.add(G('cap', () => new T.CylinderGeometry(.12, .125, .09, 12)).clone(), capMat, 0, 1.79, 0); pb.add(G('brim', () => new T.BoxGeometry(.18, .015, .12)).clone(), capMat, 0, 1.76, -.13) }
    if (wear === 'beret') { pb.add(G('beret', () => new T.SphereGeometry(.14, 12, 6).scale(1, .35, 1)).clone(), std('#0d0d0d', .9), .02, 1.8, 0, 0, 0, -.2) }
    if (wear === 'helmet') { pb.add(G('helmet', () => new T.SphereGeometry(.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * .6)).clone(), paint(['#c21d1d', '#f2f2f2', '#1d1d1d'][seed % 3]), 0, 1.7, 0) }
    if (uniform) { pb.add(G('belt', () => new T.CylinderGeometry(.165, .165, .05, 10).scale(1, 1, .64)).clone(), std('#3a2a18', .5), 0, .96, 0) }
    if (tray || role === 'hawker') {
      pb.add(G('tray', () => new T.CylinderGeometry(.32, .28, .07, 14)).clone(), std('#c9cdd1', .3, .6), 0, 1.9, 0)
      for (let k = 0; k < 6; k++) pb.add(G('sachet', () => new T.BoxGeometry(.1, .05, .14)).clone(), std(k % 2 ? '#e9f3f7' : '#d8b25a', .4), Math.cos(k) * .16, 1.96, Math.sin(k) * .16)
    }
    pb.build(body, { cast: false })
    root.userData = { legs, arms, body, role: tray ? 'hawker' : role, seated, phase: rand(seed + 9) * 10 }
    if (seated) for (const leg of legs) leg.rotation.x = 1.45
    return root
  }
  function animatePerson(p, t, mode = p.userData.role, speed = 1.4) {
    const { legs, arms, body, phase, seated } = p.userData, k = t * speed * 4.2 + phase
    if (seated) { arms[0].rotation.x = arms[1].rotation.x = p.userData.bike ? 1.2 : .4; if (mode === 'agbero') arms[1].rotation.z = 2.3 + Math.sin(k * 2) * .3; return }
    if (mode === 'walk') {
      const s = Math.sin(k); legs[0].rotation.x = s * .55; legs[1].rotation.x = -s * .55
      arms[0].rotation.x = -s * .45; arms[1].rotation.x = s * .45; arms[0].rotation.z = arms[1].rotation.z = 0
      body.position.y = Math.abs(Math.cos(k)) * .035
    } else if (mode === 'agbero') {
      // Waving and calling passengers
      legs[0].rotation.x = legs[1].rotation.x = 0
      arms[1].rotation.z = 2.4 + Math.sin(k * 2.2) * .4; arms[1].rotation.x = 0
      arms[0].rotation.z = -.25; arms[0].rotation.x = Math.sin(k) * .2
      body.rotation.y = Math.sin(k * .5) * .4; body.position.y = Math.abs(Math.sin(k * 1.1)) * .03
    } else if (mode === 'hawker') {
      arms[0].rotation.z = -2.75; arms[1].rotation.z = 2.75; arms[0].rotation.x = arms[1].rotation.x = 0
      const s = Math.sin(k * .6) * .25; legs[0].rotation.x = s; legs[1].rotation.x = -s
    } else {
      legs[0].rotation.x = legs[1].rotation.x = 0
      arms[0].rotation.x = Math.sin(k * .3) * .06; arms[1].rotation.x = -Math.sin(k * .3) * .06
      arms[0].rotation.z = -.08; arms[1].rotation.z = .08; body.position.y = 0
    }
  }

  // ---- Props ---------------------------------------------------------------
  const leafMat = M('leaf', () => new T.MeshStandardMaterial({ map: tex.leaf(), alphaTest: .5, side: T.DoubleSide, roughness: .85 }))
  function palm(b, x, z, seed, h = 7 + rand(seed) * 3) {
    const lean = (rand(seed + 1) - .5) * .25, trunk = std('#7a6a52', .95)
    for (let i = 0; i < 6; i++) { const y = i * h / 6; b.add(new T.CylinderGeometry(.17 - i * .012, .2 - i * .012, h / 6 + .05, 8), trunk, x + Math.sin(lean) * y, y + h / 12, z, 0, 0, -lean) }
    const tx = x + Math.sin(lean) * h, ty = h
    for (let k = 0; k < 10; k++) {
      // Tilt each frond outward first, then spin it around the crown.
      const a = k / 10 * Math.PI * 2 + seed, frond = new T.PlaneGeometry(1.1, 3.6).translate(0, 1.8, 0).rotateX(1.15 + rand(seed + k) * .4)
      b.add(frond, leafMat, tx, ty, z, 0, a, 0)
    }
    for (let k = 0; k < 4; k++) b.add(new T.SphereGeometry(.13, 6, 5), std('#5b4a23', .8), tx + Math.cos(k * 1.6) * .22, ty - .2, z + Math.sin(k * 1.6) * .22)
  }
  function streetlight(b, x, z, double = true) {
    const pole = std('#5a6266', .5, .6), lamp = std('#fff4d0', .3, 0, { emissive: '#fff1c4', emissiveIntensity: .15 })
    b.add(new T.CylinderGeometry(.09, .13, 9, 8), pole, x, 4.5, z)
    for (const sx of double ? [-1, 1] : [1]) { b.add(boxGeo(2.4, .1, .1), pole, x + sx * 1.15, 8.9, z); b.add(boxGeo(.7, .14, .32), lamp, x + sx * 2.25, 8.8, z) }
  }
  function umbrellaStall(b, x, z, seed) {
    const cols = [['#d63a2f', '#f6f0e1'], ['#1f7a3d', '#f6f0e1'], ['#f2c21e', '#1f4f9c'], ['#e86a1f', '#f6f0e1']][seed % 4]
    const stripe = M(`umb${seed % 4}`, () => new T.MeshStandardMaterial({ map: tex.canvasTexture(256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 2]; c.fillRect(i * w / 8, 0, w / 8, h) } }), roughness: .8, side: T.DoubleSide }))
    b.add(new T.CylinderGeometry(.03, .03, 2.3), std('#bbbbbb', .4, .6), x, 1.15, z)
    b.add(new T.ConeGeometry(1.5, .55, 8, 1, true), stripe, x, 2.4, z)
    b.add(boxGeo(1.1, .08, .7), std('#7b5a3a', .9), x + .3, .8, z); b.add(boxGeo(.06, .8, .6), std('#7b5a3a', .9), x + .3, .4, z)
    for (let k = 0; k < 5; k++) b.add(boxGeo(.14, .12 + rand(seed + k) * .1, .14), std(['#d9442b', '#f2c230', '#e9f3f7', '#3c8a3c', '#a33d1c'][k], .6), x + k * .18 - .06, .9, z + (rand(k + seed) - .5) * .3)
  }
  function kiosk(b, x, z, seed, facing) {
    const kmat = M(`kiosk${seed % 4}`, () => tex.photo(new T.MeshStandardMaterial({ color: ['#2f6f8f', '#8f2f2f', '#3b7a3b', '#9a7a2a'][seed % 4], roughness: .6, metalness: .4 }), 'roof', { normalScale: .6 }))
    b.add(boxGeo(2.4, 2.4, 2.2, 1.2), kmat, x, 1.2, z)
    b.add(boxGeo(2.7, .08, 2.6), std('#4a4d4f', .5, .5), x, 2.45, z)
    const label = textured(`kioskSign${seed % 4}`, () => tex.sign(['RECHARGE CARD · POS', 'MAMA T PROVISIONS', 'PHONE REPAIRS', 'COLD MINERALS SOLD HERE'][seed % 4], { w: 512, h: 96, bg: ['#f2c230', '#1b4f9c', '#c8302b', '#1f6b45'][seed % 4], fg: seed % 4 ? '#ffffff' : '#111111' }))
    b.add(new T.PlaneGeometry(2.3, .45), label, x - facing * 1.21, 2.0, z, 0, -facing * Math.PI / 2)
    b.add(boxGeo(.05, 1.0, 1.4), std('#151515', .9), x - facing * 1.21, 1.2, z)
    b.add(boxGeo(.7, .55, .5), std('#c9a21e', .6, .3), x + facing * .2, .28, z + 1.6)
  }
  function waterTank(b, x, y, z) { b.add(new T.CylinderGeometry(.75, .75, 1.4, 14), std('#151515', .6), x, y + .7, z); b.add(new T.CylinderGeometry(.25, .25, .15, 10), std('#151515', .6), x, y + 1.45, z) }
  function billboard(b, x, z, textArr, seed, facing = 1) {
    const steel = std('#5b6266', .5, .5)
    for (const dz of [-3, 3]) b.add(boxGeo(.35, 9, .35), steel, x, 4.5, z + dz)
    const art = textured(`bill${textArr[0]}`, () => tex.canvasTexture(1024, 384, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, ['#0f5132', '#7a1f2b', '#173f7a', '#3d2a6b'][seed % 4]); g.addColorStop(1, ['#16a34a', '#e0573a', '#2f7de0', '#c2417b'][seed % 4]); c.fillStyle = g; c.fillRect(0, 0, w, h)
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(w * .82, h * .5, h * .38, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#ffffff'; c.font = '900 96px Impact, Arial Black'; c.fillText(textArr[0], 50, h * .5); c.font = '600 40px Arial'; c.fillText(textArr[1], 54, h * .72)
    }))
    b.add(new T.PlaneGeometry(9, 3.4), art, x - facing * .2, 8.5, z, 0, -facing * Math.PI / 2)
    b.add(boxGeo(.3, 3.6, 9.2), steel, x + facing * .02, 8.5, z)
  }
  function busStop(b, x, z, facing) {
    const steel = std('#3e4a52', .4, .6), roofM = std('#1f4f9c', .5, .2)
    for (const dz of [-2, 2]) b.add(boxGeo(.1, 2.6, .1), steel, x + facing * .7, 1.3, z + dz)
    b.add(boxGeo(1.8, .1, 4.6), roofM, x, 2.65, z)
    b.add(boxGeo(.4, .45, 3.6), std('#8a8f92', .5, .5), x + facing * .5, .45, z)
    const s = textured('busstop', () => tex.sign(['BUS STOP', city === 'Lagos' ? 'LAMATA' : 'FCTA'], { w: 256, h: 128, bg: '#1f4f9c' }))
    b.add(new T.PlaneGeometry(1.2, .6), s, x - facing * .02, 3.2, z + 2.3, 0, -facing * Math.PI / 2)
    b.add(boxGeo(.08, 3.0, .08), steel, x, 1.5, z + 2.3)
  }

  function vehicle(v) {
    switch (v.kind) {
      case 'danfo': return danfo(v.tint || 0)
      case 'keke': return keke(v.tint || 0)
      case 'okada': return okada(v.tint || 0)
      case 'brt': return brt()
      case 'taxi': return sedan(v.model % 3, '#f2b41e', { taxi: true, plate: v.tint })
      case 'police': return police()
      default: return sedan(v.model ?? 0, v.color || ['#b9c3c9', '#e8e6e0', '#2c3440', '#7a1f1f', '#d9d4c7', '#1d3b5c', '#5a5f63', '#f4f4f2'][v.tint || 0], { plate: v.tint })
    }
  }

  return {
    headlamp, taillamp, streetLamp: std('#fff4d0', .3, 0, { emissive: '#fff1c4', emissiveIntensity: .15 }),
    sedan, police, danfo, keke, okada, brt, vehicle, person, animatePerson, palm, streetlight, umbrellaStall, kiosk, waterTank, billboard, busStop, std, paint, textured, glass, trim,
    dispose() { for (const m of mats.values()) m.dispose(); for (const g of geos.values()) g.dispose() },
  }
}
