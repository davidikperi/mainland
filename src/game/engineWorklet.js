// Physically informed engine synthesis (pulse train -> exhaust waveguides -> silencer), run as an
// AudioWorklet. Based on the published approach: each cylinder firing sends a pressure pulse
// through a pipe model (delay line, inverted reflection) and a silencer whose low-pass opens with
// load and rpm. A cross-plane V8 fires every 90° but each bank fires unevenly
// (L-R-L-L-R-L-R-R), and that per-bank pattern heard through two exhausts is the burble.
export const ENGINE_WORKLET = `
class EngineSynth extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 800, minValue: 0, maxValue: 9000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }
  constructor(options) {
    super()
    this.pipes = [this.makePipe(), this.makePipe()]
    this.pulse = [0, 0]; this.pulseLen = [1, 1]; this.pulseAmp = [0, 0]
    this.crank = 0; this.rpm = 800; this.thr = 0; this.seed = 12345
    this.lp1 = 0; this.lp2 = 0; this.hp = 0; this.hpPrev = 0
    this.configure(options.processorOptions || {})
    this.port.onmessage = e => this.configure(e.data)
  }
  configure(o) {
    const cyl = o.cyl || 4
    // Firing angles over the 720° four-stroke cycle, and which exhaust bank each pulse enters.
    if (cyl === 8 && o.flat) { this.fires = [0, 90, 180, 270, 360, 450, 540, 630]; this.banks = [0, 1, 0, 1, 0, 1, 0, 1] }   // flat-plane: a screaming even beat
    else if (cyl === 8) { this.fires = [0, 90, 180, 270, 360, 450, 540, 630]; this.banks = [0, 1, 0, 0, 1, 0, 1, 1] }
    else if (cyl > 8) { this.fires = Array.from({ length: cyl }, (_, i) => i * 720 / cyl); this.banks = this.fires.map((_, i) => i % 2) }   // V10, W16: evenly spaced, alternating banks
    else if (cyl === 6) { this.fires = [0, 120, 240, 360, 480, 600]; this.banks = [0, 1, 0, 1, 0, 1] }
    else { this.fires = [0, 180, 360, 540]; this.banks = [0, 0, 0, 0] }
    this.dual = cyl > 4
    this.rasp = o.rasp ?? .4; this.lope = o.lope ?? .05; this.muffle = o.muffle ?? .5
    // Round-trip delay = 2L / c. The second bank is slightly longer, so a V engine's two exhausts beat.
    const d = len => Math.min(8000, Math.round(2 * len / 343 * sampleRate))
    // Pipes run 15% long for a deeper resonance.
    const header = (o.header || .9) * 1.15, tail = (o.tail || 2.6) * 1.15
    this.delays = [[d(header), d(tail)], [d(header * 1.07), d(tail * 1.05)]]
  }
  makePipe() { return { h: new Float32Array(8192), t: new Float32Array(8192), hi: 0, ti: 0, hl: 0, tl: 0 } }
  rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 * 2 - 1 }
  process(inputs, outputs, params) {
    const out = outputs[0][0]
    if (!out) return true
    const sr = sampleRate, rpmT = params.rpm[0], thrT = params.throttle[0], banks = this.dual ? 2 : 1
    for (let i = 0; i < out.length; i++) {
      // Follow revs quickly (a few ms), so blips, upshifts and the limiter sound crisp.
      this.rpm += (rpmT - this.rpm) * .004; this.thr += (thrT - this.thr) * .003
      const prev = this.crank
      this.crank = (this.crank + this.rpm / 60 * 360 / sr) % 720
      const wrapped = this.crank < prev
      for (let k = 0; k < this.fires.length; k++) {
        const a = this.fires[k]
        if (wrapped ? (a >= prev || a < this.crank) : (a > prev && a <= this.crank)) {
          const b = this.dual ? this.banks[k] : 0
          // A pulse lasts ~70° of crank; strength follows load, with cycle-to-cycle combustion scatter.
          this.pulseLen[b] = Math.max(8, 70 / 360 * 60 / Math.max(300, this.rpm) * sr)
          this.pulse[b] = this.pulseLen[b]
          this.pulseAmp[b] = (.22 + .78 * this.thr) * (1 + this.lope * 2.5 * this.rand())
        }
      }
      let mix = 0
      for (let b = 0; b < banks; b++) {
        let x = 0
        if (this.pulse[b] > 0) {
          const ph = 1 - this.pulse[b] / this.pulseLen[b]
          x = this.pulseAmp[b] * (Math.sin(Math.PI * ph) * (1 - ph * .6) + this.rand() * .12)
          this.pulse[b]--
        }
        // Header pipe, then tail pipe: delay lines closed by a lossy, inverting open-end reflection.
        const p = this.pipes[b], hd = this.delays[b][0], td = this.delays[b][1]
        p.hl += (p.h[(p.hi - hd + 8192) & 8191] - p.hl) * .45
        const y1 = x - .55 * p.hl
        p.h[p.hi] = y1; p.hi = (p.hi + 1) & 8191
        p.tl += (p.t[(p.ti - td + 8192) & 8191] - p.tl) * .35
        const y2 = y1 - .6 * p.tl
        p.t[p.ti] = y2; p.ti = (p.ti + 1) & 8191
        mix += y2
      }
      // Silencer: two-pole low-pass that opens with revs and throttle, then a DC blocker.
      const rn = Math.min(1, this.rpm / 6500), fc = 130 + (700 + 2300 * this.thr) * rn * (1.25 - this.muffle * .55)
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr)
      this.lp1 += (mix - this.lp1) * a; this.lp2 += (this.lp1 - this.lp2) * a
      const hp = this.lp2 - this.hpPrev + .995 * this.hp; this.hpPrev = this.lp2; this.hp = hp
      out[i] = Math.tanh(hp * (.8 + this.rasp * 1.9)) * .8
    }
    return true
  }
}
registerProcessor('engine-synth', EngineSynth)
`
