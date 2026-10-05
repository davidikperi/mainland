import * as T from 'three'
import { ROAD_SCALE } from './physics.js'

// Crash and driving effects. Particles and skid marks live in world space (metres
// across, distance along the road) and are re-projected each frame relative to the player.
export function createEffects(scene, tex, high) {
  const owned = []
  const keep = x => { owned.push(x); return x }

  // Sparks and glass shards share one additive point cloud.
  const MAX = high ? 500 : 220
  const sparkGeo = keep(new T.BufferGeometry())
  const positions = new Float32Array(MAX * 3), colors = new Float32Array(MAX * 3)
  sparkGeo.setAttribute('position', new T.BufferAttribute(positions, 3)); sparkGeo.setAttribute('color', new T.BufferAttribute(colors, 3))
  const sparkMat = keep(new T.PointsMaterial({ size: .22, map: tex.spark(), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }))
  const sparks = new T.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks)
  const parts = Array.from({ length: MAX }, () => ({ life: 0 }))
  let cursor = 0
  function spawn(x, y, wz, vx, vy, vz, life, rgb) {
    const p = parts[cursor]; cursor = (cursor + 1) % MAX
    Object.assign(p, { x, y, wz, vx, vy, vz, life, max: life, r: rgb[0], g: rgb[1], b: rgb[2] })
  }

  // Impact flash
  const flash = new T.PointLight('#ffb35c', 0, 14, 1.5); scene.add(flash)
  let flashWz = 0, flashX = 0

  // Smoke puffs (damaged engines, tyre smoke)
  const smokeTex = tex.smoke(), smokes = Array.from({ length: high ? 40 : 18 }, () => {
    const s = new T.Sprite(keep(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: '#9a9a9a' }))); s.visible = false; scene.add(s)
    return { s, life: 0 }
  })
  let smokeCursor = 0
  function puff(x, y, wz, color = '#8d8d8d', size = 1.2, life = 1.4) {
    const p = smokes[smokeCursor]; smokeCursor = (smokeCursor + 1) % smokes.length
    Object.assign(p, { x, y, wz, life, max: life, size }); p.s.material.color.set(color); p.s.visible = true
  }

  // Skid marks: instanced dark strips on the asphalt.
  const MARKS = high ? 220 : 110, MARK_LIFE = 6
  const markMat = keep(new T.MeshBasicMaterial({ color: '#0b0b0b', transparent: true, opacity: .34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  const markGeo = keep(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
  const marks = new T.InstancedMesh(markGeo, markMat, MARKS); marks.frustumCulled = false; marks.count = 0; scene.add(marks)
  const markData = []; let markCursor = 0
  const lastTrack = new Map()
  const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v3 = new T.Vector3(), s3 = new T.Vector3()
  // Lay rubber from the previous wheel position to this one.
  function track(key, x, wz, width = .16) {
    const last = lastTrack.get(key)
    lastTrack.set(key, { x, wz, t: performance.now() })
    if (!last || performance.now() - last.t > 120) return
    const dx = x - last.x, dz = wz - last.wz, len = Math.hypot(dx, dz)
    if (len < .25 || len > 6) return
    markData[markCursor] = { x: (x + last.x) / 2, wz: (wz + last.wz) / 2, len: len + .05, ang: Math.atan2(dx, dz), w: width, born: performance.now() }
    markCursor = (markCursor + 1) % MARKS; marks.count = Math.min(MARKS, marks.count + 1)
  }
  function stopTrack(key) { lastTrack.delete(key) }

  // Scratch decals, hazard lamps and individually glowing brake lights on a vehicle.
  const scratchTex = [tex.scratch(3), tex.scratch(11)], glowTex = tex.spark()
  let night = 0
  const hazardOn = keep(new T.MeshStandardMaterial({ color: '#ff9a1f', emissive: '#ff8a00', emissiveIntensity: 3 }))
  const hazardGeo = keep(new T.BoxGeometry(.1, .08, .06))
  function fitVehicle(obj) {
    if (obj.userData.fx) return obj.userData.fx
    const L = obj.userData.length || 4.6, W = obj.userData.width || 1.8, belt = obj.userData.belt || .9, fx = { decals: {}, hazards: [], tails: [], glows: [] }
    // Night-time lamp glow: warm halos up front, red at the back.
    const lampY = obj.userData.kind === 'okada' ? .98 : Math.max(.55, belt - .17), lampX = obj.userData.kind === 'okada' ? [0] : [-W * .32, W * .32]
    for (const x of lampX) for (const [z, color, size] of [[-L / 2 - .15, '#fff2c8', 1.5], [L / 2 + .12, '#ff2a2a', .7]]) { const g = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 })); g.position.set(x, lampY, z); g.scale.setScalar(size); g.visible = false; obj.add(g); fx.glows.push(g) }
    if (obj.userData.kind !== 'okada') {
      const h = Math.max(.3, belt - .25), y = .25 + h / 2
      const make = (side, w, x, z, ry, k) => { const m = new T.MeshStandardMaterial({ map: scratchTex[k], transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: .6, metalness: .3 }); const p = new T.Mesh(new T.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.visible = false; obj.add(p); fx.decals[side] = p }
      make('front', W * .95, 0, -L / 2 - .08, Math.PI, 0); make('rear', W * .95, 0, L / 2 + .08, 0, 1)
      make('right', L * .8, W / 2 + .03, 0, Math.PI / 2, 0); make('left', L * .8, -W / 2 - .03, 0, -Math.PI / 2, 1)
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const hz = new T.Mesh(hazardGeo, hazardOn); hz.position.set(x * (W / 2 - .05), belt - .12, z * (L / 2 + .06)); hz.visible = false; obj.add(hz); fx.hazards.push(hz) }
    }
    // Clone tail-lamp materials so each vehicle's brake lights glow on their own.
    obj.traverse(o => { if (o.isMesh && o.material?.userData?.tail) { o.material = o.material.clone(); fx.tails.push(o.material) } })
    obj.userData.fx = fx
    return fx
  }
  function showDamage(obj, dmg, { hazards = false, braking = false, time = 0 } = {}) {
    const fx = fitVehicle(obj)
    for (const side of ['front', 'rear', 'left', 'right']) {
      const p = fx.decals[side]; if (!p) continue
      const a = dmg ? Math.min(1, dmg[side] * 1.6) : 0
      p.visible = a > .02; p.material.opacity = a
    }
    const blink = hazards && Math.floor(time * 3) % 2 === 0
    for (const h of fx.hazards) h.visible = blink
    for (const m of fx.tails) m.emissiveIntensity = braking ? 2.6 : .35 + night * 1.2
    for (const gl of fx.glows) { gl.visible = night > .05; gl.material.opacity = night * (gl.material.color.r > .99 && gl.material.color.g < .5 ? (braking ? 1 : .6) : .9) }
  }

  // Speech bubbles from other drivers
  const bubbles = []
  function say(obj, text, kind, y = 3) {
    if (!obj) return
    for (const b of bubbles) if (b.obj === obj) b.until = 0
    const color = kind === 'police' ? { bg: '#1e5cc8', fg: '#ffffff' } : kind === 'race' ? { bg: '#ffc61a', fg: '#111111' } : {}
    const map = tex.bubble(text, color), s = new T.Sprite(new T.SpriteMaterial({ map, depthWrite: false, depthTest: false }))
    s.scale.set(4.6, .77, 1); s.position.set(0, y, 0); s.renderOrder = 10; obj.add(s)
    bubbles.push({ obj, s, map, until: performance.now() + 2800, born: performance.now() })
  }

  // Burst of sparks, shards and smoke at a crash point.
  function impact(e, big) {
    const x = e.x * ROAD_SCALE, k = Math.min(1, (e.impact || 30) / 100), count = Math.round((big ? 40 : 14) + k * (high ? 50 : 20))
    for (let i = 0; i < count; i++) spawn(x + (Math.random() - .5) * 1.4, .5 + Math.random() * .5, e.z, (Math.random() - .5) * 9, 1.5 + Math.random() * 5, (Math.random() - .5) * 9, .35 + Math.random() * .45, Math.random() > .25 ? [1, .62 + Math.random() * .3, .25] : [1, 1, 1])
    if (big && k > .4) for (let i = 0; i < 18; i++) spawn(x + (Math.random() - .5), .8, e.z, (Math.random() - .5) * 5, 2 + Math.random() * 3, (Math.random() - .5) * 5, .9, [.7, .85, 1])
    flash.intensity = big ? 40 + k * 60 : 18; flashWz = e.z; flashX = x
    if (big) for (let i = 0; i < 3; i++) puff(x + (Math.random() - .5) * 1.5, .6, e.z + (Math.random() - .5) * 1.5, '#a8a39b', 1.4 + k, 1.2)
  }

  return {
    impact, puff, track, stopTrack, showDamage, say, fitVehicle, setNight(n) { night = n },
    update(dt, gz) {
      // Particles
      for (let i = 0; i < MAX; i++) {
        const p = parts[i], j = i * 3
        if (p.life > 0) {
          p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.wz -= p.vz * dt
          if (p.y < .02) { p.y = .02; p.vy *= -.35; p.vx *= .6; p.vz *= .6 }
          const f = Math.max(0, p.life / p.max)
          positions[j] = p.x; positions[j + 1] = p.y; positions[j + 2] = -(p.wz - gz)
          colors[j] = p.r * f; colors[j + 1] = p.g * f; colors[j + 2] = p.b * f
        } else { colors[j] = colors[j + 1] = colors[j + 2] = 0; positions[j + 1] = -50 }
      }
      sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true
      flash.intensity *= Math.exp(-dt * 14); flash.position.set(flashX, 1.2, -(flashWz - gz))
      for (const p of smokes) {
        if (p.life <= 0) { p.s.visible = false; continue }
        p.life -= dt; p.y += dt * .9
        const f = 1 - p.life / p.max
        p.s.position.set(p.x, p.y, -(p.wz - gz)); p.s.scale.setScalar(p.size * (1 + f * 2.5)); p.s.material.opacity = .55 * (1 - f)
      }
      // Skid marks
      const now = performance.now()
      for (let i = 0; i < marks.count; i++) {
        // Marks wear away: they narrow to nothing over MARK_LIFE seconds.
        const d = markData[i], fade = Math.max(0, 1 - (now - d.born) / 1000 / MARK_LIFE)
        m4.compose(v3.set(d.x, .015, -(d.wz - gz)), q.setFromAxisAngle(up, d.ang), s3.set(d.w * fade, fade ? 1 : 0, d.len))
        marks.setMatrixAt(i, m4)
      }
      marks.instanceMatrix.needsUpdate = true
      // Bubbles pop in, hold, then go
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i], age = (now - b.born) / 1000
        b.s.scale.set(4.6 * Math.min(1, age * 6), .77 * Math.min(1, age * 6), 1)
        if (now > b.until) { b.obj.remove(b.s); b.s.material.dispose(); b.map.dispose(); bubbles.splice(i, 1) }
      }
    },
    dispose() { for (const o of owned) o.dispose(); for (const b of bubbles) { b.s.material.dispose(); b.map.dispose() } },
  }
}
