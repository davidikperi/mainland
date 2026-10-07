import * as T from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { createTextureKit, rand } from './textures.js'
import { createModelKit, Batch, boxGeo } from './models.js'
import { CITIES } from './city.js'
import { ROAD_SCALE, vehicleInfo, potholesNear, holeKey, START_ROAD, nitrosNear, nitroKey, galasNear, RIVALS, LAPS, LAP_LENGTH, CHECKPOINT_SPEED } from './physics.js'
import { createCity } from './cityGrid.js'
import { createEffects } from './effects.js'

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

export function createWorldRenderer(canvas, city, quality = 'high') {
  const high = quality === 'high', C = CITIES[city]
  const renderer = new T.WebGLRenderer({ canvas, antialias: high, powerPreference: 'high-performance' })
  // Shader error checks read the compile log, which makes the page wait for every shader to finish compiling. Development only.
  renderer.debug.checkShaderErrors = !!import.meta.env?.DEV
  // Nothing is drawn until prewarm() has compiled every shader in the background, so the menus stay responsive while it works.
  let ready = false
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1))
  renderer.shadowMap.enabled = high; renderer.shadowMap.type = T.PCFShadowMap
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .82
  const scene = new T.Scene(); scene.fog = new T.Fog(C.haze, 70, 420)
  const camera = new T.PerspectiveCamera(62, 1, .1, 1500), mirrorCam = new T.PerspectiveCamera(50, 3.4, .5, 400)
  const tex = createTextureKit(renderer), kit = createModelKit(tex, city), { std } = kit

  // Sky, sun and image-based lighting
  const sunDir = new T.Vector3().setFromSphericalCoords(1, T.MathUtils.degToRad(52), T.MathUtils.degToRad(-35))
  const sky = new Sky(); sky.scale.setScalar(1000); sky.renderOrder = -1
  sky.material.uniforms.turbidity.value = city === 'Lagos' ? 7 : 5; sky.material.uniforms.rayleigh.value = 1.4
  sky.material.uniforms.mieCoefficient.value = .007; sky.material.uniforms.mieDirectionalG.value = .86; sky.material.uniforms.sunPosition.value.copy(sunDir)
  scene.add(sky)
  const pmrem = new T.PMREMGenerator(renderer), envScene = new T.Scene(), envSky = new Sky(); envSky.scale.setScalar(50)
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = sky.material.uniforms[k].value
  envSky.material.uniforms.sunPosition.value.copy(sunDir); envScene.add(envSky)
  let envRT = pmrem.fromScene(envScene, 0, .1, 100); scene.environment = envRT.texture; scene.environmentIntensity = .45
  // Reflections come from this computed sky only. (A photo sky used to replace it after loading, at a different size,
  // which made every material compile a second time.)
  let disposed = false
  const hemi = new T.HemisphereLight('#dfeefa', '#8a6f52', .9); scene.add(hemi)
  const sun = new T.DirectionalLight('#ffe1b0', 3.1); sun.castShadow = high
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 45, bottom: -45, near: 1, far: 200 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03
  scene.add(sun, sun.target)

  // Night sky: stars and a moon that follow the camera.
  const starGeo = new T.BufferGeometry(), starPos = new Float32Array(1400 * 3)
  for (let i = 0; i < 1400; i++) { const a = rand(i) * Math.PI * 2, e = Math.asin(rand(i + 7) * .98 + .02), r = 480; starPos.set([Math.cos(e) * Math.cos(a) * r, Math.sin(e) * r, Math.cos(e) * Math.sin(a) * r], i * 3) }
  starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3))
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); stars.renderOrder = -1; scene.add(stars)
  const moon = new T.Sprite(new T.SpriteMaterial({ map: tex.canvasTexture(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, w * .18, w / 2, w / 2, w / 2); g.addColorStop(0, '#fffbe8'); g.addColorStop(.38, '#f4f0dc'); g.addColorStop(.42, 'rgba(220,230,255,.35)'); g.addColorStop(1, 'rgba(200,210,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w) }), fog: false, transparent: true, depthWrite: false, opacity: 0 })); moon.scale.setScalar(70); moon.renderOrder = -1; scene.add(moon)
  // A handful of pooled lights stand in for the streetlamps nearest the camera.
  const lampLights = Array.from({ length: high ? 3 : 2 }, () => { const l = new T.PointLight('#ffc98a', 0, 34, 1.4); scene.add(l); return l })
  const headlight = new T.SpotLight('#fff1d6', 0, 90, .5, .55, 1.2); headlight.position.set(0, .9, -2.2); headlight.target.position.set(0, 0, -30); scene.add(headlight, headlight.target)
  const dayFog = new T.Color(C.haze), nightFog = new T.Color('#0a1120'), duskFog = new T.Color('#d79a74'), dayHemi = new T.Color('#dfeefa'), nightHemi = new T.Color('#2a3b66')
  const sunDay = new T.Color('#ffe1b0'), sunDusk = new T.Color('#ff8a4a'), moonColor = new T.Color('#8fa8ff'), fogColor = new T.Color()
  let phase = -1, nightK = 0, heading = 0
  // 0 = midnight, .5 = noon. Moves the sun/moon and blends every light, colour and glow.
  function applyTime(target, dt, rain = 0, flash = 0) {
    if (phase < 0) phase = target
    let d = target - phase; d -= Math.round(d); phase = (phase + clamp(d, -dt * .3, dt * .3) + 1) % 1
    const ang = (phase - .25) * Math.PI * 2, elev = 62 * Math.sin(ang), azim = -35 + (phase - .5) * 140 + T.MathUtils.radToDeg(heading)
    sunDir.setFromSphericalCoords(1, T.MathUtils.degToRad(90 - elev), T.MathUtils.degToRad(azim))
    const dayK = T.MathUtils.smoothstep(elev, -6, 12), dusk = elev > -8 ? Math.exp(-(((elev - 2) / 11) ** 2)) : 0
    nightK = 1 - dayK
    sky.material.uniforms.sunPosition.value.copy(sunDir)
    const moonUp = sunDir.y < 0, light = moonUp ? sunDir.clone().negate() : sunDir
    sun.intensity = moonUp ? .45 : 3.1 * dayK + .2; sun.color.copy(moonUp ? moonColor : sunDay.clone().lerp(sunDusk, dusk))
    sunVec.copy(light.y < .15 ? new T.Vector3(light.x, .15, light.z).normalize() : light)
    hemi.intensity = .14 + .76 * dayK; hemi.color.copy(nightHemi).lerp(dayHemi, dayK)
    fogColor.copy(nightFog).lerp(dayFog, dayK).lerp(duskFog, dusk * .45); scene.fog.color.copy(fogColor)
    scene.environmentIntensity = .06 + .22 * dayK; renderer.toneMappingExposure = .82 + nightK * .25
    stars.material.opacity = Math.max(0, nightK - .25); moon.material.opacity = nightK
    for (const m of silhouettes) m.material.color.copy(m.material.userData.day).lerp(nightFog, nightK * .85)
    const glow = nightK
    streets.setNight(glow)
    kit.streetLamp.emissiveIntensity = .15 + glow * 5; kit.headlamp.emissiveIntensity = .5 + glow * 3.5
    fx.setNight(glow); headlight.intensity = glow * 260
    // Rain: heavy cloud hides the sun, moon and stars; grey fog closes in; the tarmac turns wet and shiny.
    sun.intensity *= 1 - rain * .78; hemi.intensity = hemi.intensity * (1 - rain * .2) + flash * 3
    fogColor.lerp(rainFog.copy(rainDay).lerp(nightFog, nightK * .9), rain * .8); scene.fog.color.copy(fogColor)
    scene.fog.near = 70 - rain * 40; scene.fog.far = 420 - rain * 200
    stars.material.opacity *= 1 - rain; moon.material.opacity *= 1 - rain
    clouds.material.opacity = rain * .93; clouds.material.color.copy(cloudDay).lerp(cloudNight, nightK).lerp(cloudFlash, flash)
    clouds.visible = rain > .01
    streets.setWet(rain)
    renderer.toneMappingExposure -= rain * .08 * (1 - nightK)
  }
  const sunVec = new T.Vector3().copy(sunDir)
  const rainFog = new T.Color(), rainDay = new T.Color('#8b949b'), cloudDay = new T.Color('#7c858c'), cloudNight = new T.Color('#10151c'), cloudFlash = new T.Color('#c9d2ff')
  // Overcast dome inside the sky: drawn over the sun, moon and stars when it rains.
  const clouds = new T.Mesh(new T.SphereGeometry(900, 32, 16), new T.MeshBasicMaterial({ map: tex.canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) { const x = rand(i) * w, y = h * (.15 + rand(i + 3) * .5), r = 18 + rand(i + 5) * 60, gr = c.createRadialGradient(x, y, 0, x, y, r), v = Math.round(150 + rand(i + 9) * 100); gr.addColorStop(0, `rgba(${v},${v},${v},.55)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2) }
  }), side: T.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }))
  clouds.renderOrder = -.5; clouds.visible = false; scene.add(clouds)
  // Rain: streaks in a box around the camera, slanting towards you the faster you drive.
  const DROPS = high ? 1800 : 900, rainPos = new Float32Array(DROPS * 6), rainGeo = new T.BufferGeometry()
  for (let i = 0; i < DROPS; i++) { rainPos[i * 6] = (rand(i) - .5) * 60; rainPos[i * 6 + 1] = rand(i + 1) * 24; rainPos[i * 6 + 2] = -rand(i + 2) * 70 + 8 }
  rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3))
  const rainLines = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: '#c3ced8', transparent: true, opacity: 0, depthWrite: false }))
  rainLines.frustumCulled = false; rainLines.visible = false; scene.add(rainLines)
  function updateRain(rain, dt, speed, px) {
    rainLines.visible = rain > .02; if (!rainLines.visible) return
    rainLines.material.opacity = .5 * rain
    const fall = 16, run = speed / 3.6, len = .9, p = rainPos
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6
      p[o + 1] -= fall * dt; p[o + 2] += run * dt
      if (p[o + 1] < 0 || p[o + 2] > 10) { p[o] = px + (Math.random() - .5) * 60; p[o + 1] = p[o + 1] < 0 ? 20 + Math.random() * 4 : Math.random() * 24; p[o + 2] = -Math.random() * 70 + 6 }
      p[o + 3] = p[o]; p[o + 4] = p[o + 1] + len; p[o + 5] = p[o + 2] - len * run / fall
    }
    rainGeo.attributes.position.needsUpdate = true
  }
  // Ground and (Lagos) lagoon follow the camera; their texture scrolls with distance.
  const groundMat = tex.photo(new T.MeshStandardMaterial({ color: C.ground, roughness: 1 }), 'soil', { normalScale: .5 })
  const groundGeo = new T.PlaneGeometry(1600, 1600); { const uv = groundGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 200, uv.getY(i) * 200) }
  const ground = new T.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.32, -300); ground.receiveShadow = true; scene.add(ground)

  // Horizon landmarks stay at a fixed distance, drawn without fog as hazy silhouettes.
  const far = new T.Group(); scene.add(far)
  const haze = new T.Color(C.haze)
  const silhouettes = []
  const silhouette = (color, k = .55) => { const m = new T.MeshBasicMaterial({ color: new T.Color(color).lerp(haze, k), fog: false }); m.userData.day = m.color.clone(); silhouettes.push({ material: m }); return m }
  if (city === 'Lagos') {
    for (let i = 0; i < 26; i++) { const h = 40 + rand(i) * 150, w = 18 + rand(i + 1) * 30; const m = new T.Mesh(new T.BoxGeometry(w, h, w), silhouette(['#5d7282', '#7d8a90', '#4f6170'][i % 3], .45 + rand(i + 2) * .2)); m.position.set(-420 + i * 32 + rand(i + 3) * 20, h / 2 - 2, -820 - rand(i + 4) * 120); far.add(m) }
  } else {
    const rock = new T.Mesh(new T.SphereGeometry(120, 24, 14), silhouette('#6f6b5c', .4)); rock.scale.set(1.5, .9, .7); rock.position.set(260, 20, -900); far.add(rock)
    const dome = new T.Mesh(new T.SphereGeometry(26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), silhouette('#d7a640', .3)); dome.position.set(-230, 38, -760); far.add(dome)
    const base = new T.Mesh(new T.BoxGeometry(80, 40, 60), silhouette('#ddd3b8', .35)); base.position.set(-230, 18, -760); far.add(base)
    for (const dx of [-52, 52]) { const m = new T.Mesh(new T.CylinderGeometry(3, 3.5, 110, 10), silhouette('#e3d9c0', .35)); m.position.set(-230 + dx, 55, -760); far.add(m) }
    for (let i = 0; i < 12; i++) { const h = 30 + rand(i) * 70; const m = new T.Mesh(new T.BoxGeometry(22, h, 22), silhouette('#8796a0', .5)); m.position.set(-80 + i * 26, h / 2, -880); far.add(m) }
  }

  // The city grid: roads, junctions and blocks you can drive between.
  const streets = createCity(scene, { kit, tex, C, city, high })

  // Vehicle pools keyed by model so respawned traffic reuses meshes.
  const pool = new Map(), active = new Map()
  function acquire(key, build) { const list = pool.get(key); const obj = list?.pop() || build(); obj.userData.poolKey = key; obj.visible = true; if (!obj.parent) scene.add(obj); return obj }
  function release(obj) { obj.visible = false; scene.remove(obj); const list = pool.get(obj.userData.poolKey) || []; list.push(obj); pool.set(obj.userData.poolKey, list) }
  function shadows(obj) { obj.traverse(o => { if (o.isMesh) o.castShadow = high && o.castShadow && !o.material.userData?.noShadow && o.material.depthWrite !== false }) ; return obj }
  const keyFor = v => v.kind === 'car' || !v.kind ? `car:${v.model ?? 0}:${v.tint ?? 0}:${v.color || ''}` : v.kind === 'taxi' ? `taxi:${v.model % 3}` : `${v.kind}:${v.kind === 'danfo' ? (v.tint ?? 0) % 8 : v.kind === 'brt' ? 0 : (v.tint ?? 0) % 4}`
  const peerModel = ['Peugeot 504', 'Mercedes 190E', 'Toyota Camry', 'Dodge Challenger', 'Toyota Corolla', 'Honda Accord', 'Lexus RX 350', 'Mercedes G63']
  function label(text) { const s = new T.Sprite(new T.SpriteMaterial({ map: tex.sign(text, { w: 512, h: 80, bg: '#111c', fg: '#d3f35d', border: null }), depthWrite: false })); s.scale.set(4.5, .7, 1); s.position.y = 3; return s }

  // Oncoming traffic on the far carriageway (visual only, beyond the median).
  const oncoming = Array.from({ length: high ? 15 : 9 }, (_, k) => {
    const kinds = ['car', 'danfo', 'car', 'brt', 'okada', 'taxi', 'car', 'keke', 'danfo', 'car', 'taxi', 'car', 'danfo', 'car', 'okada'], kind = kinds[k], v = { kind, model: k % 8, tint: (k * 3) % 8 }
    const obj = shadows(kit.vehicle(v)); obj.rotation.y = Math.PI; scene.add(obj)
    // Every oncoming lane gets its share, evenly spaced, one speed per lane so they never drive through each other.
    const lane = k % 3, perLane = Math.ceil((high ? 15 : 9) / 3), slot = Math.floor(k / 3)
    return { obj, lane: [-18.15, -22, -25.85][lane] + (kind === 'okada' ? 1.6 : 0), speed: [62, 52, 44][lane] / 3.6, base: slot * (620 / perLane) + lane * 37 }
  })

  let player = null, playerKey = '', officer = null
  const policeObjs = new Map()
  // One shared beacon light for the whole pursuit, always in the scene so the light count never changes.
  const policeLight = new T.PointLight('#ff2a3c', 0, 20, 1.6); scene.add(policeLight)
  const rageMarkers = [0, 1, 2].map(() => { const mk = new T.Sprite(new T.SpriteMaterial({ map: tex.bubble('😡 ROAD RAGE', { bg: '#e8402f', fg: '#ffffff' }), depthTest: false, depthWrite: false })); mk.scale.set(2.8, .48, 1); mk.renderOrder = 9; mk.visible = false; scene.add(mk); return mk })
  const fx = createEffects(scene, tex, high)
  // Race furniture: chequered START and FINISH gantries, each with a chequered strip across the road and a flag
  // waving on a pole either side, plus a name marker over every rival.
  const flagMat = new T.MeshStandardMaterial({ map: tex.checker(''), side: T.DoubleSide, roughness: .7 }), flags = []
  function gantry(text) {
    const grp = new T.Group(); grp.visible = false; scene.add(grp)
    const b = new Batch(), steel = std('#d8d8d8', .4, .6); for (const x of [-9.8, 9.8]) b.add(boxGeo(.4, 7.5, .4), steel, x, 3.75, 0)
    b.add(new T.PlaneGeometry(19.6, 2.4), new T.MeshStandardMaterial({ map: tex.checker(text), side: T.DoubleSide, roughness: .6 }), 0, 6.6, 0)
    b.add(boxGeo(19, .02, 1.2), flagMat, 0, .02, 0)
    for (const x of [-12.2, 12.2]) b.add(boxGeo(.12, 5.2, .12), steel, x, 2.6, 0)
    b.build(grp)
    for (const side of [-1, 1]) {
      const pivot = new T.Group(); pivot.position.set(side * 12.2, 4.4, 0)
      const flag = new T.Mesh(new T.PlaneGeometry(2.6, 1.6, 8, 1), flagMat); flag.position.x = -side * 1.3; flag.castShadow = true
      pivot.add(flag); grp.add(pivot); flags.push({ pivot, flag, side, base: flag.geometry.attributes.position.array.slice() })
    }
    return grp
  }
  const startLine = gantry('START'), finishLine = gantry('FINISH')
  // A gantry at the end of each lap but the last: LAP 2, ..., FINAL LAP.
  const lapLines = Array.from({ length: LAPS - 1 }, (_, i) => ({ at: (i + 1) * LAP_LENGTH, grp: gantry(i + 2 === LAPS ? 'FINAL LAP' : `LAP ${i + 2}`) }))
  // Flags ripple: a travelling wave along the cloth, bigger towards the free end, and the whole flag swings a little on its pole.
  function waveFlags(t) {
    for (const [i, f] of flags.entries()) {
      const pos = f.flag.geometry.attributes.position, a = pos.array
      for (let v = 0; v < pos.count; v++) { const x = f.base[v * 3], free = (x * -f.side + 1.3) / 2.6; a[v * 3 + 2] = Math.sin(t * 7 + free * 5 + i) * .28 * free }
      pos.needsUpdate = true; f.pivot.rotation.y = Math.sin(t * 1.7 + i) * .18
    }
  }
  // Police checkpoints (the two vans are simulated vehicles; these are the props): cones funnelling the outer lanes into
  // the middle one, a roadside warning sign, and an officer waving traffic through.
  const coneGeo = new T.ConeGeometry(.22, .75, 10), coneMat = std('#ff6a13', .6), coneBand = std('#f4f4f2', .5)
  const signMat = new T.MeshStandardMaterial({ map: tex.canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#0f3d8a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 12; c.strokeRect(10, 10, w - 20, h - 20)
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '900 64px Impact, Arial Black'; c.fillText('POLICE', w / 2, 92); c.fillText('CHECKPOINT', w / 2, 160)
    c.fillStyle = '#ffc61a'; c.font = '900 44px Impact, Arial Black'; c.fillText(`SLOW · ${CHECKPOINT_SPEED} KM/H`, w / 2, 222)
  }), roughness: .6 })
  const checkpointProps = Array.from({ length: LAPS }, (_, i) => {
    const grp = new T.Group(); grp.visible = false; scene.add(grp)
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
      const cone = new T.Mesh(coneGeo, coneMat), band = new T.Mesh(new T.CylinderGeometry(.13, .16, .12, 10), coneBand)
      cone.position.set(side * (4.6 - k * .6), .375, 12 - k * 2.6); band.position.set(cone.position.x, .45, cone.position.z); cone.castShadow = true
      grp.add(cone, band)
    }
    const sign = new T.Mesh(new T.PlaneGeometry(3.2, 1.6), signMat); sign.position.set(8.6, 2.4, 70)
    const post = new T.Mesh(new T.BoxGeometry(.12, 2.2, .12), std('#9aa0a4', .5, .6)); post.position.set(8.6, 1.1, 70.05)
    const officer = shadows(kit.person({ seed: 960 + i, uniform: true })); officer.position.set(2.5, 0, 4); officer.rotation.y = -Math.PI / 2
    grp.add(sign, post, officer); grp.userData.officer = officer
    return grp
  })
  // A marker over every rival with their street name, in their colour. Constant on-screen size, so you can pick them out at any distance.
  const rivalMarkers = RIVALS.map(r => { const m = new T.Sprite(new T.SpriteMaterial({ map: tex.bubble(`▼ ${r.name}`, { bg: r.color, fg: '#111111' }), depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false })); m.scale.set(.3, .05, 1); m.renderOrder = 9; m.visible = false; scene.add(m); return m })
  // Flooded potholes: a ragged dark crater of broken tarmac holding a sheet of muddy, mirror-like water.
  const holeMats = { rim: std('#1d1c1a', 1), mud: new T.MeshStandardMaterial({ color: '#4a3f2e', roughness: .95 }), water: new T.MeshStandardMaterial({ color: '#5b6b6c', roughness: .02, metalness: .85, envMapIntensity: 1.6, transparent: true, opacity: .9, polygonOffset: true, polygonOffsetFactor: -2 }) }
  const raggedDisc = (r, seed, wob) => { const s = new T.Shape(); for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, k = r * (1 + (rand(seed + i % 18) - .5) * wob); i ? s.lineTo(Math.cos(a) * k, Math.sin(a) * k) : s.moveTo(k, 0) } return new T.ShapeGeometry(s).rotateX(-Math.PI / 2) }
  const holes = Array.from({ length: 6 }, (_, i) => {
    const grp = new T.Group(), rim = new T.Mesh(raggedDisc(1.18, i * 31, .35), holeMats.rim), mud = new T.Mesh(raggedDisc(1.05, i * 31 + 5, .3), holeMats.mud), water = new T.Mesh(raggedDisc(.95, i * 31 + 9, .25), holeMats.water)
    rim.position.y = .022; mud.position.y = .026; water.position.y = .03; rim.receiveShadow = water.receiveShadow = true
    grp.add(rim, mud, water); grp.userData.water = water; scene.add(grp); return grp
  })
  // NOS bottles on the road: a blue cylinder with a chrome valve, spinning over a glowing ring.
  // Pepsi bottle: dark cola in clear plastic, blue label with the red-white-blue globe, blue cap.
  // No transmission: it would render the whole scene a second time every frame just for these bottles.
  const nosBlue = new T.MeshStandardMaterial({ color: '#2a1408', roughness: .08, metalness: 0, transparent: true, opacity: .88, envMapIntensity: 1.6 })
  const nosLabel = new T.MeshStandardMaterial({ map: tex.canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#0a2a8f'; c.fillRect(0, 0, w, h)
    for (const cx of [40, 168]) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, h / 2, 22, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d0102a'; c.beginPath(); c.arc(cx, h / 2, 22, Math.PI * 1.05, Math.PI * 1.95); c.fill(); c.fillStyle = '#1f4fd8'; c.beginPath(); c.arc(cx, h / 2, 22, Math.PI * .05, Math.PI * .95); c.fill() }
    c.fillStyle = '#ffffff'; c.font = '900 22px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PEPSI', 104, h / 2 + 1); c.fillText('PEPSI', 232, h / 2 + 1)
  }), roughness: .4 })
  const nosGlow = new T.SpriteMaterial({ map: tex.spark(), color: '#5aa0ff', transparent: true, depthWrite: false, blending: T.AdditiveBlending })
  const bottles = Array.from({ length: 5 }, () => {
    const grp = new T.Group(), b = new T.Group()
    const body = new T.Mesh(new T.CylinderGeometry(.24, .24, .9, 18), nosBlue); body.position.y = .45
    const neck = new T.Mesh(new T.CylinderGeometry(.1, .2, .2, 14), nosBlue); neck.position.y = 1.0
    const valve = new T.Mesh(new T.CylinderGeometry(.1, .1, .14, 12), std('#1a46c8', .4)); valve.position.y = 1.16
    const label = new T.Mesh(new T.CylinderGeometry(.245, .245, .3, 18, 1, true), nosLabel); label.position.y = .5
    b.add(body, neck, valve, label); b.position.y = .45
    const glow = new T.Sprite(nosGlow); glow.scale.setScalar(2.6); glow.position.y = .9
    const ring = new T.Mesh(new T.RingGeometry(.7, 1.0, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#4d8dff', transparent: true, opacity: .55, depthWrite: false })); ring.position.y = .03
    grp.add(b, glow, ring); grp.userData.spin = b; grp.visible = false; scene.add(grp); return grp
  })
  // Beef Gala packs: a red-and-yellow sausage-roll wrapper standing on the road.
  const galaMat = new T.MeshStandardMaterial({ map: tex.canvasTexture(256, 128, (c, w, h) => {
    c.fillStyle = '#d6141c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd21a'; c.fillRect(0, h * .62, w, h * .38)
    c.fillStyle = '#ffd21a'; c.font = 'italic 900 50px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GALA', w / 2, h * .36)
    c.fillStyle = '#d6141c'; c.font = '900 22px Arial Black, Arial'; c.fillText('BEEF SAUSAGE ROLL', w / 2, h * .82)
  }), roughness: .35, metalness: .2 })
  const galaGlow = new T.SpriteMaterial({ map: tex.spark(), color: '#ffcf3a', transparent: true, depthWrite: false, blending: T.AdditiveBlending })
  const galas = Array.from({ length: 4 }, () => {
    const grp = new T.Group(), pack = new T.Mesh(new T.BoxGeometry(.9, .45, .28), galaMat); pack.position.y = .7
    const glow = new T.Sprite(galaGlow); glow.scale.setScalar(2.2); glow.position.y = .75
    const ring = new T.Mesh(new T.RingGeometry(.7, 1.0, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#ffc61a', transparent: true, opacity: .55, depthWrite: false })); ring.position.y = .03
    grp.add(pack, glow, ring); grp.userData.spin = pack; grp.visible = false; scene.add(grp); return grp
  })
  // Nitro flames out of the exhaust while the boost burns.
  const flameMat = new T.MeshBasicMaterial({ color: '#7fb6ff', transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false })
  const flameCore = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false })
  const flames = new T.Group()
  for (const sx of [-.35, .35]) { const outer = new T.Mesh(new T.ConeGeometry(.16, 1.3, 12).rotateX(Math.PI / 2), flameMat); outer.position.set(sx, .32, .65); const core = new T.Mesh(new T.ConeGeometry(.07, .7, 10).rotateX(Math.PI / 2), flameCore); core.position.set(sx, .32, .35); flames.add(outer, core) }
  flames.visible = false
  let smokeTimer = 0, camLift = 0, boostFov = 0
  // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
  // let lastTurns = 0, lastTurn = null
  // const UP = new T.Vector3(0, 1, 0)   // [ROAD NETWORK DISABLED] used by the turning camera
  const coarse = matchMedia('(pointer: coarse)')
  // Model tags over vehicles ahead: make, model, year, class and what beating them pays.
  const tagMats = new Map()
  function tagFor(obj, v) {
    if (!obj.userData.tagSprite) {
      const info = vehicleInfo(v), key = `${info.make}:${info.name}:${!!info.taxi}`
      if (!tagMats.has(key)) tagMats.set(key, new T.SpriteMaterial({ map: tex.tag(info), depthWrite: false, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }))
      const sp = new T.Sprite(tagMats.get(key)); sp.scale.set(.18, .046, 1); sp.position.y = (obj.userData.belt || 1) + (obj.userData.kind === 'brt' ? 2.5 : 1.7); sp.renderOrder = 8
      obj.add(sp); obj.userData.tagSprite = sp
    }
    return obj.userData.tagSprite
  }
  // On touch screens only vehicles you've hit keep their tag; a tag on every car ahead covers the road.
  const hitTags = new Set()
  const showTag = (obj, v, dz, mode) => { tagFor(obj, v).visible = mode === 'drive' && dz > 4 && dz < 85 && (!coarse.matches || hitTags.has(v.id)) }
  const buildQueue = []
  const camPos = new T.Vector3(0, 4, 9), camLook = new T.Vector3(0, 1, -10)
  let last = performance.now()
  const spin = (obj, metres) => { for (const w of obj.userData.wheels || []) w.userData.spin.rotation.x -= metres / w.userData.r }

  const observer = new ResizeObserver(() => { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() } }); observer.observe(canvas)

  // Level of detail: distant vehicles drop badges, chrome, interiors and shadows.
  function lod(obj, dz) {
    const near = Math.abs(dz) < 70, castNear = Math.abs(dz) < 55
    if (obj.userData.lodNear === near && obj.userData.lodCast === castNear) return
    obj.userData.lodNear = near; obj.userData.lodCast = castNear
    obj.userData.lodParts ||= (() => { const d = [], c = []; obj.traverse(o => { if (o.isMesh && o.userData.detail) d.push(o); if (o.isMesh && o.castShadow) c.push(o) }); return { d, c } })()
    for (const o of obj.userData.lodParts.d) o.visible = near
    for (const o of obj.userData.lodParts.c) o.castShadow = castNear
  }
  function placeVehicle(obj, v, g, dt) {
    const dz = v.z - g.z
    obj.position.set(v.x * ROAD_SCALE, 0, -dz); lod(obj, dz)
    const lateral = ((v.tx ?? v.targetX ?? v.x) - v.x) * ROAD_SCALE
    obj.rotation.y = -clamp(lateral * .08, -.22, .22) * Math.min(Math.abs(v.speed) / 30, 1)
    if (v.kind === 'okada') obj.rotation.z = clamp(lateral * .06, -.3, .3)
    spin(obj, v.speed / 3.6 * dt)
  }

  return {
    isReady() { return ready },
    render(g) {
      if (!ready) return
      const now = performance.now(), dt = Math.min((now - last) / 1000, .1); last = now
      const t = g.ambientTime
      // Build one queued vehicle per frame into the pool (idle-time warm-up).
      if (buildQueue.length) { const v = buildQueue.shift(), k = keyFor(v); if (!pool.get(k)?.length) { const o = acquire(k, () => shadows(kit.vehicle(v))); fx.fitVehicle(o); release(o) } }
      // Place the city so your road runs straight ahead; the sun and skyline turn with it.
      heading = streets.update({ road: g.road || START_ROAD, z: g.z, t, dt, speed: g.speed, mode: g.mode }); far.rotation.y = heading
      applyTime(g.timeOfDay ?? .42, dt, g.rain || 0, g.lightning || 0)
      updateRain(g.rain || 0, dt, g.mode === 'drive' ? g.speed : 0, g.x * ROAD_SCALE)
      // Player car
      const key = `${g.car}:${g.color}`
      if (key !== playerKey) { if (player) { scene.remove(player); disposeOwned(player) } player = shadows(kit.sedan(g.car, g.color, { plate: 2 })); player.add(headlight, headlight.target, flames); flames.position.z = (player.userData.length || 4.5) / 2; scene.add(player); playerKey = key }
      const px = g.x * ROAD_SCALE, speedK = Math.min(Math.abs(g.speed) / 120, 1)
      player.position.set(px, 0, 0)
      // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
      // const tr = g.mode === 'drive' ? g.turning : null
      // if (tr) { player.position.set(tr.px, 0, -tr.pz); player.rotation.y = -tr.psi }
      player.rotation.y = -g.steer * .14 * Math.min(Math.abs(g.speed) / 40, 1) * Math.sign(g.speed || 1)
      player.rotation.z = g.steer * .03 * speedK
      spin(player, g.speed / 3.6 * dt)
      for (const w of player.userData.wheels) if (w.userData.front) w.rotation.y = -g.steer * .4
      fx.showDamage(player, g.dmg, { braking: g.braking })
      // Rubber on the road while skidding (no tyre dust or spray); engine smoke once badly damaged.
      player.userData.wheels.forEach((w, i) => { const key = 'player' + i; if ((g.skid || 0) > .5 && g.mode === 'drive' && !w.userData.front) fx.track(key, px + w.position.x, g.z - w.position.z); else fx.stopTrack(key) })
      smokeTimer -= dt
      if (smokeTimer <= 0 && g.mode === 'drive') {
        smokeTimer = .09
        if ((g.damage || 0) > 45) fx.puff(px, 1.0, g.z + 1.6, g.damage > 80 ? '#2e2e2e' : '#9a9a9a', .7 + g.damage / 120, 1.6)
        // Wrecked: flames out of the bonnet and thick black smoke.
        if (g.wrecked) for (let i = 0; i < 3; i++) { fx.puff(px + (Math.random() - .5) * 1.2, .9 + Math.random() * .6, g.z + 1.2 + Math.random(), ['#ff6a1a', '#ffb02e', '#e8341c'][i], .8 + Math.random() * .6, .7); fx.puff(px, 1.8, g.z + 1.4, '#151515', 2.2, 2.4) }
      }

      // Traffic and remote players
      const seen = new Set(), markerSeen = new Set()
      let rageCount = 0
      // The garage shows just your car on the turntable: no traffic driving through the shot.
      for (const v of g.mode === 'garage' ? [] : [...g.traffic, ...g.peers]) {
        const dz = v.z - g.z; if (dz < -40 || dz > 300) continue
        const isPeer = !!v.name, model = isPeer ? Math.max(0, peerModel.indexOf(v.car)) : v.model
        const k = isPeer ? `peer:${v.id}:${model}:${v.color}` : keyFor(v)
        let obj = active.get(v.id)
        if (!obj || obj.userData.poolKey !== k) {
          if (obj) release(obj)
          obj = acquire(k, () => { const o = shadows(isPeer ? kit.sedan(model, v.color) : kit.vehicle(v)); if (isPeer) o.add(label(`${v.name} · ${v.car}`)); return o })
          active.set(v.id, obj)
        }
        seen.add(v.id); placeVehicle(obj, v, g, dt); if (!isPeer) showTag(obj, v, v.rival !== undefined ? -1 : dz, g.mode)   // rivals carry a name marker instead
        fx.showDamage(obj, v.dmg, { hazards: !isPeer && g.time < v.hold, braking: !!v.skid || (!isPeer && g.time < v.hold && v.speed > 1), time: t })
        if (v.skid && v.kind !== 'okada') for (const [i, w] of (obj.userData.wheels || []).entries()) { if (!w.userData.front) fx.track(v.id + i, v.x * ROAD_SCALE + w.position.x, v.z - w.position.z) } else for (let i = 0; i < 4; i++) fx.stopTrack(v.id + i)
        const slot = !g.race ? -1 : v.rival ?? (g.race.rivals || [g.race.rival]).indexOf(v.id)
        if (v.rage && g.time < v.rage.until && rageCount < 3) { const mk = rageMarkers[rageCount++]; mk.visible = true; mk.position.set(obj.position.x, (obj.userData.belt || 1) + 2.4, obj.position.z) }
        // Only over rivals ahead of you: a marker beside or behind the camera would fill the screen.
        if (slot >= 0 && slot < rivalMarkers.length && dz > 3 && g.mode === 'drive') { const m = rivalMarkers[slot]; m.visible = true; m.position.set(obj.position.x, (obj.userData.belt || 1) + 2.4, obj.position.z); markerSeen.add(slot) }
        for (const r of obj.userData.riders || []) kit.animatePerson(r, t, r.userData.role === 'agbero' ? 'agbero' : 'idle')
      }
      rivalMarkers.forEach((m, i) => { if (!markerSeen.has(i)) m.visible = false })
      rageMarkers.forEach((m, i) => { if (i >= rageCount) m.visible = false })
      for (const [id, obj] of active) if (!seen.has(id)) { release(obj); active.delete(id) }
      finishLine.visible = !!g.race?.finish; if (g.race?.finish) { const d = g.race.finish - g.z; finishLine.position.set(0, 0, -d) }
      startLine.visible = !!g.race?.grid && g.z - g.race.start < 80; if (startLine.visible) startLine.position.set(0, 0, -(g.race.start - g.z))
      let flagsNear = startLine.visible || (finishLine.visible && g.race.finish - g.z < 300)
      for (const l of lapLines) { const d = g.race?.grid ? g.race.start + l.at - g.z : NaN; l.grp.visible = d > -60 && d < 600; if (l.grp.visible) { l.grp.position.set(0, 0, -d); flagsNear ||= d < 300 } }
      if (flagsNear) waveFlags(t)
      checkpointProps.forEach((grp, i) => {
        const cp = g.race?.checkpoints?.[i], d = cp ? cp.z - g.z : NaN
        grp.visible = d > -40 && d < 400
        if (grp.visible) { grp.position.set(0, 0, -d); kit.animatePerson(grp.userData.officer, t, 'agbero') }
      })
      for (const o of oncoming) {
        const span = 620, wz = g.z - 60 + ((((o.base - o.speed * t) - (g.z - 60)) % span) + span) % span
        o.obj.position.set(o.lane, 0, -(wz - g.z)); o.obj.rotation.y = Math.PI; o.obj.visible = wz - g.z < 260; lod(o.obj, wz - g.z); spin(o.obj, -o.speed * dt); fx.showDamage(o.obj, null, {})
      }

      // Police van at its real simulated position, plus the officer on foot.
      const p = g.police, units = p ? [p, ...(g.backup || [])] : []
      for (const [id, obj] of policeObjs) obj.visible = units.some(u => u.id === id)
      units.forEach((u, i) => {
        let obj = policeObjs.get(u.id)
        if (!obj) { obj = shadows(kit.police()); scene.add(obj); policeObjs.set(u.id, obj) }
        obj.visible = true; placeVehicle(obj, u, g, dt); showTag(obj, u, u.z - g.z, g.mode); fx.showDamage(obj, u.dmg, { braking: u.phase !== 'pursuit' && u.speed > 1 })
        // Each van's beacons flash out of step with the others.
        const on = Math.floor(t * 7 + i * .5) % 2 === 0, { red, blue } = obj.userData
        red.material.emissiveIntensity = on ? 3 : .2; blue.material.emissiveIntensity = on ? .2 : 3
        if (i === 0) { policeLight.color.set(on ? '#ff2a3c' : '#2a6bff'); policeLight.intensity = u.phase === 'arrested' ? 0 : 30; policeLight.position.set(obj.position.x, 2.6, obj.position.z) }
      })
      if (!units.length) policeLight.intensity = 0
      if (p) {
        if (p.officer) {
          if (!officer) { officer = shadows(kit.person({ seed: 777, uniform: true })); scene.add(officer) }
          officer.visible = true; officer.position.set(p.officer.x, 0, -(p.officer.z - g.z)); officer.rotation.y = -p.officer.heading
          kit.animatePerson(officer, t, p.officer.moving ? 'walk' : 'idle', p.phase === 'returning' ? 2.4 : 1.8)
        } else if (officer) officer.visible = false
      } else if (officer) officer.visible = false

      // NOS bottles still lying on this street ahead of you.
      const nos = nitrosNear(g.z, 20, 300, nitroKey(g)).filter(n => !g.nitroTaken?.[n.id])
      bottles.forEach((o, i) => { const n = nos[i]; o.visible = !!n && g.mode === 'drive'; if (!n) return; o.position.set(n.x * ROAD_SCALE, 0, -(n.z - g.z)); o.userData.spin.rotation.y = t * 2.5; o.userData.spin.position.y = .45 + Math.sin(t * 3 + i) * .12 })
      const gl = galasNear(g.z, 20, 300, nitroKey(g)).filter(n => !g.galaTaken?.[n.id])
      galas.forEach((o, i) => { const n = gl[i]; o.visible = !!n && g.mode === 'drive'; if (!n) return; o.position.set(n.x * ROAD_SCALE, 0, -(n.z - g.z)); o.userData.spin.rotation.y = t * 2; o.userData.spin.position.y = .7 + Math.sin(t * 3 + i) * .12 })
      // Flames flicker while the nitro burns.
      const boostK = g.mode === 'drive' && g.time < (g.boostUntil || 0) ? 1 : 0
      flames.visible = !!boostK; if (boostK) flames.children.forEach((m, i) => { m.scale.set(1, 1, .75 + Math.random() * .6 + (i % 2 ? 0 : .3)) })
      const wet = potholesNear(g.z, 30, 320, holeKey(g))
      holes.forEach((o, i) => { const h = wet[i]; o.visible = !!h; if (!h) return; o.position.set(h.x * ROAD_SCALE, 0, -(h.z - g.z)); o.scale.set(h.r, 1, h.r * 1.25); o.rotation.y = h.k; o.userData.water.scale.setScalar(1 + Math.sin(t * 2.2 + h.k) * .025) })
      for (const e of g.events || []) {
        if (e.type === 'crash' || e.type === 'scrape' || e.type === 'npcCrash') fx.impact(e, e.type !== 'scrape')
        // Brown water thrown up both sides of the car, higher the faster you hit it.
        if (e.type === 'splash') { const k = Math.min(1, e.speed / 140); for (let i = 0; i < 14; i++) { const sx = i % 2 ? 1 : -1; fx.puff(px + sx * (1 + Math.random() * 1.6 * k), .3 + Math.random() * (1 + 2.2 * k), g.z - 1 + Math.random() * 3, i % 3 ? '#c9d6d8' : '#8d7b5c', .8 + k * 1.2, .9 + Math.random() * .6) } }
      }
      fx.update(dt, g.z)

      // Pooled lamp lights on the nearest streetlamps ahead (night only)
      if (nightK > .02) { const near = []; for (let z = Math.ceil((g.z - 20) / 40) * 40; near.length < lampLights.length && z < g.z + 170; z += 40) near.push(g.z - z); lampLights.forEach((l, i) => { l.intensity = i < near.length ? nightK * 55 : 0; if (i < near.length) l.position.set(-8.75, 8.2, near[i]) }) } else lampLights.forEach(l => { l.intensity = 0 })

      // Ground, water, horizon and sun follow the player
      if (groundMat.map) groundMat.map.offset.set(0, g.z / 8)

      // Camera: chase in the drive, orbit in menus
      const k = 1 - Math.exp(-dt * (g.mode === 'drive' ? 6 : 2.5))
      if (g.mode === 'drive') {
        // Something big right behind you (police van, danfo, BRT): lift the camera over it.
        let lift = 0
        for (const v of [...g.traffic, ...units]) { const d = g.z - v.z; if (d > 1 && d < 11 && Math.abs(v.x - g.x) * ROAD_SCALE < 2.4) lift = Math.max(lift, ['police', 'danfo', 'brt'].includes(v.kind) ? 2.8 : 1.5) }
        camLift += (lift - camLift) * Math.min(1, dt * 4)
        const back = 7.4 + speedK * 1.8 - camLift * .5, height = 3.1 - speedK * .5 + camLift
        // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
        // // The side street becomes the road ahead: carry the camera across into the new street's frame unchanged.
        // if ((g.turns || 0) !== lastTurns) {
        //   if (lastTurn) for (const v of [camPos, camLook]) v.sub(new T.Vector3(lastTurn.px, 0, -lastTurn.pz)).applyAxisAngle(UP, lastTurn.psi).add(new T.Vector3(px, 0, 0))
        //   lastTurns = g.turns || 0; lastTurn = null
        // }
        // if (tr) {
        //   // Chase cam swings round behind the car as it takes the corner.
        //   const fwd = new T.Vector3(Math.sin(tr.psi), 0, -Math.cos(tr.psi)), at = new T.Vector3(tr.px, 0, -tr.pz)
        //   camPos.lerp(at.clone().addScaledVector(fwd, -back).setY(height), k); camLook.lerp(at.clone().addScaledVector(fwd, 14).setY(1.2), k)
        //   lastTurn = { px: tr.px, pz: tr.pz, psi: tr.psi }
        // } else {
        camPos.lerp(new T.Vector3(px * .92 - player.rotation.y * 2.2, height, back), k)
        camLook.lerp(new T.Vector3(px * .9, 1.2, -14), k)
        // }
        const shake = g.shake ? g.shake * .6 : 0
        camera.position.set(camPos.x + (Math.random() - .5) * shake, camPos.y + (Math.random() - .5) * shake, camPos.z)
        boostFov += ((g.time < (g.boostUntil || 0) ? 14 : 0) - boostFov) * Math.min(1, dt * 5)
        camera.fov = 62 + speedK * 14 + boostFov
      } else {
        // Tall phone screens: pull the garage camera back and frame the car above the stats panel.
        const tall = clamp(.9 / camera.aspect, 1, 2.2), a = t * (g.mode === 'garage' ? .35 : .12) + .6, r = g.mode === 'garage' ? 6.2 * (1 + (tall - 1) * .75) : 9.5
        camPos.lerp(new T.Vector3(px + Math.sin(a) * r, g.mode === 'garage' ? 1.7 + (tall - 1) * 1.2 : 3.2, Math.cos(a) * r), k)
        camLook.lerp(new T.Vector3(px + (g.mode === 'garage' ? 0 : -1.5), g.mode === 'garage' ? .8 - (tall - 1) * 1.05 : .8, 0), k)
        camera.position.copy(camPos); camera.fov = g.mode === 'garage' ? 48 : 56
      }
      camera.lookAt(camLook); camera.updateProjectionMatrix()
      sky.position.copy(camera.position); clouds.position.copy(camera.position)
      sun.position.set(px + sunVec.x * 80, sunVec.y * 80, sunVec.z * 80 - 15); sun.target.position.set(px, 0, -15)
      stars.position.copy(camera.position); moon.position.copy(camera.position).addScaledVector(sunDir.y < 0 ? sunDir.clone().negate() : sunDir.clone().negate().setY(.35).normalize(), 450)
      renderer.setScissorTest(false); renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight)
      renderer.render(scene, camera)
      if (import.meta.env.DEV) { window.__drawCalls = renderer.info.render.calls; window.__scene = scene }
      // Rear-view mirror while olokpa is on your tail (not on phones, tablets or small windows: it covered the road ahead).
      if (p && g.mode === 'drive' && p.phase !== 'arrested' && !coarse.matches && canvas.clientWidth > 820 && canvas.clientHeight > 520) {
        // Bottom right; in a narrow window it sits centred under the top HUD.
        const cw = canvas.clientWidth, ch = canvas.clientHeight, narrow = cw < 820 || coarse.matches
        const mw = narrow ? Math.min(260, cw * .5) : Math.min(300, cw * .34), mh = mw / 3.4, mx = narrow ? (cw - mw) / 2 : cw - mw - 18, my = narrow ? ch - mh - (cw < ch ? 168 : 70) : ch - mh - 78
        mirrorCam.position.set(px, 1.9, -1); mirrorCam.lookAt(px, 1.2, 30)
        renderer.setScissorTest(true); renderer.setScissor(mx - 3, my - 3, mw + 6, mh + 6); renderer.setClearColor('#0b0f11'); renderer.clear()
        renderer.setScissor(mx, my, mw, mh); renderer.setViewport(mx, my, mw, mh); renderer.render(scene, mirrorCam)
        renderer.setScissorTest(false); renderer.setViewport(0, 0, cw, ch)
      }
    },
    // A driver shouts at you: bubble above their vehicle.
    // Warm-up: compile every shader the drive will need, then pre-build vehicles in idle frames,
    // so nothing compiles or builds mid-drive.
    async prewarm() {
      setTimeout(() => { ready = true }, 30e3)   // never leave the screen blank if a compile hangs
      const warm = [], add = o => { o.visible = true; o.position.set(0, -50, 0); warm.push(o) }
      for (let i = 1; i <= 3; i++) { const o = shadows(kit.police()); scene.add(o); policeObjs.set(i === 1 ? 'police' : `police${i}`, o); add(o) }
      officer = shadows(kit.person({ seed: 777, uniform: true })); officer.traverse(o => { if (o.isMesh) o.castShadow = true }); scene.add(officer); add(officer)
      for (const v of [{ kind: 'car', model: 0, tint: 0 }, { kind: 'danfo', tint: 0 }, { kind: 'keke', tint: 0 }, { kind: 'okada', tint: 0 }, { kind: 'brt' }, { kind: 'taxi', model: 0 }]) { const o = acquire(keyFor(v), () => shadows(kit.vehicle(v))); fx.fitVehicle(o); add(o) }
      // Compile everything in the scene, hidden things too (gantries, markers, pickups, effects), so nothing compiles mid-race.
      // One top-level object at a time with a frame in between, so the menus keep responding while it works.
      const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true } })
      try { await (renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera)) } catch { /* compile on first draw instead */ }
      for (const o of hidden) o.visible = false
      if (disposed) return
      for (const o of warm) { o.visible = false; if (o.userData.poolKey) release(o) }
      ready = true
      for (let model = 0; model < 8; model++) for (let tint = 0; tint < 8; tint += 2) buildQueue.push({ kind: 'car', model, tint })
      for (let tint = 0; tint < 8; tint++) buildQueue.push({ kind: 'danfo', tint }, { kind: 'keke', tint: tint % 4 }, { kind: 'okada', tint: tint % 4 })
      for (let model = 0; model < 3; model++) buildQueue.push({ kind: 'taxi', model })
    },
    markHit(id) { hitTags.add(id) },
    say(id, text, kind) {
      const obj = id.startsWith('police') ? policeObjs.get(id) : id === 'player' ? player : active.get(id)
      if (obj?.visible) fx.say(obj, text, kind, (obj.userData.belt || 1) + (obj.userData.kind === 'brt' ? 2.6 : 1.9))
    },
    dispose() {
      disposed = true; observer.disconnect(); fx.dispose()
      scene.traverse(o => { if (o.userData.owned) o.geometry.dispose(); if (o.isSprite) o.material.dispose() })
      streets.dispose()
      kit.dispose(); tex.dispose(); envRT.dispose(); pmrem.dispose(); sky.material.dispose(); envSky.material.dispose()
      renderer.dispose()
    },
  }
  function disposeOwned(obj) { obj.traverse(o => { if (o.userData.owned) o.geometry.dispose() }) }
}
