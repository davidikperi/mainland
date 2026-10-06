// Renders launch.html to an MP4 with the soundtrack from gen-audio.mjs.
// Usage: FFMPEG=path/to/ffmpeg node scripts/video/render.mjs [out.mp4]
//        node scripts/video/render.mjs --stills 2.5,5.3,9.6   (PNG previews of single moments)
// Drives headless Edge/Chrome over the DevTools protocol: draw(t) for each frame, PNG out, piped into ffmpeg.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FPS = 30, SECONDS = 15, PORT = 9333
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
const browserPath = process.env.BROWSER || BROWSERS.find(existsSync)
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const args = process.argv.slice(2), stillsAt = args[0] === '--stills' ? args[1].split(',').map(Number) : null
const out = resolve(stillsAt ? (args[2] || '.') : (args[0] || 'mainland-launch.mp4'))

const profile = mkdtempSync(join(tmpdir(), 'mainland-video-'))
const browser = spawn(browserPath, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1920,1080', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

async function target() {
  for (let i = 0; i < 100; i++) {
    try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === 'page'); if (page) return page.webSocketDebuggerUrl } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('Browser did not start')
}
const ws = new WebSocket(await target())
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let nextId = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise(r => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value }

await send('Page.navigate', { url: pathToFileURL(join(here, 'launch.html')).href })
for (let i = 0; !(await evaluate('window.ready === true').catch(() => false)); i++) { if (i > 150) throw new Error('Page never became ready (fonts?)'); await new Promise(r => setTimeout(r, 200)) }
const frame = async t => Buffer.from(await evaluate(`draw(${t}); document.getElementById('c').toDataURL('image/png').slice(22)`), 'base64')

try {
  if (stillsAt) {
    for (const t of stillsAt) writeFileSync(join(out, `still-${t.toFixed(2)}.png`), await frame(t))
    console.log(`Wrote ${stillsAt.length} stills to ${out}`)
  } else {
    const audio = join(here, 'launch-audio.wav')
    const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...(existsSync(audio) ? ['-i', audio, '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(SECONDS), out], { stdio: ['pipe', 'ignore', 'inherit'] })
    const done = new Promise((ok, fail) => enc.on('close', code => code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))))
    for (let f = 0; f < FPS * SECONDS; f++) {
      if (!enc.stdin.write(await frame(f / FPS))) await new Promise(r => enc.stdin.once('drain', r))
      if (f % 60 === 0) process.stdout.write(`frame ${f}/${FPS * SECONDS}\n`)
    }
    enc.stdin.end(); await done
    console.log(`Wrote ${out}`)
  }
} finally {
  ws.close(); browser.kill()
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }) } catch { /* browser still closing */ } }, 1500)
}
