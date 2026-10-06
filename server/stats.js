// Play statistics for the admin panel: who is online, sessions, play time, peaks, popular cities and cars,
// and game events. Players are anonymous: a random per-browser device ID plus the street name they chose.
// Totals are kept in a small JSON file so they survive restarts (memory only when no file is given).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

export const STAT_EVENTS = ['run', 'busted', 'wrecked', 'raceWon', 'raceLost', 'rageWon', 'nitro', 'gala']
const SESSION_GAP = 60e3, KEEP_DAYS = 30
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n }
// Hosting dashboards often keep stray whitespace or literal quotes around a pasted ADMIN_TOKEN; the console shows it the same either way.
const cleanToken = t => String(t ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()
// The token from X-Admin-Token, else Authorization: Bearer (some proxies strip Authorization before it reaches Node).
export const givenToken = req => { const h = req.headers, auth = String(h.authorization || ''); return cleanToken(h['x-admin-token'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '')) }

// Storage: `initial` + `persist(data)` (a database, see store.js), else a JSON `file`, else memory only.
export function createStats({ file = null, tokenFile = null, token = globalThis.process?.env?.ADMIN_TOKEN, initial = null, persist = null } = {}) {
  // Admin token: ADMIN_TOKEN from the environment, else one generated once and kept in tokenFile.
  let adminToken = cleanToken(token), generated = false
  if (!adminToken && tokenFile && existsSync(tokenFile)) adminToken = cleanToken(readFileSync(tokenFile, 'utf8'))
  if (!adminToken) {
    adminToken = randomBytes(16).toString('hex'); generated = true
    if (tokenFile) try { mkdirSync(dirname(tokenFile), { recursive: true }); writeFileSync(tokenFile, adminToken) } catch { /* memory only */ }
  }
  const blank = () => ({ since: Date.now(), totals: { sessions: 0, runs: 0, playSeconds: 0, events: {} }, peak: { count: 0, at: 0 }, days: {}, devices: {}, timeline: [] })
  let data = blank()
  if (initial) data = { ...blank(), ...initial }
  else if (file) try { data = { ...blank(), ...JSON.parse(readFileSync(file, 'utf8')) } } catch { /* first run */ }
  const today = () => (data.days[dayKey()] ||= { sessions: 0, runs: 0, playSeconds: 0, peak: 0, players: {}, events: {}, cities: {}, cars: {} })
  // Live sessions by device: open connections, when the session started and what they are driving.
  const live = new Map()
  const online = () => [...live.values()].filter(s => s.connections > 0)
  // Activity samples: every minute, plus whenever someone joins or leaves (so the chart moves straight away).
  const sample = () => { const now = Date.now(); data.timeline.push([now, online().length]); data.timeline = data.timeline.filter(([at]) => now - at < 24 * 3600e3).slice(-3000) }

  function endSession(device, s) {
    const seconds = Math.round((s.lastSeen - s.started) / 1000)
    data.totals.playSeconds += seconds; today().playSeconds += seconds
    const d = data.devices[device]; if (d) d.playSeconds += seconds
    live.delete(device)
  }
  function save() { if (persist) return persist(data); if (file) try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(data)) } catch { /* keep going in memory */ } }

  const minute = setInterval(() => {
    const now = Date.now()
    for (const [device, s] of live) if (s.connections === 0 && now - s.lastSeen > SESSION_GAP) endSession(device, s)
    sample()
    for (const k of Object.keys(data.days).sort().slice(0, -KEEP_DAYS)) delete data.days[k]
    save()
  }, 60e3)
  minute.unref?.()

  return {
    token: adminToken, generated,
    connect(device) {
      const now = Date.now()
      let s = live.get(device)
      if (!s) {
        s = { started: now, lastSeen: now, connections: 0, name: '', city: '', car: '', speed: 0, counted: false }
        live.set(device, s); data.totals.sessions++; today().sessions++
        const d = data.devices[device] ||= { first: now, sessions: 0, playSeconds: 0, name: '' }
        d.sessions++; d.last = now; today().players[device] = 1
      }
      s.connections++; s.lastSeen = now
      const n = online().length
      if (n > data.peak.count) data.peak = { count: n, at: now }
      if (n > today().peak) today().peak = n
      sample()
    },
    disconnect(device) { const s = live.get(device); if (s) { s.connections = Math.max(0, s.connections - 1); s.lastSeen = Date.now(); sample() } },
    // Position updates: what they are driving, where. City and car are counted once per session.
    seen(device, p) {
      const s = live.get(device); if (!s) return
      Object.assign(s, { lastSeen: Date.now(), name: p.name, city: p.city, car: p.car, speed: p.speed })
      if (data.devices[device]) data.devices[device].name = p.name
      if (!s.counted) { s.counted = true; bump(today().cities, p.city); bump(today().cars, p.car) }
    },
    event(device, type) {
      if (!STAT_EVENTS.includes(type)) return false
      bump(data.totals.events, type); bump(today().events, type)
      if (type === 'run') { data.totals.runs++; today().runs++ }
      const s = live.get(device); if (s) s.lastSeen = Date.now()
      return true
    },
    authorized(req) {
      const given = Buffer.from(givenToken(req)), want = Buffer.from(adminToken)
      return given.length === want.length && timingSafeEqual(given, want)
    },
    snapshot() {
      const now = Date.now(), t = today(), days = Object.keys(data.days).sort()
      const sum = key => days.reduce((o, k) => { for (const [n, c] of Object.entries(data.days[k][key] || {})) bump(o, n, c); return o }, {})
      const livePlay = online().reduce((n, s) => n + (now - s.started) / 1000, 0)
      return {
        now, since: data.since, online: online().length,
        peak: data.peak, peakToday: t.peak,
        today: { sessions: t.sessions, runs: t.runs, players: Object.keys(t.players).length, playMinutes: Math.round((t.playSeconds + livePlay) / 60), avgSessionMinutes: t.sessions ? +((t.playSeconds + livePlay) / 60 / t.sessions).toFixed(1) : 0, events: t.events },
        totals: { players: Object.keys(data.devices).length, sessions: data.totals.sessions, runs: data.totals.runs, playHours: +((data.totals.playSeconds + livePlay) / 3600).toFixed(1), events: data.totals.events },
        days: days.slice(-14).map(k => ({ day: k, sessions: data.days[k].sessions, players: Object.keys(data.days[k].players).length, runs: data.days[k].runs, playMinutes: Math.round(data.days[k].playSeconds / 60), peak: data.days[k].peak })),
        timeline: data.timeline.filter(([at]) => now - at < 24 * 3600e3),
        cities: sum('cities'), cars: sum('cars'),
        live: online().map(s => ({ name: s.name || 'Guest', city: s.city, car: s.car, speed: Math.round(s.speed), minutes: +((now - s.started) / 60e3).toFixed(1) })).sort((a, b) => b.minutes - a.minutes),
        recent: Object.values(data.devices).sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 12).map(d => ({ name: d.name || 'Guest', sessions: d.sessions, minutes: Math.round(d.playSeconds / 60), last: d.last })),
      }
    },
    close() { clearInterval(minute); for (const [device, s] of live) endSession(device, s); return Promise.resolve(save()) },
  }
}
