// Naija Rush promo: records real gameplay from the dev build, frame by frame, plus the OG image.
//   npm run dev                                   (in another terminal; this script drives http://127.0.0.1:5173)
//   FFMPEG=path/to/ffmpeg node scripts/video/gameplay.mjs video marketing/naija-rush-15s.mp4
//   node scripts/video/gameplay.mjs og public/og-image.png
// The page's clock is taken over: every frame advances game time, timers and CSS animations by exactly 1/30 s and is
// then screenshotted, so the video is smooth at 30 fps however slowly the capture runs. A simple autopilot drives;
// scenes are set up through the dev-only window.__mainland handle, with captions overlaid in the page.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [mode = 'video', outArg] = process.argv.slice(2)
const FPS = 30, SECONDS = 15, PORT = 9411, URL = process.env.GAME_URL || 'http://127.0.0.1:5173/'
const [W, H] = mode === 'og' ? [1200, 630] : [1920, 1080]
const out = resolve(outArg || (mode === 'og' ? 'public/og-image.png' : 'marketing/naija-rush-15s.mp4'))
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = spawn(process.env.BROWSER || BROWSERS.find(existsSync), ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rush-promo-'))}`, 'about:blank'], { stdio: 'ignore' })
let wsUrl
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === 'page')?.webSocketDebuggerUrl } catch { /* starting */ } await sleep(250) }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let nextId = 0; const pending = new Map(), errors = []
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text) })
const send = (method, params = {}) => new Promise(r => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error'); return r.result?.result?.value }

// Virtual clock, installed before the game loads: performance.now, requestAnimationFrame and longer timers follow it
// once __virtual.start() is called; __virtual.step(ms) advances it, runs one game frame and moves CSS animations on.
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRaf = requestAnimationFrame.bind(window), realCancel = cancelAnimationFrame.bind(window)
  const realST = setTimeout.bind(window), realCT = clearTimeout.bind(window)
  let virtual = false, vnow = 0, queue = [], rafId = 1, timers = [], timerId = 1e7
  performance.now = () => virtual ? vnow : realNow()
  window.requestAnimationFrame = cb => { if (!virtual) return realRaf(cb); const id = rafId++; queue.push([id, cb]); return id }
  window.cancelAnimationFrame = id => { queue = queue.filter(q => q[0] !== id); realCancel(id) }
  window.setTimeout = (fn, ms = 0, ...a) => { if (!virtual || ms < 100) return realST(fn, ms, ...a); const id = timerId++; timers.push({ id, at: vnow + ms, fn, a }); return id }
  window.clearTimeout = id => { if (id >= 1e7) timers = timers.filter(t => t.id !== id); else realCT(id) }
  window.__virtual = {
    start() { vnow = realNow(); virtual = true },
    async step(ms) {
      vnow += ms
      const due = timers.filter(t => t.at <= vnow); timers = timers.filter(t => t.at > vnow); for (const t of due) try { t.fn(...t.a) } catch (e) { console.error(e) }
      const q = queue; queue = []; for (const [, cb] of q) cb(vnow)
      await new Promise(r => realST(r, 0)); await new Promise(r => realST(r, 0))
      for (const an of document.getAnimations()) { if (an.__v0 === undefined) { an.__v0 = vnow - ms; an.pause() } an.currentTime = vnow - an.__v0 }
    },
  }
})()`

// Scene helpers that run in the page.
const HELPERS = `(() => {
  const G = () => window.__mainland.game.current, K = () => window.__mainland.keys.current
  // Autopilot: hold the revs in the sweet spot on the grid, then pick the clearest lane ahead and steer into it.
  window.__drive = () => {
    const g = G(), k = K(); if (!g?.race) return
    if (!g.race.launched) { k.w = (g.rpm || 0) < 4000; return }
    k.w = true
    const lanes = [-.55, 0, .55], free = x => { let d = 999; for (const v of g.traffic) { const dz = v.z - g.z; if (dz > -2 && dz < 90 && Math.abs(v.x - x) < .34) d = Math.min(d, dz) } return d }
    let target = g.__lane ?? 0
    if (free(target) < 50) target = lanes.map(x => [x, free(x) - Math.abs(x - g.x) * 25]).sort((a, b) => b[1] - a[1])[0][0]
    g.__lane = target; k.a = g.x > target + .04; k.d = g.x < target - .04
    g.damage = Math.min(g.damage || 0, 30); g.arrestMeter = 0; g.wrecked = false; g.nextFight = g.time + 99
  }
  // Jump the race to world position z (a cut): traffic and rivals come along, nothing counts as crossed.
  window.__cut = (z, { speed = 140, x = 0, rivals = [], police = false, keepTraffic = true } = {}) => {
    const g = G(), dz = z - g.z
    for (const v of g.traffic) if (!v.fixed && v.rival === undefined && keepTraffic) { v.z += dz; v.previousZ = v.z }
    g.z = g.previousZ = z; g.x = x; g.__lane = x; g.speed = speed; g.steer = 0
    if (!police) { g.police = null; g.backup = []; g.heat = 0; g.wanted = 0 }
    g.reckless = 0; g.events = []
    g.traffic.filter(v => v.rival !== undefined).forEach((v, i) => { const r = rivals[i] || [-200 - i * 30, 0]; v.z = v.previousZ = z + r[0]; v.x = v.tx = r[1]; v.speed = r[2] ?? speed; v.attackAt = g.time + 60 })
    // Clear the lane right in front so the cut doesn't open on a crash.
    for (const v of g.traffic) if (!v.fixed && v.rival === undefined && v.z > z - 8 && v.z < z + 25 && Math.abs(v.x - x) < .35) { v.z += 60; v.previousZ = v.z }
  }
  // Something kicks off ahead: a tyre blowout in the next lane and a danfo swerving across.
  window.__chaos = () => {
    const g = G(), ahead = g.traffic.filter(v => !v.fixed && v.rival === undefined && v.z - g.z > 55 && v.z - g.z < 140 && Math.abs(v.x) > .3).sort((a, b) => a.z - b.z)
    if (ahead[0]) { ahead[0].hold = g.time + 7; ahead[0].skid = 1; g.message = 'WAHALA AHEAD! Danfo tyre don burst!' }
    if (ahead[1]) { ahead[1].tx = ahead[1].x > 0 ? .86 : -.86; ahead[1].laneTimer = g.time + 3 }
  }
  window.__nitro = () => { const g = G(); g.nitro = Math.max(g.nitro || 0, 1); K().nTap = true }
  // Captions and the end card, animated by CSS (which follows the virtual clock).
  const css = document.createElement('style'); css.textContent = \`
    .key-hints, .chat { display: none !important }
    #promo { position: fixed; inset: 0; pointer-events: none; z-index: 50; font-family: 'Lilita One', sans-serif; }
    #promo .cap { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%) skewX(-8deg); white-space: nowrap; font-size: 92px; line-height: 1; color: #ffc61a; letter-spacing: 1px;
      -webkit-text-stroke: 5px #10161a; paint-order: stroke fill; text-shadow: 0 8px 0 #10161a, 0 0 50px rgba(255, 150, 30, .6); animation: cap-in .32s cubic-bezier(.2, 1.6, .4, 1) both, cap-out .2s ease-in var(--out) both; }
    #promo .cap.white { color: #fffdf5 } #promo .cap.blue { color: #8fc4ff; text-shadow: 0 8px 0 #10161a, 0 0 60px rgba(60, 140, 255, .8) } #promo .cap.red { color: #ff5a3c }
    #promo .cap small { display: block; font: 800 30px 'Barlow Condensed', sans-serif; letter-spacing: 8px; color: #fffdf5; -webkit-text-stroke: 0; text-shadow: 0 3px 8px rgba(0,0,0,.8); margin-top: 10px; text-align: center }
    @keyframes cap-in { 0% { opacity: 0; transform: translateX(-50%) skewX(-8deg) scale(1.9) } 100% { opacity: 1; transform: translateX(-50%) skewX(-8deg) scale(1) } }
    @keyframes cap-out { to { opacity: 0; transform: translateX(-60%) skewX(-8deg) scale(.95) } }
    #promo .flash { position: absolute; inset: 0; background: #fffdf5; animation: flash .35s ease-out both }
    @keyframes flash { from { opacity: .95 } to { opacity: 0 } }
    #promo .end { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 22px; background: radial-gradient(ellipse at 50% 45%, rgba(10,6,20,.45), rgba(5,4,10,.88)); animation: fade .35s ease both }
    @keyframes fade { from { opacity: 0 } }
    #promo .end h1 { margin: 0; font-size: 210px; line-height: .9; color: #ffc61a; transform: skewX(-9deg); -webkit-text-stroke: 7px #10161a; paint-order: stroke fill;
      text-shadow: 0 6px 0 #c98a00, 0 12px 0 #10161a, 0 26px 50px rgba(0,0,0,.6); animation: slam .3s cubic-bezier(.2, 1.4, .4, 1) both }
    @keyframes slam { from { opacity: 0; transform: skewX(-9deg) scale(2.6) } }
    #promo .end .band { font: 800 52px 'Barlow Condensed', sans-serif; letter-spacing: 10px; color: #fffdf5; background: linear-gradient(180deg, #ff4a38, #ee3b2b); padding: 6px 34px 8px; transform: skewX(-14deg); box-shadow: 0 7px 0 #a3190e; animation: rise .35s .25s ease-out both }
    #promo .end .row { display: flex; gap: 22px; align-items: center; animation: rise .35s .5s ease-out both }
    #promo .end .play { font-size: 60px; color: #fff; padding: 14px 44px 18px; border-radius: 20px; background: linear-gradient(180deg, #34c862, #1fa34a); box-shadow: 0 8px 0 #0f6b2e; border: 4px solid rgba(255,255,255,.65); text-shadow: 0 3px 0 #0f6b2e }
    #promo .end .chip { font: 700 34px 'Barlow Condensed', sans-serif; letter-spacing: 4px; color: #fffdf5; padding: 12px 22px; border-radius: 14px; border: 3px solid rgba(255,255,255,.35); background: rgba(255,255,255,.1) }
    @keyframes rise { from { opacity: 0; transform: translateY(30px) } }
  \`; document.head.appendChild(css)
  const box = document.createElement('div'); box.id = 'promo'; document.body.appendChild(box)
  window.__cap = (html, cls = '', ms = 2000) => { const d = document.createElement('div'); d.className = 'cap ' + cls; d.innerHTML = html; d.style.setProperty('--out', (ms - 200) + 'ms'); box.appendChild(d); setTimeout(() => d.remove(), ms + 50) }
  window.__flash = () => { const d = document.createElement('div'); d.className = 'flash'; box.appendChild(d); setTimeout(() => d.remove(), 400) }
  window.__end = () => { box.insertAdjacentHTML('beforeend', '<div class="end"><h1>NAIJA RUSH</h1><div class="band">STREET RACING · LAGOS &amp; ABUJA</div><div class="row"><div class="play">PLAY FREE ▸</div><div class="chip">IN YOUR BROWSER</div></div></div>') }
})()`

await send('Page.enable'); await send('Runtime.enable')
// Exact page size, whatever the headless window chrome takes.
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK + `;localStorage.setItem('mainland-save', JSON.stringify({ name: 'Eko Flash', color: '#e8402f', avatar: '01', points: 4200, car: 3, owned: [0, 1, 3, 4], upgrades: [2, 2, 1], onboarded: true }));localStorage.setItem('mainland-weather', 'sunny');localStorage.setItem('mainland-time', 'day');localStorage.setItem('mainland-skip-briefing', '1');localStorage.setItem('mainland-music', 'off')` })
await send('Page.navigate', { url: URL })
for (let i = 0; !(await js(`[...document.querySelectorAll('button')].some(b => b.textContent === 'RACE!' && !b.disabled)`).catch(() => false)); i++) { if (i > 120) throw new Error('game never became ready (is `npm run dev` running?)'); await sleep(500) }
await js(HELPERS)
// Start the race, but hold the lights until the clock is ours.
await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'RACE!').click(); window.__mainland.game.current.race.go = Infinity`)
await sleep(2500)

try {
  if (mode === 'og') {
    await js(`(() => { document.querySelector('.hud').style.display = 'none'; const t = document.querySelector('.touch'); if (t) t.style.display = 'none'; document.querySelector('#promo').innerHTML = '' })()`)
    await js(`(() => { const css = document.createElement('style'); css.textContent = \`
      #og { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: 'Lilita One', sans-serif; color: #fffdf5;
        background: linear-gradient(90deg, rgba(8,5,16,.9) 0%, rgba(8,5,16,.72) 36%, rgba(8,5,16,.1) 62%, transparent 75%), linear-gradient(0deg, rgba(8,5,16,.55), transparent 35%); }
      #og .copy { position: absolute; left: 56px; top: 50px; width: 640px }
      #og .kick { display: flex; align-items: center; gap: 12px; font: 700 22px 'Barlow Condensed', sans-serif; letter-spacing: 4px }
      #og .flag { display: flex; width: 40px; height: 26px; border-radius: 4px; overflow: hidden; box-shadow: 0 0 0 2px rgba(255,255,255,.3) } #og .flag i { flex: 1; background: #1fa34a } #og .flag i:nth-child(2) { background: #fff }
      #og h1 { margin: 12px 0 0 -4px; font-size: 128px; line-height: .88; color: #ffc61a; transform: skewX(-9deg); transform-origin: left bottom; -webkit-text-stroke: 5px #10161a; paint-order: stroke fill; text-shadow: 0 5px 0 #c98a00, 0 10px 0 #10161a, 0 24px 40px rgba(0,0,0,.6) }
      #og .band { display: inline-block; margin-top: 22px; padding: 6px 24px 8px 20px; background: linear-gradient(180deg, #ff4a38, #ee3b2b); transform: skewX(-14deg); box-shadow: 0 6px 0 #a3190e; font: 800 36px 'Barlow Condensed', sans-serif; letter-spacing: 5px }
      #og .facts { display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap }
      #og .facts span { font: 700 21px 'Barlow Condensed', sans-serif; letter-spacing: 2px; padding: 7px 13px; border-radius: 10px; background: rgba(255,253,245,.12); border: 2px solid rgba(255,253,245,.3) }
      #og .facts b { color: #ffc61a; font-weight: 800 }
      #og .cta { position: absolute; left: 56px; bottom: 44px; display: flex; gap: 16px; align-items: center }
      #og .play { font-size: 38px; padding: 12px 30px 15px; border-radius: 16px; background: linear-gradient(180deg, #34c862, #1fa34a); box-shadow: 0 6px 0 #0f6b2e; border: 3px solid rgba(255,255,255,.65); text-shadow: 0 3px 0 #0f6b2e }
      #og .web { font: 700 22px 'Barlow Condensed', sans-serif; letter-spacing: 3px; opacity: .9 }
    \`; document.head.appendChild(css)
      document.body.insertAdjacentHTML('beforeend', '<div id="og"><div class="copy"><div class="kick"><span class="flag"><i></i><i></i><i></i></span>3D STREET RACING · LAGOS &amp; ABUJA</div><h1>NAIJA<br>RUSH</h1><div class="band">RACE THE ROAD. OUTRUN OLOKPA.</div><div class="facts"><span><b>4</b> RIVALS</span><span><b>3</b> LAPS</span><span>POLICE CHECKPOINTS</span><span>NITRO</span></div></div><div class="cta"><div class="play">PLAY FREE ▸</div><div class="web">IN YOUR BROWSER</div></div></div>') })()`)
    await sleep(1500)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(shot.result.data, 'base64')); console.log(`Wrote ${out}`)
  } else {
    const ffmpeg = process.env.FFMPEG || 'ffmpeg', audio = join(here, 'gameplay-audio.wav')
    const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...(existsSync(audio) ? ['-i', audio, '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(SECONDS), out], { stdio: ['pipe', 'inherit', 'inherit'] })
    const done = new Promise((ok, fail) => enc.on('close', code => code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))))
    await js(`window.__virtual.start(); (() => { const g = window.__mainland.game.current; g.race.go = g.time + 3.02; for (const v of g.traffic) if (v.rival !== undefined) { v.laneTimer = g.time + 6.5; v.attackAt = g.time + 99 } })()`)
    // Scene script, by video time in seconds.
    const cues = [
      [0.25, `__cap('4 RIVALS · 9 KM<small>NO RULES</small>', 'white', 2500)`],
      [3.7, `__cap('DODGE THE DANFOS', '', 2100)`],
      [6.0, `__flash(); const g = window.__mainland.game.current; __cut(g.race.start + 640, { speed: 150, x: 0, rivals: [[14, .55, 150], [-30, -.55], [-10, -.55, 152], [-60, .55]] }); setTimeout(() => __chaos(), 300)`],
      [6.2, `__cap('CHAOS ON EVERY LANE', 'red', 2200)`],
      [8.5, `__flash(); const g = window.__mainland.game.current, cp = g.race.checkpoints[0]; cp.warned = true; __cut(cp.z - 48, { speed: 135, x: 0, rivals: [[-25, .55, 140], [-40, -.55], [-60, 0], [-90, .55]] })`],
      [8.7, `__cap('BLAST THE CHECKPOINT?', 'white', 1500)`],
      [10.0, `__cap('OUTRUN OLOKPA', 'red', 1050)`],
      [11.0, `__flash(); const g = window.__mainland.game.current; __cut(g.race.start + 3000 * 1 + 2300, { speed: 140, x: 0, rivals: [[-30, .55], [-45, -.55], [-70, 0], [-95, .55]] }); setTimeout(() => __nitro(), 250)`],
      [11.2, `__cap('NITRO!!', 'blue', 1300)`],
      [12.5, `__flash(); const g = window.__mainland.game.current; __cut(g.race.finish - 52, { speed: 175, x: 0, rivals: [[-2, .55, 168], [-14, -.55, 170], [-30, 0], [-55, .55]] })`],
      [12.6, `__cap('FIRST TO THE FLAG', '', 1000)`],
      [13.55, `__end()`],
    ]
    let cue = 0
    for (let f = 0; f < FPS * SECONDS; f++) {
      const t = f / FPS
      while (cue < cues.length && cues[cue][0] <= t + 1e-6) { await js(`(() => { ${cues[cue][1]} })()`); cue++ }
      await js(`window.__drive(); window.__virtual.step(${1000 / FPS})`)
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 93 })
      if (!enc.stdin.write(Buffer.from(shot.result.data, 'base64'))) await new Promise(r => enc.stdin.once('drain', r))
      if (f % 60 === 0) console.log(`frame ${f}/${FPS * SECONDS}`, JSON.stringify(await js(`(() => { const g = window.__mainland.game.current; return { z: Math.round(g.z), speed: Math.round(g.speed), wanted: g.wanted, place: g.race?.done?.place } })()`)))
    }
    enc.stdin.end(); await done; console.log(`Wrote ${out}`)
  }
} finally {
  if (errors.length) console.log('page errors:', errors.slice(0, 5))
  ws.close(); browser.kill(); setTimeout(() => process.exit(0), 300)
}
