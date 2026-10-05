// "EKO FM" race mix: original high-energy Afro-electro, drum & bass and electro-house tracks in the
// spirit of arcade racing soundtracks, synthesised live (no recordings, no licensing). Songs are
// arranged in 8-bar sections (build -> drop -> break -> build -> drop) and react to the action:
// intensity 0 is a filtered menu groove, 1 is the full drop for races and police chases.
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const hz = m => 440 * 2 ** ((m - 69) / 12)
const S = a => new Set(a)

const TRACKS = [
  { name: 'Third Mainland Rush', artist: 'Mainland Sound System', bpm: 128, root: 45, chords: [0, 5, 2, 6], style: 'house',
    kick: S([0, 4, 8, 12]), clap: S([4, 12]), bass: 'offbeat', arp: [0, 7, 12, 7, 3, 7, 12, 15] },
  { name: 'Olokpa Chase', artist: 'Danfo Deluxe', bpm: 140, root: 50, chords: [0, 0, 5, 6], style: 'electro',
    kick: S([0, 4, 8, 12]), clap: S([4, 12]), bass: 'rolling', arp: [0, 3, 7, 10, 12, 10, 7, 3] },
  { name: 'Lekki Nitro', artist: 'DJ Okada', bpm: 174, root: 47, chords: [0, 5, 3, 4], style: 'dnb',
    kick: S([0, 10]), clap: S([4, 12]), bass: 'reese', arp: [0, 12, 7, 12, 3, 12, 7, 15] },
  { name: 'Eko Overdrive', artist: 'Ojuelegba Electric', bpm: 132, root: 42, chords: [0, 6, 5, 4], style: 'house',
    kick: S([0, 4, 8, 12]), clap: S([4, 12]), bass: 'offbeat', arp: [0, 7, 3, 7, 10, 7, 3, 7] },
]

export function createMusic(ctx, out, noise) {
  const bus = ctx.createGain(); bus.gain.value = 0
  const master = ctx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.attack.value = .005; master.release.value = .15
  master.connect(bus); bus.connect(out)
  // Sidechain "pump": synths duck on every kick, the signature drive of dance music.
  const pumped = ctx.createGain(); pumped.connect(master)
  // Global filter on the synths: closed at low intensity, wide open in a chase.
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1200; tone.Q.value = .7; tone.connect(pumped)
  const delay = ctx.createDelay(1); const fb = ctx.createGain(); fb.gain.value = .3; const wet = ctx.createGain(); wet.gain.value = .22
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(tone)
  let track = Math.floor(Math.random() * TRACKS.length), on = false, timer = null, step = 0, bar = 0, next = 0, level = .3, intensity = .5
  const listeners = new Set()
  const tr = () => TRACKS[track], dur = () => 60 / tr().bpm / 4

  function env(t, dest, peak, attack, decay) { const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0008, t + attack + decay); g.connect(dest); return g }
  function osc(t, type, f, dest, peak, attack, decay, { to, detune = 0, lp } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(decay, .25))
    const g = env(t, dest, peak, attack, decay)
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = lp.q || 1; fl.frequency.setValueAtTime(lp.from, t); fl.frequency.exponentialRampToValueAtTime(lp.to, t + decay); o.connect(fl); fl.connect(g) } else o.connect(g)
    o.start(t); o.stop(t + attack + decay + .05)
  }
  function hiss(t, type, f, dest, peak, decay, q = 1, sweepTo) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(); s.buffer = noise; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t)
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + decay)
    s.connect(fl); fl.connect(env(t, dest, peak, .002, decay)); s.start(t, Math.random() * 1.5); s.stop(t + decay + .05)
  }
  const deg = (d, oct = 0) => { const n = MINOR.length, o = Math.floor(d / n); return tr().root + MINOR[((d % n) + n) % n] + 12 * (o + oct) }

  // Drums
  const kick = t => { osc(t, 'sine', 170, master, 1, .001, .3, { to: 44 }); hiss(t, 'highpass', 2500, master, .12, .015); pumped.gain.cancelScheduledValues(t); pumped.gain.setValueAtTime(.25, t); pumped.gain.linearRampToValueAtTime(1, t + dur() * 2.6) }
  const clap = t => { for (const d of [0, .01, .022]) hiss(t + d, 'bandpass', 1600, master, .45, .14, .9); osc(t, 'triangle', 190, master, .2, .001, .08) }
  const hat = (t, open) => hiss(t, 'highpass', 8500, master, open ? .14 : .07, open ? .2 : .035)
  const snare = (t, v = .3) => { hiss(t, 'bandpass', 2200, master, v, .1, .7); osc(t, 'triangle', 210, master, v * .6, .001, .06) }
  const talking = t => osc(t, 'sine', 260, master, .3, .008, .26, { to: 140 })
  const crash = t => { hiss(t, 'highpass', 5000, master, .3, 1.6); osc(t, 'sine', 70, master, .7, .001, 1.1, { to: 30 }) }
  // Synths
  const bass = (t, m, d, kind) => {
    if (kind === 'reese') { for (const det of [-14, 14]) osc(t, 'sawtooth', hz(m), tone, .16, .005, d, { detune: det, lp: { from: 700, to: 260, q: 2 } }); osc(t, 'sine', hz(m), master, .4, .005, d) }
    else { osc(t, 'sawtooth', hz(m), tone, .22, .004, d, { lp: { from: 1500 + intensity * 1800, to: 180, q: 6 } }); osc(t, 'sine', hz(m), pumped, .32, .004, d) }
  }
  const stab = (t, notes, d) => { for (const m of notes) for (const det of [-18, -7, 0, 7, 18]) osc(t, 'sawtooth', hz(m), tone, .024, .004, d, { detune: det, lp: { from: 4200, to: 900 } }) }
  const pad = (t, notes, d) => { for (const m of notes) for (const det of [-10, 10]) osc(t, 'sawtooth', hz(m), tone, .018, d * .3, d * .8, { detune: det }) }
  const lead = (t, m, d) => { const g = ctx.createGain(); g.gain.value = 1; g.connect(tone); g.connect(delay); osc(t, 'square', hz(m), g, .05, .003, d, { lp: { from: 5000, to: 1200 } }); osc(t, 'sawtooth', hz(m + 12), g, .025, .003, d * .7) }
  const riser = (t, len) => { hiss(t, 'bandpass', 300, master, .16, len, 2, 9000); osc(t, 'sawtooth', hz(tr().root + 12), tone, .03, len * .9, len * .1, { to: hz(tr().root + 36) }) }

  function playStep(t) {
    const T = tr(), s = step, chordDeg = T.chords[Math.floor(bar / 2) % T.chords.length]
    const sec = Math.floor(bar / 8) % 6, inBar = bar % 8   // 0 intro, 1 build, 2 drop, 3 break, 4 build, 5 drop
    const drop = sec === 2 || sec === 5, build = sec === 1 || sec === 4, brk = sec === 3, hot = intensity > .7
    const chord = [deg(chordDeg, 1), deg(chordDeg + 2, 1), deg(chordDeg + 4, 1)]
    // Drums: a full beat in drops, building, the break strips down.
    if (!brk && T.kick.has(s) && !(build && inBar === 7 && s > 8)) kick(t)
    if (drop || (build && intensity > .4)) { if (T.clap.has(s)) clap(t) }
    if (T.style === 'dnb' && (drop || build) && (s === 7 || s === 15) && Math.random() < .5) snare(t, .18)
    if (!brk) hat(t, s % 4 === 2 && (drop || hot))
    else if (s % 2 === 0) hat(t, false)
    if ((drop || brk) && bar % 4 === 3 && (s === 12 || s === 14 || s === 15)) talking(t)
    // Snare roll accelerating into the drop, with a riser.
    if (build && inBar >= 6) { const every = inBar === 7 ? (s >= 8 ? 1 : 2) : 4; if (s % every === 0) snare(t, .12 + (inBar - 6) * .1 + s / 80) }
    if (build && inBar === 6 && s === 0) riser(t, dur() * 32)
    if (drop && inBar === 0 && s === 0) crash(t)
    // Bass
    if (!brk && sec !== 0) {
      const root = deg(chordDeg, -1)
      if (T.bass === 'offbeat' && s % 4 === 2) bass(t, root, dur() * 1.8, 'saw')
      else if (T.bass === 'rolling' && s % 2 === 1) bass(t, root + (s % 8 === 7 ? 12 : 0), dur() * .9, 'saw')
      else if (T.bass === 'reese' && (s === 0 || s === 6 || s === 10)) bass(t, root, dur() * (s === 0 ? 5 : 3.5), 'reese')
    }
    // Chords: stabs in the drop, pads in the break and builds.
    if (drop && (s === 0 || s === 3 || s === 6 || s === 10 || s === 14) && intensity > .25) stab(t, chord, dur() * 1.6)
    if ((brk || build || sec === 0) && s === 0 && bar % 2 === 0) pad(t, chord, dur() * 32)
    // Arpeggio lead: the hook, saved for drops (and builds when the heat is on).
    if ((drop && intensity > .45) || (build && hot)) lead(t, deg(chordDeg, 2) + T.arp[s % 8] - 12, dur() * .9)
  }
  function schedule() {
    while (next < ctx.currentTime + .15) {
      playStep(next)
      next += dur(); step = (step + 1) % 16
      if (step === 0) { bar++; if (bar >= 48) nextTrack() }   // six 8-bar sections per song
    }
  }
  const nowPlaying = () => ({ station: 'EKO FM 97.3 · RACE MIX', name: tr().name, artist: tr().artist })
  function notify() { for (const l of listeners) l(nowPlaying()) }
  function nextTrack() { track = (track + 1) % TRACKS.length; bar = 0; step = 0; notify() }
  return {
    start() { if (on) return; on = true; next = ctx.currentTime + .05; step = 0; bus.gain.setTargetAtTime(level, ctx.currentTime, .4); timer = setInterval(schedule, 25); notify() },
    stop() { on = false; clearInterval(timer); bus.gain.setTargetAtTime(0, ctx.currentTime, .2) },
    next() { nextTrack(); if (on) next = ctx.currentTime + .05 },
    duck() { if (!on) return; const t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(level * .4, t, .03); bus.gain.setTargetAtTime(level, t + .6, .5) },
    setLevel(v) { level = v; if (on) bus.gain.setTargetAtTime(v, ctx.currentTime, .2) },
    // 0 = menu, ~.5 = cruising, 1 = race or police chase: opens the filter and brings in the full drop.
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); tone.frequency.setTargetAtTime(500 + intensity * 7500, ctx.currentTime, .8) },
    nowPlaying, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    get playing() { return on },
  }
}
