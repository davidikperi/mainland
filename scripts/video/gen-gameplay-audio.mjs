// Soundtrack for the Naija Rush gameplay promo (gameplay.mjs): 15 s at 120 BPM, synced to its cuts. Countdown beeps
// and a revving engine on the grid, a hard drop at GO into an amapiano-style groove (log-drum bass, shakers, talking
// drum), whooshes on every cut, a crash at the blowout, the siren after the checkpoint, a nitro blast and a final hit.
// Writes gameplay-audio.wav next to this file.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100, DUR = 15, N = SR * DUR, BEAT = .5, b = n => n * BEAT
// Cuts in gameplay.mjs: GO at 3.0, chaos 6.0, checkpoint 8.5 (siren from ~9.7), nitro 11.0, finish 12.5, end card 13.55.
const T = { go: 3, chaos: 6, blowout: 6.6, checkpoint: 8.5, siren: 9.7, nitro: 11.25, finish: 12.5, end: 13.5 }
const fx = [new Float32Array(N), new Float32Array(N)], music = [new Float32Array(N), new Float32Array(N)]
let seed = 7; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
const TAU = Math.PI * 2, clamp = (v, a = 0, c = 1) => Math.max(a, Math.min(c, v)), lerp = (a, c, t) => a + (c - a) * t
function add(bus, t0, dur, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(dur * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < n; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; const v = fn(i / SR); bus[0][j] += v * gl; bus[1][j] += v * gr }
}
const saw = ph => 2 * (ph % 1) - 1

// Drums and percussion
const kicks = []
function kick(t0, g = 1) { kicks.push(t0); let ph = 0; add(fx, t0, .5, t => { ph += TAU * (45 + 135 * Math.exp(-t * 30)) / SR; return Math.tanh(Math.sin(ph) * 1.7) * Math.exp(-t * 6.5) + (t < .004 ? noise() * .4 : 0) }, g) }
function clap(t0, g = .42) { let lp = 0, lp2 = 0; add(fx, t0, .3, t => { const n = noise(); lp += .4 * (n - lp); lp2 += .04 * (lp - lp2); const env = t < .03 ? Math.exp(-(t % .01) / .003) : Math.exp(-(t - .03) * 16); return (lp - lp2) * env * 2.2 }, g, -.1) }
function shaker(t0, g = .1, pan = .3) { let lp = 0; add(fx, t0, .08, t => { const n = noise(); lp += .7 * (n - lp); return (n - lp) * Math.exp(-t * 60) }, g, pan) }
function rim(t0, g = .22) { add(fx, t0, .06, t => (Math.sin(TAU * 820 * t) * .6 + noise() * .3) * Math.exp(-t * 70), g, -.25) }
function talk(t0, f0, f1, g = .5, pan = -.3) { let ph = 0; add(fx, t0, .35, t => { const f = t < .05 ? lerp(f0, f1, t / .05) : f1 * (1 - .25 * clamp((t - .05) / .25)); ph += TAU * f / SR; return Math.sin(ph) * Math.exp(-t * 9) * (1 + .3 * Math.sin(ph * 2)) }, g, pan) }
function snare(t0, g = .3) { let lp = 0; add(fx, t0, .2, t => { const n = noise(); lp += .5 * (n - lp); return (lp * .8 + Math.sin(TAU * 190 * t) * .5) * Math.exp(-t * 22) }, g) }
function crashCym(t0, g = .35, d = 1.6) { let lp = 0; add(fx, t0, d * 2.2, t => { const n = noise(); lp += .7 * (n - lp); return (n - lp * .6) * Math.exp(-t / d * 2.2) }, g) }
function boom(t0, g = .9) { let ph = 0; add(fx, t0, 1.8, t => { ph += TAU * (36 + 54 * Math.exp(-t * 6)) / SR; return Math.sin(ph) * Math.exp(-t * 1.8) }, g) }
// Music bus (ducked by the kick)
function logDrum(t0, f, dur, g = .5) { let ph = 0; add(music, t0, dur, t => { ph += TAU * f * (1 - .2 * clamp(t / .12)) / SR; return Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t * 3.2) * Math.min(1, t * 400) }, g) }
function stab(t0, freqs, g = .1, d = .16, pan = 0) {
  const ph = freqs.flatMap(f => [-.012, 0, .012].map(dt => ({ f: f * (1 + dt), p: (noise() + 1) / 2 }))); let lp = 0
  add(music, t0, d * 5, t => { let s = 0; for (const o of ph) { o.p += o.f / SR; s += saw(o.p) } lp += lerp(.5, .08, clamp(t / d)) * (s / ph.length - lp); return lp * Math.exp(-t / d) * 2.4 }, g, pan)
}
function pad(t0, dur, freqs, g = .05) { const ph = freqs.map(f => ({ f, p: 0 })); add(music, t0, dur, t => { let s = 0; for (const o of ph) { o.p += o.f / SR; s += Math.sin(TAU * o.p) + .3 * Math.sin(TAU * o.p * 2) } return s * Math.min(1, t / .6) * Math.min(1, (dur - t) / .5) }, g) }
// Sound effects
function engine() {
  // Revs on the grid (blips, then held near 4,000), then a deep climb through the gears that the cuts keep high.
  const rpm = t => t < T.go ? (t < .6 ? 900 : t < 1.1 ? 900 + 2600 * Math.sin((t - .6) / .5 * Math.PI) : 3600 + 500 * Math.sin(t * 9)) :
    (() => { const s = t - T.go, gear = Math.min(5, Math.floor(s / .7)), inGear = (s % .7) / .7; return t > T.chaos ? 4300 + 900 * Math.sin(t * 1.3) : 2600 + gear * 250 + inGear * 2600 })()
  let ph = 0, lp = 0, sub = 0
  add(fx, 0, T.end + .4, t => {
    const f = rpm(t) / 60 * 4, cut = (t > T.go - .02 && t < T.go + .05) ? .3 : 1
    ph += f / SR; sub += f / 2 / SR
    const raw = saw(ph) * .55 + Math.sign(Math.sin(TAU * ph * .5)) * .35 + Math.sin(TAU * sub) * .6
    lp += (.03 + f / 5000) * (raw - lp)
    const level = (t < T.go ? .7 : .45) * (t > T.end ? Math.max(0, 1 - (t - T.end) / .4) : 1)
    return Math.tanh(lp * 3.2) * level * cut
  }, .55)
}
function beep(t0, f, dur, g = .25) { add(fx, t0, dur, t => (Math.sign(Math.sin(TAU * f * t)) * .4 + Math.sin(TAU * f * t) * .6) * Math.min(1, t * 400) * Math.min(1, (dur - t) * 60), g) }
function whoosh(t0, dur, g = .4) { let lp = 0, lp2 = 0; add(fx, t0, dur, t => { const p = t / dur, n = noise(); lp += lerp(.6, .05, p) * (n - lp); lp2 += .3 * (lp - lp2); return (lp - lp2 * .5) * Math.sin(Math.PI * p) * 1.6 }, g) }
function riser(t0, dur, g = .3) { let lp = 0; add(fx, t0, dur, t => { const p = t / dur, n = noise(); lp += (.01 + .5 * p * p) * (n - lp); return lp * p * p }, g) }
function impact(t0, g = .8) { let ph = 0, lp = 0; add(fx, t0, 1.2, t => { ph += TAU * (60 + 40 * Math.exp(-t * 20)) / SR; const n = noise(); lp += .25 * (n - lp); const metal = [431, 1093, 1717, 2633].reduce((s, f, i) => s + Math.sin(TAU * f * t + i) * Math.exp(-t * (5 + i * 2)), 0) * .18; return Math.sin(ph) * Math.exp(-t * 7) + lp * 1.6 * Math.exp(-t * 12) + metal }, g) }
function siren(t0, dur, g = .12) { let ph = 0; add(fx, t0, dur, t => { const f = 950 + 330 * Math.sin(TAU * t / 1 - Math.PI / 2); ph += f / SR; return (2 * Math.abs(2 * (ph % 1) - 1) - 1) * Math.min(1, t * 4) * Math.min(1, (dur - t) * 3) }, g, .45) }

// ---------- arrangement ----------
const CHORDS = [[55, [220, 261.6, 329.6]], [43.65, [174.6, 220, 261.6]], [65.41, [261.6, 329.6, 392]], [49, [196, 246.9, 293.7]]]   // Am F C G
engine()
// Countdown: beeps on the game's 3, 2, 1 and GO.
for (const t of [0, 1, 2]) beep(t + .02, 660, .2)
beep(T.go, 1320, .6, .3)
riser(.4, T.go - .4, .3); pad(0, T.go + .3, [110, 164.8], .05)
for (let i = 0; i < 12; i++) shaker(i * BEAT / 2, .05)
// Drop at GO.
kick(T.go, 1.15); boom(T.go, .75); crashCym(T.go, .32)
for (let beat = 6; beat < 27; beat++) {
  const t = b(beat), bar = Math.floor((beat - 6) / 4), [root, chord] = CHORDS[bar % 4]
  if (beat !== 6) kick(t)
  for (let s = 0; s < 4; s++) shaker(t + s * BEAT / 4, s === 2 ? .12 : .06, s % 2 ? .35 : -.2)
  if (beat % 2 === 1) clap(t)
  if (beat % 4 === 1 || beat % 4 === 3) rim(t + BEAT * .75)
  // Log drum: the amapiano bass on syncopated sixteenths.
  for (const [o, mul] of [[0, 1], [.75, 1], [1.5, 1.5]].filter(([o]) => beat % 2 === 0 || o < .9)) logDrum(t + o * BEAT, root * mul, .4)
  if (beat % 4 === 2) stab(t + BEAT * .5, chord, .09)
}
// Talking-drum fills into each cut.
for (const at of [T.chaos, T.checkpoint, T.nitro - .25]) [[-.5, 180, 260], [-.25, 160, 230], [-.12, 200, 300]].forEach(([o, f0, f1]) => talk(at + o, f0, f1, .45))
// Cuts: a whoosh on each, plus what happens in the scene.
for (const t of [T.chaos, T.checkpoint, T.nitro - .25, T.finish]) whoosh(t - .15, .45, .45)
impact(T.blowout, .7); crashCym(T.blowout, .15, .6)
siren(T.siren, T.nitro - T.siren - .1)
whoosh(T.nitro, 1.2, .6); boom(T.nitro, .5)
for (let i = 0, t = T.finish; t < T.end - .02; i++) { snare(t, .16 + .03 * i); t += i < 2 ? BEAT / 2 : BEAT / 4 }
riser(T.finish, T.end - T.finish, .3)
// Final hit on the end card.
kick(T.end, 1.2); boom(T.end, 1); crashCym(T.end, .45, 2); stab(T.end, [220, 261.6, 329.6, 440], .2, 1.1); pad(T.end, DUR - T.end, [110, 164.8, 220], .05); talk(T.end + .5, 170, 250, .4)

// ---------- mix ----------
const duck = new Float32Array(N).fill(1)
for (const k of kicks) for (let i = 0, s0 = Math.round(k * SR); i < SR * .3 && s0 + i < N; i++) duck[s0 + i] = Math.min(duck[s0 + i], 1 - .7 * Math.exp(-i / SR / .07))
const L = new Float32Array(N), R = new Float32Array(N); let peak = 0
for (let i = 0; i < N; i++) { const fade = Math.min(1, (N - i) / (SR * .4)); L[i] = Math.tanh((fx[0][i] + music[0][i] * duck[i]) * 1.1) * fade; R[i] = Math.tanh((fx[1][i] + music[1][i] * duck[i]) * 1.1) * fade; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])) }
const norm = .89 / peak, wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) { wav.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4) }
const out = join(dirname(fileURLToPath(import.meta.url)), 'gameplay-audio.wav')
writeFileSync(out, wav); console.log(`Wrote ${out}`)
