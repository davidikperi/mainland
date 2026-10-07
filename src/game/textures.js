import * as T from 'three'

// Deterministic pseudo-random so the same seed always paints the same building.
export const rand = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
const pick = (list, n) => list[Math.floor(rand(n) * list.length) % list.length]

export function createTextureKit(renderer) {
  const owned = []
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    draw(cv.getContext('2d'), w, h)
    const tex = new T.CanvasTexture(cv)
    if (srgb) tex.colorSpace = T.SRGBColorSpace
    tex.anisotropy = anisotropy
    if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping
    owned.push(tex); return tex
  }
  const loader = new T.TextureLoader(), photos = new Map()
  function loadPhoto(name) {
    if (!photos.has(name)) photos.set(name, Promise.all([['diff', true], ['nor', false]].map(([kind, srgb]) => new Promise(done => loader.load(`/assets/${name}_${kind}.jpg`, t => {
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = anisotropy
      if (srgb) t.colorSpace = T.SRGBColorSpace
      owned.push(t); done(t)
    }, undefined, () => done(null))))))
    return photos.get(name)
  }
  // Assign CC0 photo textures (public/assets, see scripts/fetch-assets.js) once loaded; the
  // procedural colour remains if a file is missing.
  function photo(material, name, { normal = true, normalScale = .8 } = {}) {
    material.userData.keep = true   // texture arrives later: never fold into plain colour
    loadPhoto(name).then(([map, nor]) => {
      // Keep a hint of the procedural tint over the photo.
      if (map) { material.map = map; material.color.lerp(new T.Color('#ffffff'), .7) }
      if (nor && normal) { material.normalMap = nor; material.normalScale.set(normalScale, normalScale) }
      material.needsUpdate = true
    })
    return material
  }

  function grime(ctx, w, h, seed, amount = 40) {
    for (let i = 0; i < amount; i++) {
      const x = rand(seed + i) * w, y = rand(seed + i * 3) * h, r = 8 + rand(seed + i * 7) * 40
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(60,45,30,${.05 + rand(i + seed) * .08})`); g.addColorStop(1, 'rgba(60,45,30,0)')
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // Rain streaks running down from window sills.
    for (let i = 0; i < amount / 2; i++) { ctx.fillStyle = `rgba(40,35,30,${.04 + rand(seed + i * 11) * .06})`; ctx.fillRect(rand(seed + i * 5) * w, rand(seed + i * 9) * h * .7, 2 + rand(i) * 4, 30 + rand(seed - i) * 90) }
  }

  // A multi-storey Nigerian commercial building front: louvre windows, burglar-proof bars,
  // split AC units, water tanks on the roofline and a painted shop sign at street level.
  function facade(seed, wall, shopName, floors) {
    // A matching night layer: lit windows and glowing shop signs, used as the emissive map.
    const nightCv = document.createElement('canvas'); nightCv.width = nightCv.height = 512
    const nctx = nightCv.getContext('2d'); nctx.fillStyle = '#000'; nctx.fillRect(0, 0, 512, 512)
    const day = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(${rand(i) > .5 ? '255,255,255' : '0,0,0'},.035)`; ctx.fillRect(rand(seed + i) * w, rand(seed - i) * h, 3, 3) }
      const groundH = h / (floors + .6) * 1.25, floorH = (h - groundH) / floors, cols = 3 + Math.floor(rand(seed) * 3)
      const frame = pick(['#f1efe6', '#3d3a36', '#7a4a2a', '#e8e1cf'], seed + 2), glass = pick(['#2f4650', '#3c5a63', '#24343a', '#4f6e74'], seed + 4)
      for (let f = 0; f < floors; f++) {
        const y = f * floorH
        ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, y + floorH - 6, w, 6)
        for (let c = 0; c < cols; c++) {
          const cw = w / cols, wx = c * cw + cw * .18, ww = cw * .64, wy = y + floorH * .2, wh = floorH * .55
          if (rand(seed + f * 9 + c) < .1) continue
          ctx.fillStyle = frame; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8)
          ctx.fillStyle = glass; ctx.fillRect(wx, wy, ww, wh)
          if (rand(seed * 3 + f * 17 + c * 5) > .45) { nctx.fillStyle = pick(['#ffd28a', '#ffe6b8', '#f6c56b', '#cfe3ff'], seed + f + c * 3); nctx.fillRect(wx, wy, ww, wh) }
          // Glass louvres
          ctx.fillStyle = 'rgba(200,225,230,.18)'; for (let l = wy + 4; l < wy + wh; l += 8) ctx.fillRect(wx, l, ww, 3)
          if (rand(seed + f + c * 4) > .45) { ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 2; for (let b = wx + 6; b < wx + ww; b += 10) { ctx.beginPath(); ctx.moveTo(b, wy); ctx.lineTo(b, wy + wh); ctx.stroke() } }
          if (rand(seed + f * 3 + c) > .6) { ctx.fillStyle = '#e9e9e4'; ctx.fillRect(wx + ww * .2, wy + wh + 6, ww * .6, floorH * .16); ctx.fillStyle = '#9a9a96'; ctx.fillRect(wx + ww * .25, wy + wh + 9, ww * .5, 3) }
          if (rand(seed + f * 5 + c * 2) > .82) { ctx.fillStyle = pick(['#c43d3d', '#2f7d4f', '#e7b43a', '#3b6aa8'], seed + f + c); ctx.fillRect(wx + ww * .1, wy + wh * .55, ww * .8, wh * .4) }
        }
      }
      const gy = h - groundH
      ctx.fillStyle = '#3a3936'; ctx.fillRect(0, gy, w, groundH)
      const bays = 2 + Math.floor(rand(seed + 6) * 2)
      for (let b = 0; b < bays; b++) {
        const bw = w / bays, bx = b * bw + 8
        ctx.fillStyle = rand(seed + b) > .4 ? '#8d9294' : '#5c4636'; ctx.fillRect(bx, gy + groundH * .42, bw - 16, groundH * .58)
        ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let s = gy + groundH * .42; s < h; s += 6) ctx.fillRect(bx, s, bw - 16, 2)
        if (rand(seed + b * 7) > .45) { ctx.fillStyle = '#1b1a18'; ctx.fillRect(bx + 10, gy + groundH * .5, bw - 36, groundH * .5); ctx.fillStyle = pick(['#d64933', '#f0c23b', '#3f8f5a', '#e8e3d3'], seed + b); for (let i = 0; i < 6; i++) ctx.fillRect(bx + 16 + i * (bw - 50) / 6, gy + groundH * .62 + rand(i + b) * 20, 12, 18) }
      }
      const signBg = pick(['#c8302b', '#1f6b45', '#f2c230', '#163f78', '#f4f1e6', '#6b2c7a'], seed + 8)
      const dark = signBg === '#f2c230' || signBg === '#f4f1e6'
      ctx.fillStyle = signBg; ctx.fillRect(0, gy, w, groundH * .38)
      nctx.fillStyle = signBg; nctx.fillRect(0, gy, w, groundH * .38); nctx.fillStyle = '#ffcf7a'; nctx.fillRect(16, gy + groundH * .5, w - 32, groundH * .4)
      ctx.fillStyle = dark ? '#1a1a1a' : '#fff8e5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      let size = 44; ctx.font = `900 ${size}px Impact, Arial Black, sans-serif`
      while (ctx.measureText(shopName).width > w - 30 && size > 16) { size -= 2; ctx.font = `900 ${size}px Impact, Arial Black, sans-serif` }
      ctx.fillText(shopName, w / 2, gy + groundH * .2)
      ctx.font = '600 13px Arial'; ctx.fillText(pick(['TEL: 0803 •••• 412', 'WE DEAL IN ALL KINDS', 'NO CREDIT TODAY, COME TOMORROW', 'GOD FIRST', 'OPEN 7AM – 10PM'], seed + 9), w / 2, gy + groundH * .34)
      grime(ctx, w, h, seed)
      // Shop name glows at night too.
      nctx.drawImage(ctx.canvas, 0, gy, w, groundH * .38, 0, gy, w, groundH * .38)
    })
    const night = new T.CanvasTexture(nightCv); night.colorSpace = T.SRGBColorSpace; owned.push(night)
    day.userData.night = night
    return day
  }

  function sign(lines, { w = 512, h = 128, bg = '#174a36', fg = '#ffffff', border = '#ffffff', font = 'Arial Black, Impact, sans-serif' } = {}) {
    return canvasTexture(w, h, (ctx) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = Math.max(3, h * .04); ctx.strokeRect(h * .05, h * .05, w - h * .1, h * .9) }
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const list = Array.isArray(lines) ? lines : [lines]
      list.forEach((line, i) => {
        const major = i === 0; let size = major ? h * (list.length > 1 ? .42 : .55) : h * .2
        ctx.font = `${major ? 900 : 600} ${size}px ${font}`
        while (ctx.measureText(line).width > w * .9 && size > 8) { size -= 2; ctx.font = `${major ? 900 : 600} ${size}px ${font}` }
        ctx.fillText(line, w / 2, list.length === 1 ? h / 2 : major ? h * .4 : h * .78)
      })
    })
  }

  // Nigerian number plate: white with green state name and blue tagline.
  function plate(text, state = 'LAGOS', motto = 'CENTRE OF EXCELLENCE') {
    return canvasTexture(256, 72, (ctx, w, h) => {
      ctx.fillStyle = '#f7f7f2'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4)
      ctx.textAlign = 'center'; ctx.fillStyle = '#1d7a3a'; ctx.font = '900 13px Arial'; ctx.fillText(state, w / 2, 16)
      ctx.fillStyle = '#111'; ctx.font = '900 34px Arial'; ctx.fillText(text, w / 2, 50)
      ctx.fillStyle = '#1e4fa1'; ctx.font = '700 9px Arial'; ctx.fillText(motto, w / 2, 65)
    })
  }

  // Danfo side: yellow with the two black stripes and a hand-painted slogan.
  function danfoSide(seed) {
    const slogan = pick(['NO FOOD FOR LAZY MAN', 'GOD DEY', 'SHINE YOUR EYE', 'NO KING AS GOD', 'MONEY MISS ROAD', 'MOTHER\'S PRAYER', 'ONE DAY YES', 'EKO FOR SHOW'], seed)
    return canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#f1b51c'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#141414'; ctx.fillRect(0, h * .58, w, h * .07); ctx.fillRect(0, h * .72, w, h * .07)
      ctx.fillStyle = '#141414'; ctx.font = 'italic 900 26px Impact, Arial Black'; ctx.textAlign = 'center'; ctx.fillText(slogan, w / 2, h * .93)
      grime(ctx, w, h, seed, 25)
    })
  }
  function policeSide() {
    return canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#121a2c'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#e9edf3'; ctx.fillRect(0, h * .5, w, h * .22)
      ctx.fillStyle = '#1e5cc8'; for (let x = 0; x < w; x += 32) ctx.fillRect(x, h * .5, 16, h * .22)
      ctx.fillStyle = '#ffffff'; ctx.font = '900 48px Arial Black, Impact'; ctx.textAlign = 'center'; ctx.fillText('POLICE', w / 2, h * .42)
      ctx.font = '700 15px Arial'; ctx.fillText('NIGERIA POLICE FORCE · CALL 112', w / 2, h * .86)
    })
  }
  function brtSide(city) {
    return canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#1d4f9c'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#d23a2f'; ctx.fillRect(0, h * .72, w, h * .1); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, h * .66, w, h * .05)
      ctx.fillStyle = '#ffffff'; ctx.font = '900 46px Arial Black'; ctx.textAlign = 'left'; ctx.fillText(city === 'Lagos' ? 'LAGOS BRT' : 'FCT MASS TRANSIT', 40, h * .94)
    })
  }
  function taxiSide() {
    return canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f2b41e'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#121212'; ctx.fillRect(0, h * .52, w, h * .12)
      for (let x = 0; x < w; x += 16) { ctx.fillStyle = (x / 16) % 2 ? '#121212' : '#f2b41e'; ctx.fillRect(x, h * .64, 16, h * .08) }
    })
  }
  function kerb() {
    return canvasTexture(128, 16, (ctx, w, h) => { ctx.fillStyle = '#e8c21e'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w / 2, h) }, { repeat: true })
  }
  // Ankara wax-print fabric for clothes and umbrellas.
  function ankara(seed) {
    const palettes = [['#e2572b', '#1f3f8a', '#f2c230', '#1b1b1b'], ['#2c8a57', '#f0a020', '#7a1f4a', '#f6efe0'], ['#3a2a8a', '#e94b6b', '#f5d142', '#1d1d1d'], ['#b5302a', '#f3e2b3', '#1f6b8f', '#2b2b2b']]
    const [a, b, c, d] = pick(palettes, seed)
    return canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = a; ctx.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
        const o = (y / 32) % 2 ? 16 : 0
        ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x + o + 16, y + 16, 12, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + o + 16, y + 16, 6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = d; ctx.fillRect(x + o + 14, y + 2, 4, 4)
      }
    }, { repeat: true })
  }
  function bubble(text, { bg = '#ffffff', fg = '#151515' } = {}) {
    return canvasTexture(768, 128, (ctx, w, h) => {
      ctx.fillStyle = bg; ctx.strokeStyle = '#151515'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 34, 30); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(w / 2 - 18, h - 31); ctx.lineTo(w / 2, h - 4); ctx.lineTo(w / 2 + 18, h - 31); ctx.fill()
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      let size = 46; ctx.font = `900 ${size}px Impact, Arial Black`
      while (ctx.measureText(text).width > w - 60 && size > 18) { size -= 2; ctx.font = `900 ${size}px Impact, Arial Black` }
      ctx.fillText(text, w / 2, (h - 28) / 2 + 4)
    })
  }
  // Maker badges, drawn so each classic is recognisable at a glance.
  function emblem(kind) {
    return canvasTexture(128, 128, (ctx, w) => {
      const c = w / 2, silver = ctx.createLinearGradient(0, 0, w, w); silver.addColorStop(0, '#ffffff'); silver.addColorStop(.5, '#a9b0b5'); silver.addColorStop(1, '#eef1f3')
      ctx.clearRect(0, 0, w, w); ctx.fillStyle = silver; ctx.strokeStyle = silver
      if (kind === 'merc') {
        ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(c, c, 52, 0, Math.PI * 2); ctx.stroke()
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * 50, c + Math.sin(a) * 50); ctx.lineTo(c + Math.cos(a + 1.75) * 9, c + Math.sin(a + 1.75) * 9); ctx.lineTo(c, c); ctx.lineTo(c + Math.cos(a - 1.75) * 9, c + Math.sin(a - 1.75) * 9); ctx.closePath(); ctx.fill() }
      } else if (kind === 'toyota') {
        ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(c, c, 58, 40, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.ellipse(c, c - 12, 34, 14, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(c, c + 6, 13, 30, 0, 0, Math.PI * 2); ctx.stroke()
      } else if (kind === 'peugeot') {
        ctx.beginPath(); ctx.moveTo(24, 14); ctx.lineTo(104, 14); ctx.lineTo(104, 70); ctx.quadraticCurveTo(104, 104, 64, 120); ctx.quadraticCurveTo(24, 104, 24, 70); ctx.closePath(); ctx.fill()
        // Rampant lion silhouette
        ctx.fillStyle = '#1b3f8f'; ctx.beginPath(); ctx.moveTo(52, 100); ctx.lineTo(58, 70); ctx.lineTo(46, 58); ctx.lineTo(56, 52); ctx.lineTo(54, 34); ctx.lineTo(66, 26); ctx.lineTo(80, 32); ctx.lineTo(74, 44); ctx.lineTo(82, 56); ctx.lineTo(72, 64); ctx.lineTo(76, 100); ctx.lineTo(66, 84); ctx.closePath(); ctx.fill()
      } else if (kind === 'honda') {
        // Honda: the tall chrome H in a rounded square
        ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(16, 22, 96, 84, 22); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(52, 36); ctx.lineTo(54, 58); ctx.lineTo(74, 58); ctx.lineTo(76, 36); ctx.lineTo(88, 36); ctx.lineTo(84, 94); ctx.lineTo(72, 94); ctx.lineTo(73, 70); ctx.lineTo(55, 70); ctx.lineTo(56, 94); ctx.lineTo(44, 94); ctx.closePath(); ctx.fill()
      } else if (kind === 'lexus') {
        // Lexus: the slanted L in an oval
        ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(c, c, 58, 42, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(62, 30); ctx.lineTo(42, 92); ctx.lineTo(96, 92); ctx.stroke()
      } else {
        ctx.fillStyle = '#c8102e'; ctx.font = '900 italic 54px Arial Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R/T', c, c)
      }
    })
  }
  function badge(text, color = '#e6eaec') {
    return canvasTexture(256, 64, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.fillStyle = color; ctx.font = '900 italic 40px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; let s = 40; while (ctx.measureText(text).width > w - 10) { s -= 2; ctx.font = `900 italic ${s}px Arial Black` } ctx.fillText(text, w / 2, h / 2 + 2) })
  }
  // Wheel faces: Mercedes "15-hole", Peugeot chrome hubcap, Camry 5-spoke, Challenger split-spoke.
  function rimFace(style) {
    return canvasTexture(128, 128, (ctx, w) => {
      const c = w / 2; ctx.clearRect(0, 0, w, w)
      const metal = ctx.createRadialGradient(c - 15, c - 15, 5, c, c, 64); metal.addColorStop(0, style === 'split' ? '#4a4d50' : '#f4f6f7'); metal.addColorStop(1, style === 'split' ? '#1d1f21' : '#8d969b')
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(c, c, 63, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#16191b'
      if (style === 'bundt') { for (let k = 0; k < 15; k++) { const a = k / 15 * Math.PI * 2; ctx.beginPath(); ctx.arc(c + Math.cos(a) * 42, c + Math.sin(a) * 42, 7.5, 0, Math.PI * 2); ctx.fill() } }
      else if (style === 'hubcap') { ctx.strokeStyle = '#7d868b'; ctx.lineWidth = 3; for (const r of [56, 40, 24]) { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke() } }
      else if (style === 'fivespoke' || style === 'split') {
        ctx.fillStyle = style === 'split' ? '#0c0d0e' : '#2a2e31'
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + Math.PI / 5; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, 56, a - .42, a + .42); ctx.closePath(); ctx.fill() }
        if (style === 'split') { ctx.strokeStyle = '#0c0d0e'; ctx.lineWidth = 4; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * 14, c + Math.sin(a) * 14); ctx.lineTo(c + Math.cos(a) * 56, c + Math.sin(a) * 56); ctx.stroke() } ctx.fillStyle = '#c8102e'; ctx.fillRect(c + 20, c - 30, 14, 26) }
      } else { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(c + Math.cos(a) * 36, c + Math.sin(a) * 36, 8, 0, Math.PI * 2); ctx.fill() } }
      ctx.fillStyle = '#c3cacd'; ctx.beginPath(); ctx.arc(c, c, 11, 0, Math.PI * 2); ctx.fill()
    })
  }
  // Rear lamp clusters per model (also used as the emissive map for brake lights).
  function tailLight(style) {
    return canvasTexture(256, 96, (ctx, w, h) => {
      ctx.fillStyle = '#2a0406'; ctx.fillRect(0, 0, w, h)
      if (style === 'ribbed') {
        const cols = [['#b8121b', .5], ['#e8891c', .25], ['#e9e5dc', .25]]; let x = 0
        for (const [c, f] of cols) { ctx.fillStyle = c; ctx.fillRect(x, 0, w * f, h); x += w * f }
        ctx.fillStyle = 'rgba(0,0,0,.45)'; for (let y = 10; y < h; y += 14) ctx.fillRect(0, y, w, 4)
      } else if (style === 'bar') {
        ctx.fillStyle = '#ff2030'; for (let x = 12; x < w - 12; x += 14) ctx.fillRect(x, 30, 9, 36)
      } else if (style === 'camry') {
        ctx.fillStyle = '#c2141e'; ctx.fillRect(0, 0, w * .7, h); ctx.fillStyle = '#e6e2da'; ctx.fillRect(w * .7, 10, w * .3, h - 20); ctx.fillStyle = '#e8891c'; ctx.fillRect(w * .7, 0, w * .3, 12)
      } else if (style === 'accord') {
        ctx.fillStyle = '#b8101a'; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(w, 8); ctx.lineTo(w, h - 8); ctx.lineTo(w * .35, h - 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d7dadc'; ctx.fillRect(0, h * .45, w * .55, 8)
      } else if (style === 'lexus') {
        ctx.fillStyle = '#d0141f'; ctx.fillRect(0, 12, w, h - 24); ctx.fillStyle = '#ff5a5a'; for (let x = 10; x < w - 10; x += 12) ctx.fillRect(x, h / 2 - 3, 8, 6); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(w * .62, 12, w * .38, 18)
      } else if (style === 'g') {
        ctx.fillStyle = '#c2141e'; ctx.fillRect(0, 0, w, h * .45); ctx.fillStyle = '#e8891c'; ctx.fillRect(0, h * .45, w, h * .25); ctx.fillStyle = '#e6e2da'; ctx.fillRect(0, h * .7, w, h * .3)
      } else { ctx.fillStyle = '#c2141e'; ctx.fillRect(0, h * .3, w, h * .7); ctx.fillStyle = '#e8891c'; ctx.fillRect(0, 0, w, h * .3) }
      ctx.strokeStyle = '#d7dadc'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6)
    })
  }
  // Transparent scratch and dent overlay for crash damage.
  function scratch(seed = 1) {
    return canvasTexture(512, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < 26; i++) { const x = rand(seed + i) * w, y = rand(seed + i * 3) * h, r = 20 + rand(seed + i * 5) * 60; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(20,18,16,.55)'); g.addColorStop(1, 'rgba(20,18,16,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2) }
      for (let i = 0; i < 70; i++) {
        const x = rand(seed + i * 7) * w, y = rand(seed + i * 11) * h, len = 30 + rand(i + seed) * 160, a = (rand(seed - i) - .5) * .6
        ctx.strokeStyle = rand(i * 13 + seed) > .4 ? 'rgba(235,238,240,.85)' : 'rgba(60,62,64,.8)'; ctx.lineWidth = 1 + rand(i) * 2.5
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke()
      }
    })
  }
  // Floating model tag: make, model, year, class stars and what beating this driver pays.
  const TIER_COLOURS = ['#9aa3a8', '#c98a4b', '#d9dee2', '#ffc61a', '#c77dff', '#ff4d6d']
  function tag({ make, name, year, tier, value, taxi }) {
    return canvasTexture(512, 132, (ctx, w, h) => {
      const col = TIER_COLOURS[tier] || '#ffffff'
      ctx.fillStyle = 'rgba(10,16,20,.84)'; ctx.strokeStyle = col; ctx.lineWidth = 6
      ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 12, 26); ctx.fill(); ctx.stroke()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'
      const title = `${make} ${name}`; let size = 44; ctx.font = `900 ${size}px Arial Black, Impact`
      while (ctx.measureText(title).width > w - 50 && size > 18) { size -= 2; ctx.font = `900 ${size}px Arial Black, Impact` }
      ctx.fillText(title, w / 2, 46)
      ctx.fillStyle = col; ctx.font = '800 30px Arial'
      ctx.fillText(`${taxi ? 'TAXI · ' : ''}${year} · ${'★'.repeat(tier)}${'☆'.repeat(Math.max(0, 5 - tier))} · ₦${value}`, w / 2, 96)
    })
  }
  function smoke() {
    return canvasTexture(128, 128, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w) })
  }
  function spark() {
    return canvasTexture(64, 64, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,220,140,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w) })
  }
  function checker(text) {
    return canvasTexture(1024, 192, (ctx, w, h) => {
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { ctx.fillStyle = ((x + y) / 32) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(x, y, 32, 32) }
      if (!text) return   // plain chequer: road strip and flags
      ctx.fillStyle = '#ffc61a'; ctx.fillRect(w * .28, 24, w * .44, h - 48); ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.strokeRect(w * .28, 24, w * .44, h - 48)
      let size = 100; ctx.font = `900 ${size}px Impact, Arial Black`
      while (ctx.measureText(text).width > w * .4 && size > 40) { size -= 4; ctx.font = `900 ${size}px Impact, Arial Black` }
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 6)
    })
  }
  function leaf() {
    return canvasTexture(64, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#4c7a35'
      ctx.fillRect(w / 2 - 2, 0, 4, h)
      for (let y = 6; y < h; y += 7) { const len = (w / 2) * Math.sin(Math.PI * y / h); ctx.fillStyle = y % 14 ? '#5d8a3e' : '#46702f'; ctx.fillRect(w / 2 - len, y, len * 2, 4) }
    })
  }
  function windows(seed) {
    return canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#5f7c86'; ctx.fillRect(0, 0, w, h)
      for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 16) { ctx.fillStyle = rand(seed + x * 3 + y) > .7 ? '#b9d2d6' : '#3d5560'; ctx.fillRect(x, y, 12, 8) }
    }, { repeat: true })
  }
  return { canvasTexture, photo, facade, sign, plate, danfoSide, policeSide, brtSide, taxiSide, kerb, ankara, bubble, leaf, windows, emblem, badge, rimFace, tailLight, scratch, tag, smoke, spark, checker, dispose() { for (const t of owned) t.dispose() } }
}
