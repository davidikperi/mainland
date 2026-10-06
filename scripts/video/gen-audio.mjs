// Soundtrack for the launch video: 15 s of 128 BPM Afro-electro with the engine, danfo horn, crashes,
// siren and nitro synced to the beats launch.html cuts on. Writes launch-audio.wav next to this file.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100, DUR = 15, N = SR * DUR
const BEAT = 60 / 128, b = n => n * BEAT
const T = { flash: b(4), horn: b(7), hit1: b(11), hit2: b(13), race: b(14), police: b(16), nitro: b(20), title: b(22), end: b(30) }
const fx = [new Float32Array(N), new Float32Array(N)], music = [new Float32Array(N), new Float32Array(N)]
let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
const TAU = Math.PI * 2, clamp = (v, a = 0, c = 1) => Math.max(a, Math.min(c, v)), lerp = (a, c, t) => a + (c - a) * t

// Mix a voice in: fn(timeSinceStart) returns a sample. Equal-power pan.
function add(bus, t0, dur, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(dur * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < n; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; const v = fn(i / SR); bus[0][j] += v * gl; bus[1][j] += v * gr }
}

// ---------- drums ----------
const kicks = []
function kick(t0, g = 1) { kicks.push(t0); let ph = 0; add(fx, t0, .5, t => { ph += TAU * (46 + 130 * Math.exp(-t * 32)) / SR; return Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t * 7) + (t < .004 ? noise() * .4 : 0) }, g) }
function hat(t0, g = .16, d = .035, pan = .2) { let lp = 0; add(fx, t0, d * 7, t => { const n = noise(); lp += .55 * (n - lp); return (n - lp) * Math.exp(-t / d) }, g, pan) }
function clap(t0, g = .42) { let lp = 0, lp2 = 0; add(fx, t0, .32, t => { const n = noise(); lp += .4 * (n - lp); lp2 += .04 * (lp - lp2); const env = t < .03 ? Math.exp(-(t % .01) / .003) : Math.exp(-(t - .03) * 16); return (lp - lp2) * env * 2.2 }, g, -.1) }
function snare(t0, g = .3) { let lp = 0; add(fx, t0, .2, t => { const n = noise(); lp += .5 * (n - lp); return (lp * .8 + Math.sin(TAU * 190 * t) * .5) * Math.exp(-t * 22) }, g) }
// Talking drum: a pitched membrane that bends up then down.
function talk(t0, f0, f1, g = .5, pan = -.35) { let ph = 0; add(fx, t0, .35, t => { const f = t < .05 ? lerp(f0, f1, t / .05) : f1 * (1 - .25 * clamp((t - .05) / .25)); ph += TAU * f / SR; return Math.sin(ph) * Math.exp(-t * 9) * (1 + .3 * Math.sin(ph * 2)) }, g, pan) }
function crashCym(t0, g = .35, d = 1.6) { let lp = 0; add(fx, t0, d * 2.2, t => { const n = noise(); lp += .7 * (n - lp); return (n - lp * .6) * Math.exp(-t / d * 2.2) }, g) }
function boom(t0, g = .9) { let ph = 0; add(fx, t0, 1.8, t => { ph += TAU * (38 + 50 * Math.exp(-t * 6)) / SR; return Math.sin(ph) * Math.exp(-t * 1.8) }, g) }

// ---------- synths (music bus, sidechained to the kick) ----------
const saw = ph => 2 * (ph % 1) - 1
function bass(t0, dur, f, g = .32) { let ph1 = 0, ph2 = 0, lp = 0; add(music, t0, dur, t => { ph1 += f / SR; ph2 += f * 1.006 / SR; lp += .07 * ((saw(ph1) + saw(ph2)) * .5 - lp); return Math.tanh(lp * 2.2) * Math.min(1, t * 300) * Math.min(1, (dur - t) * 80) }, g) }
function stab(t0, freqs, g = .1, d = .16, pan = 0) {
  const ph = freqs.flatMap(f => [-.012, 0, .012].map(dt => ({ f: f * (1 + dt), p: (noise() + 1) / 2 }))); let lp = 0
  add(music, t0, d * 5, t => { let s = 0; for (const o of ph) { o.p += o.f / SR; s += saw(o.p) } lp += lerp(.5, .08, clamp(t / d)) * (s / ph.length - lp); return lp * Math.exp(-t / d) * 2.4 }, g, pan)
}
function pad(t0, dur, freqs, g = .06) { const ph = freqs.map(f => ({ f, p: 0 })); add(music, t0, dur, t => { let s = 0; for (const o of ph) { o.p += o.f / SR; s += Math.sin(TAU * o.p) + .3 * Math.sin(TAU * o.p * 2) } return s * Math.min(1, t / .6) * Math.min(1, (dur - t) / .5) }, g) }

// ---------- sound effects ----------
// Engine pitch follows the video's speedometer (same curve as launch.html).
function speed(t) {
  if (t < T.flash) return 0
  if (t < b(10)) return lerp(92, 118, clamp((t - T.flash) / b(6)))
  if (t < T.nitro) { let s = lerp(118, 136, clamp((t - b(10)) / b(10))); for (const h of [T.hit1, T.hit2]) if (t > h) s -= 16 * Math.exp(-(t - h) * 3); return s }
  if (t < T.title) return lerp(136, 187, 1 - Math.pow(1 - clamp((t - T.nitro) / .5), 3))
  return lerp(187, 120, 1 - Math.pow(1 - clamp((t - T.title) / 1.2), 3))
}
function engine() {
  let ph = 0, lp = 0
  const rpmIntro = t => t < .35 ? 30 : t < .7 ? 30 + 70 * Math.sin((t - .35) / .35 * Math.PI) : t < 1.0 ? 32 : 32 + 120 * Math.pow(clamp((t - 1.0) / .85), 1.6)
  add(fx, 0, T.title + 1.2, t => {
    const f = t < T.flash ? rpmIntro(t) : 34 + speed(t) * .42 * (1 + .15 * Math.sin(t * 2.1)), cut = t > T.flash - .02 && t < T.flash + .06 ? .2 : 1
    ph += f / SR; const raw = saw(ph) * .6 + Math.sign(Math.sin(TAU * ph * .5)) * .4
    lp += (.04 + f / 4000) * (raw - lp)
    const level = t < T.flash ? .9 : lerp(.45, .2, clamp((t - T.flash) / 1)) * (t > T.title ? Math.max(0, 1 - (t - T.title) / 1.2) : 1)
    return Math.tanh(lp * 3) * level * cut * (t < .05 ? t / .05 : 1)
  }, .55, 0)
}
function horn(t0, dur, g = .28) { let lp = 0; add(fx, t0, dur, t => { const s = Math.sign(Math.sin(TAU * 415 * t)) + Math.sign(Math.sin(TAU * 523 * t)); lp += .18 * (s - lp); return lp * .5 * Math.min(1, t * 120) * Math.min(1, (dur - t) * 60) }, g, .25) }
function impact(t0, g = .8) {
  let ph = 0, lp = 0
  add(fx, t0, 1.2, t => {
    ph += TAU * (60 + 40 * Math.exp(-t * 20)) / SR; const n = noise(); lp += .25 * (n - lp)
    const metal = [431, 1093, 1717, 2633, 3301].reduce((s, f, i) => s + Math.sin(TAU * f * t + i) * Math.exp(-t * (5 + i * 2)), 0) * .18
    return Math.sin(ph) * Math.exp(-t * 7) + lp * 1.6 * Math.exp(-t * 12) + metal + n * .5 * Math.exp(-t * 40)
  }, g)
}
function siren(t0, dur, g = .13) { let ph = 0; add(fx, t0, dur, t => { const f = 950 + 330 * Math.sin(TAU * t / (BEAT * 2) - Math.PI / 2); ph += f / SR; const tri = 2 * Math.abs(2 * (ph % 1) - 1) - 1; return tri * Math.min(1, t * 4) * Math.min(1, (dur - t) * 3) }, g, .45) }
function riser(t0, dur, g = .3) { let lp = 0; add(fx, t0, dur, t => { const p = t / dur, n = noise(); lp += (.01 + .5 * p * p) * (n - lp); return lp * p * p }, g) }
function whoosh(t0, dur, g = .45) { let lp = 0, lp2 = 0; add(fx, t0, dur, t => { const p = t / dur, n = noise(); lp += lerp(.6, .05, p) * (n - lp); lp2 += .3 * (lp - lp2); return (lp - lp2 * .5) * Math.sin(Math.PI * p) * 1.6 }, g) }

// ---------- arrangement ----------
const CHORDS = [[55, [220, 261.6, 329.6]], [43.65, [174.6, 220, 261.6]], [65.41, [261.6, 329.6, 392]], [49, [196, 246.9, 293.7]]]   // Am F C G
const chordAt = beat => CHORDS[Math.floor(Math.max(0, beat - 4) / 4) % 4]
engine()
riser(.5, T.flash - .5, .35); pad(0, T.flash + .4, [110, 164.8], .05)
kick(T.flash, 1.1); boom(T.flash, .7); crashCym(T.flash, .32)
for (let beat = 4; beat < 31; beat++) {
  const t = b(beat), [root, chord] = chordAt(beat)
  const build = beat >= 21 && beat < 22
  if (!build && beat !== 4 && beat < 30) kick(t)
  if (beat < 30) {
    hat(t + b(.5), .2); hat(t + b(.25), .07, .02, -.3); hat(t + b(.75), .07, .02, .35)
    if (beat >= 8 && beat % 2 === 1 && !build) clap(t)
    if (!build) { bass(t + b(.5), b(.42), root); if (beat % 4 === 0) bass(t, b(.3), root * 2, .18) }
    for (const off of [.75, 2.5].filter(o => (beat % 4) === Math.floor(o))) stab(t + b(off % 1), chord, beat >= 22 ? .13 : .09)
    if (beat >= 22 && beat % 2 === 0) stab(t + b(.5), chord.map(f => f * 2), .05, .1, .3)
  }
}
// Talking-drum fills to close phrases.
for (const start of [15, 19, 29]) [[0, 180, 260], [.5, 160, 230], [.75, 200, 300]].forEach(([o, f0, f1]) => talk(b(start + o), f0, f1))
horn(T.horn, .2); horn(T.horn + .27, .38)
impact(T.hit1, .85); impact(T.hit2, 1); crashCym(T.hit2, .2, .8)
kick(T.race, .6)
siren(T.police - .1, T.title - T.police + .5)
whoosh(T.nitro - .1, 1.1, .55); boom(T.nitro, .45); riser(T.nitro + b(.5), b(1.5), .3)
for (let i = 0, t = b(21); t < T.title - .01; i++) { snare(t, .18 + .02 * i); t += i < 2 ? b(.25) : b(.125) }
kick(T.title, 1.2); boom(T.title, 1); crashCym(T.title, .45, 2.2); stab(T.title, [220, 261.6, 329.6, 440], .2, .9); pad(T.title, b(8), [110, 164.8, 220], .05)
kick(T.end, 1.1); boom(T.end, .8); crashCym(T.end, .4, 2); stab(T.end, [220, 261.6, 329.6, 440], .2, 1.1); talk(T.end + b(.5), 170, 250, .4)

// ---------- mix ----------
const duck = new Float32Array(N).fill(1)
for (const k of kicks) for (let i = 0, s0 = Math.round(k * SR); i < SR * .35 && s0 + i < N; i++) duck[s0 + i] = Math.min(duck[s0 + i], 1 - .75 * Math.exp(-i / SR / .07))
const outL = new Float32Array(N), outR = new Float32Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (SR * .4))
  outL[i] = Math.tanh((fx[0][i] + music[0][i] * duck[i]) * 1.1) * fade; outR[i] = Math.tanh((fx[1][i] + music[1][i] * duck[i]) * 1.1) * fade
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]))
}
const norm = .89 / peak, wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) { wav.writeInt16LE(Math.round(outL[i] * norm * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(outR[i] * norm * 32767), 46 + i * 4) }
const out = join(dirname(fileURLToPath(import.meta.url)), 'launch-audio.wav')
writeFileSync(out, wav); console.log(`Wrote ${out}`)
