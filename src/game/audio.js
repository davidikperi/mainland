// Synthesised engine, siren, horn, tyre squeal and crash effects, so the game needs no audio files.
import { createMusic } from './music.js'
import { ENGINE_WORKLET } from './engineWorklet.js'
export function createAudio() {
  let music = null, musicOn = true, pendingListener = null, sfxLevel = .8, musicLevel = .7
  let engineNode = null, engineOut = null, engineKey = ''
  let ctx = null, n = null, muted = false, noise = null, voice = '', lastGear = 1, lastThrottle = 0
  // Soft-clip curve: more drive = raspier engine.
  const curve = drive => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive) } return c }
  function start() {
    if (ctx) { ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    ctx = new AC()
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    // Limiter on the final mix, so louder music on top of the engine and crashes never distorts.
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -3; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = .002; limiter.release.value = .12; limiter.connect(ctx.destination)
    const master = ctx.createGain(); master.gain.value = muted ? 0 : .5; master.connect(limiter)
    const sfx = ctx.createGain(); sfx.gain.value = sfxLevel; sfx.connect(master)
    const musicBus = ctx.createGain(); musicBus.gain.value = musicLevel; musicBus.connect(master)
    music = createMusic(ctx, musicBus, noise); if (pendingListener) music.onChange(pendingListener); if (musicOn) music.start()
    const osc = (type, freq, out) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(out); o.start(); return o }
    const gain = (v, out = sfx) => { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g }
    // The pulse-train engine runs as an AudioWorklet; the oscillator engine below is the fallback.
    engineOut = gain(0)
    // Deeper voice: lift the lows and the low-mids (the chest of the exhaust), soften the fizzy top.
    const deep = ctx.createBiquadFilter(); deep.type = 'lowshelf'; deep.frequency.value = 170; deep.gain.value = 9; deep.connect(engineOut)
    const chest = ctx.createBiquadFilter(); chest.type = 'peaking'; chest.frequency.value = 320; chest.Q.value = .8; chest.gain.value = 3; chest.connect(deep)
    const tame = ctx.createBiquadFilter(); tame.type = 'highshelf'; tame.frequency.value = 3000; tame.gain.value = -6; tame.connect(chest)
    if (ctx.audioWorklet) ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }))).then(() => {
      if (!ctx) return
      engineNode = new AudioWorkletNode(ctx, 'engine-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] })
      engineNode.connect(tame); engineKey = ''
    }).catch(() => { /* keep the oscillator engine */ })
    // Engine: firing-frequency harmonics + exhaust noise -> saturation -> load-dependent filter -> body EQ.
    const engineGain = gain(0), body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 110; body.gain.value = 7; body.Q.value = 1; body.connect(engineGain)
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 1.2; filter.connect(body)
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x'; shaper.connect(filter)
    const mix = ctx.createGain(); mix.gain.value = .5; mix.connect(shaper)
    const exhaustBand = ctx.createBiquadFilter(); exhaustBand.type = 'bandpass'; exhaustBand.Q.value = 1.4; const exhaustGain = gain(0, mix); exhaustBand.connect(exhaustGain)
    const exhaust = ctx.createBufferSource(); exhaust.buffer = noise; exhaust.loop = true; exhaust.connect(exhaustBand); exhaust.start()
    const fire = osc('sawtooth', 30, mix), sub = osc('triangle', 15, mix), harm2 = ctx.createGain(); harm2.gain.value = .25; harm2.connect(mix); const second = osc('square', 60, harm2)
    // Uneven firing / V8 lope: amplitude modulation of the engine output.
    const lopeGain = gain(0, engineGain.gain), lope = osc('sine', 8, lopeGain)
    const turboGain = gain(0), turbo = osc('sine', 3000, turboGain)
    // Intake / injection hiss
    const intakeGain = gain(0), intakeHp = ctx.createBiquadFilter(); intakeHp.type = 'highpass'; intakeHp.frequency.value = 2400; intakeHp.connect(intakeGain)
    const intake = ctx.createBufferSource(); intake.buffer = noise; intake.loop = true; intake.connect(intakeHp); intake.start()
    // Growl: a saturated tone an octave under the firing note (two octaves for the sub), low-passed, swelling with throttle.
    const growlGain = gain(0), growlLp = ctx.createBiquadFilter(); growlLp.type = 'lowpass'; growlLp.frequency.value = 220; growlLp.Q.value = 1.1; growlLp.connect(growlGain)
    const growlDrive = ctx.createWaveShaper(); growlDrive.curve = curve(2.5); growlDrive.connect(growlLp)
    const growl = osc('sawtooth', 25, growlDrive), growlSubGain = gain(.6, growlLp), growlSub = osc('sine', 12, growlSubGain)
    const sirenGain = gain(0), hornGain = gain(0)
    // Tyre squeal: band-passed noise plus a wavering tone.
    const skidGain = gain(0), skidBand = ctx.createBiquadFilter(); skidBand.type = 'bandpass'; skidBand.frequency.value = 1400; skidBand.Q.value = 5; skidBand.connect(skidGain)
    const skidNoise = ctx.createBufferSource(); skidNoise.buffer = noise; skidNoise.loop = true; skidNoise.connect(skidBand); skidNoise.start()
    const squeal = osc('sawtooth', 1150, skidBand)
    // Rain: a hiss of drops on the roof plus the low wash of tyres on a wet road.
    const rainGain = gain(0), rainHp = ctx.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 1500; const rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 9000; rainHp.connect(rainLp); rainLp.connect(rainGain)
    const rain = ctx.createBufferSource(); rain.buffer = noise; rain.loop = true; rain.connect(rainHp); rain.start()
    const washGain = gain(0), washLp = ctx.createBiquadFilter(); washLp.type = 'lowpass'; washLp.frequency.value = 500; washLp.connect(washGain)
    const wash = ctx.createBufferSource(); wash.buffer = noise; wash.loop = true; wash.connect(washLp); wash.start(0, .7)
    n = { growl, growlSub, growlLp, growlGain, master, sfx, musicBus, engineGain, filter, shaper, exhaustBand, exhaustGain, fire, sub, second, lope, lopeGain, intakeGain, turbo, turboGain, sirenGain, siren: osc('triangle', 700, sirenGain), hornGain, h1: osc('square', 392, hornGain), h2: osc('square', 494, hornGain), skidGain, squeal, rainGain, washGain }
  }
  // One-shot helpers
  function burst({ type = 'bandpass', freq = 800, q = 1, level = .5, decay = .4, delay = 0 }) {
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    src.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.001, t + decay)
    src.connect(f); f.connect(g); g.connect(n.sfx); src.start(t, Math.random()); src.stop(t + decay + .05)
  }
  function tone({ type = 'sine', freq = 80, to = freq, level = .5, decay = .3, delay = 0 }) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay)
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.001, t + decay)
    o.connect(g); g.connect(n.sfx); o.start(t); o.stop(t + decay + .05)
  }
  const ready = () => ctx && n && ctx.state === 'running'
  return {
    start,
    update({ rpm = 800, gear = 1, throttle = 0, engine = {}, turbo = 0, playing = false, siren = 0, horn = false, time = 0, skid = 0, rain = 0, speed = 0 }) {
      if (!ctx || !n) return
      const now = ctx.currentTime, cyl = engine.cyl || 4, redline = engine.redline || 6200, r = Math.min(1, rpm / redline)
      const key = `${cyl}:${engine.rasp}`
      if (key !== voice) { voice = key; n.shaper.curve = curve(1.5 + (engine.rasp || .3) * 6) }
      // Firing frequency: rpm/60 revolutions, cyl/2 power strokes per revolution.
      const f = rpm / 60 * cyl / 2, jitter = 1 + (Math.random() - .5) * .012
      n.fire.frequency.setTargetAtTime(f * jitter, now, .015); n.sub.frequency.setTargetAtTime(f / 2, now, .015); n.second.frequency.setTargetAtTime(f * 2, now, .015)
      // Above its 'wake' rpm the exhaust opens up: the HEMI past ~3,200, the V6 near the top.
      const w = engine.wake || 4000, bark = Math.min(1, Math.max(0, (rpm - w + 400) / 1200)) * throttle
      n.exhaustBand.frequency.setTargetAtTime(Math.min(5000, f * 3.5), now, .03); n.exhaustGain.gain.setTargetAtTime(.08 + throttle * .25 + bark * .3, now, .05)
      n.filter.frequency.setTargetAtTime(220 + r * 2000 * (.45 + throttle * .55) + throttle * 400 + bark * 1600, now, .05)
      n.intakeGain.gain.setTargetAtTime(playing ? (engine.intake || .2) * (.004 + throttle * r * .03) : 0, now, .06)
      // Growl follows the firing note an octave down; it opens up and gets louder on the throttle, more for V8s.
      n.growl.frequency.setTargetAtTime(f / 2, now, .02); n.growlSub.frequency.setTargetAtTime(f / 4, now, .02)
      n.growlLp.frequency.setTargetAtTime(150 + throttle * 220 + r * 180, now, .05)
      const growlLevel = playing ? (.05 + throttle * .13 + r * .06 + bark * .05) * (cyl === 8 ? 1.3 : cyl === 6 ? 1.1 : 1) : 0
      n.lope.frequency.setTargetAtTime(cyl === 8 ? f / 4 : f / 2, now, .03); n.lopeGain.gain.setTargetAtTime(playing ? (engine.lope || .05) * (.13 - r * .06) : 0, now, .05)
      const shift = gear !== lastGear; lastGear = gear
      const worklet = !!engineNode, oscLevel = worklet ? 0 : 1
      if (worklet) {
        const k = `${cyl}:${engine.flat}:${engine.header}:${engine.tail}`
        if (k !== engineKey) { engineKey = k; engineNode.port.postMessage(engine) }
        engineNode.parameters.get('rpm').setTargetAtTime(rpm, now, .015); engineNode.parameters.get('throttle').setTargetAtTime(throttle, now, .04)
      }
      // Torque cut on upshift: a quick dip, then the next gear pulls.
      // Louder with revs as well as throttle, so every climb through the gears (and a free rev on the grid) is heard rising.
      const level = playing ? .08 + throttle * .08 + r * .07 + bark * .05 : 0, wLevel = playing ? .3 + throttle * .26 + r * .24 + bark * .16 : 0
      if (shift && playing) {
        n.engineGain.gain.cancelScheduledValues(now); n.engineGain.gain.setTargetAtTime(.04 * oscLevel, now, .02)
        engineOut.gain.cancelScheduledValues(now); engineOut.gain.setTargetAtTime(wLevel * .3, now, .02)
        n.growlGain.gain.cancelScheduledValues(now); n.growlGain.gain.setTargetAtTime(growlLevel * .3, now, .02)
        if (turbo) burst({ type: 'highpass', freq: 3500, level: .12 * turbo / 5 + .04, decay: .35 })
      } else { n.engineGain.gain.setTargetAtTime(level * oscLevel, now, .06); engineOut.gain.setTargetAtTime(worklet ? wLevel : 0, now, .06); n.growlGain.gain.setTargetAtTime(growlLevel, now, .06) }
      n.turbo.frequency.setTargetAtTime(1800 + r * 6000, now, .1); n.turboGain.gain.setTargetAtTime(playing && turbo ? throttle * r * .006 * turbo : 0, now, .15)
      // Lift off at high revs: exhaust pops and crackle.
      // Every engine pops a little on the overrun; raspy ones crackle hard.
      if (playing && lastThrottle > .6 && throttle < .2 && rpm > 3600) { const k = .5 + (engine.rasp || .3); for (let i = 0; i < 3 + Math.floor(Math.random() * 3 * k); i++) burst({ type: 'bandpass', freq: 500 + Math.random() * 900, q: .8, level: (.1 + Math.random() * .12) * k, decay: .05, delay: .08 + i * (.06 + Math.random() * .1) }) }
      lastThrottle = throttle
      // Long rising-and-falling wail
      n.siren.frequency.setTargetAtTime(700 + (Math.sin(time * Math.PI / 1.6) * .5 + .5) * 650, now, .05)
      n.sirenGain.gain.setTargetAtTime(playing ? siren * .1 : 0, now, .1)
      n.hornGain.gain.setTargetAtTime(playing && horn ? .09 : 0, now, .02)
      n.squeal.frequency.setTargetAtTime(1050 + Math.sin(time * 37) * 90, now, .02)
      n.skidGain.gain.setTargetAtTime(playing ? skid * .16 : 0, now, .04)
      n.rainGain.gain.setTargetAtTime(rain * (playing ? .09 : .05), now, .5)
      n.washGain.gain.setTargetAtTime(playing ? rain * Math.min(1, speed / 120) * .25 : 0, now, .2)
    },
    // Metal crunch, low thump, ringing panels and, for big hits, breaking glass.
    crash(impact = 40, vol = 1) {
      if (!ready()) return
      if (impact > 50 && vol > .7) music?.duck()
      const k = Math.min(1, impact / 120)
      tone({ freq: 95, to: 38, level: (.55 + k * .4) * vol, decay: .35 })
      burst({ freq: 700, q: .6, level: (.45 + k * .5) * vol, decay: .25 + k * .35 })
      burst({ type: 'highpass', freq: 2500, level: .25 * k + .08, decay: .5 })
      for (const [f, d] of [[430, .5], [655, .6], [918, .45]]) tone({ type: 'triangle', freq: f, to: f * .97, level: .05 + k * .06, decay: d, delay: .01 })
      if (k > .45) for (let i = 0; i < 4; i++) burst({ type: 'highpass', freq: 5000 + i * 800, q: 2, level: .12, decay: .08, delay: .05 + i * .06 + Math.random() * .04 })
    },
    // Driving through a flooded pothole: a thump, then a wash of water over the car.
    splash(speed = 60) {
      if (!ready()) return
      const k = Math.min(1, speed / 140)
      burst({ type: 'lowpass', freq: 180, q: 1, level: .5 + k * .3, decay: .25 })
      burst({ freq: 1100, q: .7, level: .4 + k * .3, decay: .9 + k * .5 })
      burst({ type: 'highpass', freq: 3200, level: .18 + k * .15, decay: 1.4, delay: .06 })
      for (let i = 0; i < 6; i++) burst({ freq: 1800 + Math.random() * 2400, q: 6, level: .1, decay: .07, delay: .25 + i * .12 + Math.random() * .1 })
    },
    // Thunder: a sharp crack for a close strike, then a long rolling rumble.
    thunder(close = .5) {
      if (!ready()) return
      if (close > .6) burst({ type: 'highpass', freq: 1200, level: .35 * close, decay: .35 })
      for (let i = 0; i < 5; i++) burst({ type: 'lowpass', freq: 90 + Math.random() * 120, q: .7, level: (.5 + close * .4) * (1 - i * .15), decay: 1.4 + Math.random(), delay: (1 - close) * 1.5 + i * .35 + Math.random() * .3 })
    },
    // Start lights: a short beep for 3, 2, 1 and a long high one for GO.
    countdown(go = false) {
      if (!ready()) return
      tone({ type: 'square', freq: go ? 1320 : 660, level: .07, decay: go ? .7 : .22 }); tone({ type: 'triangle', freq: go ? 1320 : 660, level: .16, decay: go ? .8 : .26 })
    },
    // NOS bottle picked up: a bright two-note chime.
    nitroPickup() {
      if (!ready()) return
      tone({ type: 'triangle', freq: 880, to: 900, level: .14, decay: .18 }); tone({ type: 'triangle', freq: 1320, to: 1360, level: .12, decay: .3, delay: .08 })
    },
    // Nitro fired: a sharp pssht of gas, then a rising jet roar under the engine.
    nitro() {
      if (!ready()) return
      music?.duck()
      burst({ type: 'highpass', freq: 4000, level: .4, decay: .35 })
      const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + 3)
      g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(.32, t + .15); g.gain.setValueAtTime(.32, t + 3); g.gain.exponentialRampToValueAtTime(.001, t + 3.6)
      src.connect(f); f.connect(g); g.connect(n.sfx); src.start(t); src.stop(t + 3.7)
      tone({ type: 'sawtooth', freq: 70, to: 140, level: .12, decay: 3.4 })
    },
    scrape() {
      if (!ready()) return
      burst({ freq: 2300, q: 4, level: .35, decay: .45 }); burst({ freq: 900, q: 2, level: .2, decay: .3 })
    },
    whoosh() {
      if (!ready()) return
      const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      src.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2200, t + .35)
      g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(.3, t + .12); g.gain.exponentialRampToValueAtTime(.001, t + .4)
      src.connect(f); f.connect(g); g.connect(n.sfx); src.start(t); src.stop(t + .45)
    },
    // Angry honk from the other driver: danfos double-toot, okadas beep high.
    honk(kind = 'car', vol = 1, delay = .25) {
      if (!ready()) return
      const [a, b] = kind === 'okada' || kind === 'keke' ? [880, 990] : kind === 'danfo' || kind === 'brt' ? [311, 392] : [440, 554]
      const times = kind === 'danfo' ? [0, .22, .44] : [0, .3]
      for (const d of times) { tone({ type: 'square', freq: a, level: .06 * vol, decay: .18, delay: delay + d }); tone({ type: 'square', freq: b, level: .06 * vol, decay: .18, delay: delay + d }) }
    },
    setMusic(on) { musicOn = on; if (music) on ? music.start() : music.stop() },
    nextTrack() { music?.next() },
    onTrack(fn) { pendingListener = fn; music?.onChange(fn) },
    // Separate volume sliders (0..1) for effects and music.
    setSfxVolume(v) { sfxLevel = v; if (n) n.sfx.gain.setTargetAtTime(v, ctx.currentTime, .05) },
    setMusicVolume(v) { musicLevel = v; if (n) n.musicBus.gain.setTargetAtTime(v, ctx.currentTime, .05) },
    setIntensity(v) { music?.setIntensity?.(v) },
    setMuted(m) { muted = m; if (n) n.master.gain.value = m ? 0 : .5 },
    dispose() { music?.stop(); engineNode?.disconnect(); ctx?.close(); ctx = null; n = null; music = null; engineNode = null },
  }
}
