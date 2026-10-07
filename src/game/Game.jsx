import { useEffect, useRef, useState } from 'react'
import { createWorldRenderer } from './render'
import { newRace, stepWorld, racePosition, policeUnits, ARREST_TIME, rushResults, RECKLESS_LIMIT, RIVALS, COUNTDOWN, GALA_HEAL, NOS_TIME, NOS_BOOST, NOS_MAX } from './physics'
// [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
// import { nextJunction, TURN_SPEED } from './physics'
import { createAudio } from './audio'
import { createPlayerId } from './playerId'
import { CARS, CITIES, SLANG, pickLine } from './city'
import './game.css'

const colors = ['#d3f35d', '#e8402f', '#1f6fd1', '#f2f0ea', '#151515', '#1f8a4c', '#f2b41e', '#7a2fb3']
const FREE_CARS = CARS.flatMap((c, i) => c.price ? [] : [i])
// Everyone starts in the Dodge Challenger.
const DEFAULT_CAR = CARS.findIndex(c => c.name === 'Dodge Challenger')
const initial = { name: '', color: colors[1], avatar: '01', points: 0, car: DEFAULT_CAR, owned: FREE_CARS, upgrades: [0, 0, 0], onboarded: false }
// Street names to pick from during onboarding.
// Each upgrade level costs more than the last: 22,500 RP to max one out.
const UPGRADE_PRICES = [1000, 2000, 3500, 6000, 10000]
const NAME_IDEAS = ['Lagos Legend', 'Danfo King', 'Oga Driver', 'Island Boss', 'Third Mainland', 'Eko Speedster', 'Agbero Chief', 'Ojuelegba Flash', 'Mama Put Racer', 'Area Father']
function readSave() { try { const p = JSON.parse(localStorage.getItem('mainland-save') || 'null'); return p && CARS[p.car] && Array.isArray(p.upgrades) ? { ...initial, ...p, owned: [...new Set([...FREE_CARS, ...(p.owned || []), p.car])] } : initial } catch { return initial } }
// Anonymous per-browser ID for the admin play stats (random, no personal data).
function deviceId() { try { let d = localStorage.getItem('mainland-device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('mainland-device', d) } return d } catch { return 'guest' } }
const blankHud = { speed: 0, distance: 0, wanted: 0, message: '', race: null, damage: 0, arrested: false, policePhase: null, arrest: 0, escape: 0, policeDistance: null, blips: [] }
const SPEAKER = { luxury: 'BIG MAN', danfo: 'DANFO DRIVER', car: 'DRIVER', taxi: 'TAXI DRIVER', keke: 'KEKE RIDER', okada: 'OKADA MAN', brt: 'BRT DRIVER', police: 'OLOKPA', you: 'YOU' }
// Raindrop beads on the windscreen: [left %, top %, size px, delay s].
const DROPS = Array.from({ length: 14 }, (_, i) => { const r = n => { const s = Math.sin((i + 1) * n) * 43758.5453; return s - Math.floor(s) }; return [r(12.9) * 100, r(78.2) * 90, 18 + r(39.4) * 70, r(5.7) * 1.2] })

const clamp01 = n => Math.max(0, Math.min(1, n))
function raceHud(g, peers) {
  const r = g.race; if (!r) return null
  const pos = racePosition(g, peers), start = r.start ?? g.z, finish = r.finish ?? start + 1500, total = finish - start
  // Gap to the car directly ahead, or to the one chasing you when you lead.
  const ahead = pos.rivals.filter(v => v.z > g.z).sort((a, b) => a.z - b.z)[0], behind = pos.rivals.filter(v => v.z <= g.z).sort((a, b) => b.z - a.z)[0]
  const gap = ahead ? Math.round(g.z - ahead.z) : behind ? Math.round(g.z - behind.z) : null
  // Live standings: finishers in order, then everyone still racing by how far along they are.
  const field = [{ id: 'player', me: true, z: g.z }, ...pos.rivals.map(v => ({ id: v.id, z: v.z, rival: v.rival }))]
  const standings = field.sort((a, b) => { const fa = r.finished?.indexOf(a.id) ?? -1, fb = r.finished?.indexOf(b.id) ?? -1; return fa >= 0 && fb >= 0 ? fa - fb : fa >= 0 ? -1 : fb >= 0 ? 1 : b.z - a.z })
    .map((e, i) => ({ pos: i + 1, me: !!e.me, name: e.me ? 'YOU' : RIVALS[e.rival]?.name ?? 'RIVAL', color: e.me ? '#fffdf5' : RIVALS[e.rival]?.color, gap: e.me ? null : Math.round(e.z - g.z) }))
  return { lap: r.lap ?? 1, laps: r.laps ?? 1, standings, label: r.label, place: pos.place, of: pos.of, time: !r.launched ? '0.0' : (r.done ? r.done.time : g.time - r.go).toFixed(1), toGo: Math.max(0, Math.round(finish - g.z)), gap, me: clamp01((g.z - start) / total), rivals: pos.rivals.map(v => ({ id: v.id, at: clamp01((v.z - start) / total), main: v.id === r.rival, color: RIVALS[v.rival]?.color })) }
}
const TIME_MODES = { auto: 'AUTO', live: 'LIVE', day: 'DAY', night: 'NIGHT' }
// 0 = midnight, .5 = noon. AUTO runs an 8-minute day; LIVE follows your device clock.
function timePhase(mode, seconds) {
  if (mode === 'day') return .42
  if (mode === 'night') return .02
  if (mode === 'live') { const d = new Date(); return (d.getHours() + d.getMinutes() / 60) / 24 }
  return (.3 + seconds / 480) % 1
}
const WEATHER = { auto: 'AUTO', sunny: 'SUNNY', rainy: 'RAINY' }
// AUTO: the sky changes every couple of minutes; roughly two spells in five are rainy (Lagos rainy season).
function rainTarget(mode, seconds) {
  if (mode === 'sunny') return 0
  if (mode === 'rainy') return 1
  const k = Math.floor(seconds / 140), s = Math.sin(k * 91.7 + 3.1) * 43758.5453
  return k > 0 && s - Math.floor(s) > .6 ? 1 : 0
}

const ORDINAL = ['1ST', '2ND', '3RD', '4TH', '5TH']
// When to use the lean mobile HUD: a touch screen, or a phone-sized window (narrow, or a short landscape screen).
const MOBILE_QUERY = '(pointer: coarse), (max-width: 820px), (max-height: 520px)'
// Power-up drawings for the pre-race briefing (they match the pickups on the road).
const PEPSI_ICON = <svg viewBox="0 0 40 80" aria-hidden="true"><rect x="15" y="0" width="10" height="6" rx="1.5" fill="#1d4fd8" /><path d="M15 6h10v6l5 8v52a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6V20l5-8z" fill="#2a1408" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" /><rect x="10.8" y="34" width="18.4" height="20" fill="#0a2a8f" /><circle cx="20" cy="44" r="6.5" fill="#fff" /><path d="M13.5 44a6.5 6.5 0 0 1 13 0c-3 -2 -9 2 -13 0z" fill="#e32636" /><path d="M13.5 44a6.5 6.5 0 0 0 13 0c-3 2 -9 -2 -13 0z" fill="#1d4fd8" /><path d="M17 22v44" stroke="rgba(255,255,255,.25)" strokeWidth="2" /></svg>
const GALA_ICON = <svg viewBox="0 0 96 50" aria-hidden="true"><path d="M8 10h80v30H8z" fill="#d6261c" /><path d="M2 12l6 -2v30l-6 -2 3 -6.5 -3 -6.5 3 -6.5z M94 12l-6 -2v30l6 -2 -3 -6.5 3 -6.5 -3 -6.5z" fill="#b51d14" /><path d="M8 18h80v14H8z" fill="#ffd21a" /><text x="48" y="29.5" textAnchor="middle" fontFamily="Arial Black, Arial" fontWeight="900" fontStyle="italic" fontSize="12" fill="#d6261c">GALA</text><text x="48" y="15.5" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="5.5" fill="#fff">BEEF SAUSAGE ROLL</text></svg>
// What drivers shout when the road chaos hits them.
const CHAOS_LINES = { swerve: ['COMOT! I DEY PASS!', 'NA MY LANE NOW!', 'SHIFT, SHIFT, SHIFT!'], brake: ['WETIN?! I NO SEE YOU!', 'I DEY BRAKE O!', 'GOAT DEY ROAD!'], blowout: ['MY TYRE DON BURST O!', 'JESUS! MY TYRE!', 'WAHALA DEY O!'] }
// The prize ticks up from zero once the badge has landed.
function CountUp({ to, delay = 900, duration = 1100 }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let frame, start
    const step = t => { start ??= t; const p = Math.min(1, Math.max(0, (t - start - delay) / duration)); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) frame = requestAnimationFrame(step) }
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame)
  }, [to, delay, duration])
  return n.toLocaleString()
}

export default function Game() {
  const [profile, setProfile] = useState(readSave)
  const [city, setCity] = useState('Lagos'), [screen, setScreen] = useState(() => readSave().onboarded ? 'title' : 'onboard-name'), [started, setStarted] = useState(false)
  const [showControls, setShowControls] = useState(true), [quality, setQuality] = useState('high'), [sound, setSound] = useState(true)
  const [timeMode, setTimeMode] = useState(() => { try { return TIME_MODES[localStorage.getItem('mainland-time')] ? localStorage.getItem('mainland-time') : 'auto' } catch { return 'auto' } })
  const timeRef = useRef(timeMode)
  const [weather, setWeather] = useState(() => { try { return WEATHER[localStorage.getItem('mainland-weather')] ? localStorage.getItem('mainland-weather') : 'auto' } catch { return 'auto' } })
  const weatherRef = useRef(weather)
  useEffect(() => { weatherRef.current = weather; try { localStorage.setItem('mainland-weather', weather) } catch { /* private mode */ } }, [weather])
  // Separate effects and music volume (0–100), remembered between sessions.
  const [volume, setVolume] = useState(() => { try { return { sfx: 80, music: 85, ...JSON.parse(localStorage.getItem('mainland-volume') || '{}') } } catch { return { sfx: 80, music: 85 } } })
  const [musicOn, setMusicOn] = useState(() => { try { return localStorage.getItem('mainland-music') !== 'off' } catch { return true } }), [track, setTrack] = useState(null)
  const [connected, setConnected] = useState(false), [peers, setPeers] = useState([])
  const [whip, setWhip] = useState(null), [nitroFx, setNitroFx] = useState(0)
  const [hud, setHud] = useState(blankHud), [toast, setToast] = useState(null), [renderError, setRenderError] = useState(''), [chat, setChat] = useState([])
  const runPending = useRef(false)
  // Phones, tablets and any small window: a stripped-down HUD (position, RP, speed, damage, buttons) so the road
  // stays visible. Follows the screen live (rotating, resizing, DevTools device mode).
  const [touch, setTouch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(MOBILE_QUERY).matches)
  useEffect(() => { const q = matchMedia(MOBILE_QUERY), on = () => setTouch(q.matches); q.addEventListener('change', on); return () => q.removeEventListener('change', on) }, [])
  // Pre-race briefing on the Pepsi and Gala pickups; the countdown waits for START RACE (or Enter/Space).
  const [briefing, setBriefing] = useState(false), briefingRef = useRef(false)
  const [skipBriefing, setSkipBriefing] = useState(() => { try { return localStorage.getItem('mainland-skip-briefing') === '1' } catch { return false } })
  useEffect(() => { briefingRef.current = briefing }, [briefing])
  useEffect(() => { try { localStorage.setItem('mainland-skip-briefing', skipBriefing ? '1' : '0') } catch { /* private mode */ } }, [skipBriefing])
  // The car on the garage turntable: any car, owned or not (racing uses profile.car, always an owned one).
  const [viewCar, setViewCarState] = useState(null), viewRef = useRef(null)
  // The 3D turntable reads the ref every frame, so set both together (an effect would lag a render behind).
  const setViewCar = i => { viewRef.current = i; setViewCarState(i) }
  // Shaders compile in the background after load; the race can't start until they're done.
  const [warm, setWarm] = useState(false)
  // Game events for the admin panel's stats.
  const report = type => { fetch('/api/stat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id.current, type }) }).catch(() => {}) }
  const canvas = useRef(null), keys = useRef({}), peerRef = useRef([]), game = useRef(newRace({ countdown: false })), id = useRef(null), rendererRef = useRef(null), audio = useRef(null), screenRef = useRef(screen), chatKey = useRef(0)
  // After the finish the world keeps moving behind the results screen while your car coasts to a stop.
  const playing = screen === 'drive', coasting = screen === 'results'
  const car = CARS[profile.car], maxSpeed = car.speed + profile.upgrades[0] * 10
  useEffect(() => { screenRef.current = screen }, [screen])
  useEffect(() => { timeRef.current = timeMode; try { localStorage.setItem('mainland-time', timeMode) } catch { /* private mode */ } }, [timeMode])
  // Dev-only handle for automated play-testing.
  useEffect(() => { if (import.meta.env.DEV) window.__mainland = { game, keys } }, [])

  useEffect(() => {
    // Warm-up starts a beat later, so a renderer that is torn down straight away (React dev double-mount) never begins an async compile.
    let warmTimer = 0
    try { const r = createWorldRenderer(canvas.current, city, quality); rendererRef.current = r; warmTimer = setTimeout(() => { if (rendererRef.current === r) r.prewarm() }, 300) }
    catch { queueMicrotask(() => setRenderError('3D graphics could not start. Enable hardware acceleration and reload in a WebGL2-capable browser.')) }
    return () => { clearTimeout(warmTimer); rendererRef.current?.dispose(); rendererRef.current = null; setWarm(false) }
  }, [city, quality])
  useEffect(() => {
    id.current = createPlayerId(); audio.current = createAudio()
    audio.current.onTrack(info => setTrack({ ...info, at: performance.now() }))
    // Browsers only allow sound after a tap or key press: start the radio on the first one.
    const wake = () => audio.current?.start()
    window.addEventListener('pointerdown', wake, { once: true }); window.addEventListener('keydown', wake, { once: true })
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); audio.current?.dispose() }
  }, [])
  useEffect(() => { audio.current?.setSfxVolume(volume.sfx / 100); audio.current?.setMusicVolume(volume.music / 100); try { localStorage.setItem('mainland-volume', JSON.stringify(volume)) } catch { /* private mode */ } }, [volume])
  useEffect(() => { audio.current?.setMusic(musicOn); try { localStorage.setItem('mainland-music', musicOn ? 'on' : 'off') } catch { /* private mode */ } }, [musicOn])
  useEffect(() => { audio.current?.setMuted(!sound) }, [sound])
  useEffect(() => { try { localStorage.setItem('mainland-save', JSON.stringify(profile)) } catch { /* Storage can be unavailable; keep playing without saving. */ } }, [profile])
  useEffect(() => {
    const down = e => {
      if (e.key.toLowerCase() === 'm' && !/INPUT/.test(e.target.tagName)) { audio.current?.nextTrack(); return }
      if (e.key.toLowerCase() === 't' && !/INPUT/.test(e.target.tagName)) { const order = Object.keys(TIME_MODES); setTimeMode(m => order[(order.indexOf(m) + 1) % order.length]); return }
      if (e.key.toLowerCase() === 'r' && !/INPUT/.test(e.target.tagName)) { const order = Object.keys(WEATHER); setWeather(m => order[(order.indexOf(m) + 1) % order.length]); return }
      if (briefingRef.current && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const g = game.current; if (g.race && g.race.go === Infinity) g.race.go = g.time + COUNTDOWN; setBriefing(false); return }
      if (e.key === 'Escape') { keys.current = {}; setScreen(s => s === 'drive' ? 'paused' : s === 'paused' ? 'drive' : s); return }
      if (/INPUT|SELECT/.test(e.target.tagName)) return
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
      keys.current[e.key.toLowerCase()] = true
      // Nitro fires on the press itself, however quick the tap.
      if (['n', 'shift'].includes(e.key.toLowerCase()) && !e.repeat) keys.current.nTap = true
    }
    const up = e => { keys.current[e.key.toLowerCase()] = false }
    const blur = () => { keys.current = {}; setScreen(s => s === 'drive' ? 'paused' : s) }
    const menu = e => e.preventDefault()
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); window.addEventListener('contextmenu', menu)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('contextmenu', menu) }
  }, [])

  // Live multiplayer while driving
  useEffect(() => {
    if (!playing) return
    const stream = new EventSource(`/api/world?id=${id.current}&device=${encodeURIComponent(deviceId())}`)
    stream.onopen = () => { setConnected(true); if (runPending.current) { runPending.current = false; report('run') } }; stream.onerror = () => setConnected(false)
    stream.onmessage = e => {
      const data = JSON.parse(e.data)
      peerRef.current = data.players.filter(p => p.id !== id.current && p.city === city); setPeers(peerRef.current)
      for (const event of data.events || []) {
        if (event.type === 'impact') { game.current.speed = 0; game.current.shake = .22; game.current.message = 'CONTACT! Reverse and separate before the next bump.' }
        if (event.type === 'race' && !game.current.rush) { game.current.heat = 35; game.current.race = { end: game.current.time + 70, finish: game.current.z + 1500, start: game.current.z, rival: event.from, rivals: [event.from], finished: [], label: 'LIVE STREET RACE' }; game.current.message = 'SECOND IMPACT! LIVE RACE ON — FIRST TO THE FINISH' }
      }
    }
    const timer = setInterval(() => {
      const g = game.current
      fetch('/api/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id.current, city, name: profile.name, car: car.name, color: profile.color, z: g.z, x: g.x, speed: g.speed }) }).catch(() => setConnected(false))
    }, 120)
    return () => { stream.close(); clearInterval(timer); peerRef.current = []; setPeers([]); setConnected(false) }
  }, [playing, city, profile.name, profile.color, car.name])

  useEffect(() => {
    let warmSeen = false, frame, previous = 0, uiTime = 0, lastMessage = '', tauntAt = 0, acc = 0, lastIntensity = -1, rain = rainTarget(weatherRef.current, performance.now() / 1000), flash = 0
    const lastSaid = new Map(), hitIds = new Set(), coarse = matchMedia('(pointer: coarse)')
    // Speech bubbles over vehicles. On touch screens only the police and drivers you've hit get one; the rest would cover the road.
    const bubble = (id, text, kind, from = kind) => { if (!coarse.matches || from === 'police' || hitIds.has(id)) rendererRef.current?.say(id, text, kind) }
    // Other drivers react: crash sounds, honks and a mouthful of Lagos pidgin.
    function react(e, g) {
      const a = audio.current, now = g.time
      if (((e.type === 'crash' && !e.rammed) || e.type === 'scrape') && e.id !== 'player') { hitIds.add(e.id); rendererRef.current?.markHit(e.id) }
      // Stats for the admin panel.
      if (['nitro', 'gala', 'rageWon'].includes(e.type)) report(e.type)
      if (e.type === 'raceEnd') report(e.won ? 'raceWon' : 'raceLost')
      let line = null
      let who = e.kind
      // Sounds from elsewhere on the road fade with distance.
      const vol = e.z === undefined ? 1 : Math.max(0, 1 - Math.abs(e.z - g.z) / 160)
      if (e.type === 'wrecked') { a?.crash(140); a?.crash(90, .8); return }
      else if (e.type === 'countdown' || e.type === 'raceGo') { a?.countdown(e.type === 'raceGo'); return }
      else if (e.type === 'lap') { a?.countdown(true); return }
      else if (e.type === 'perfectStart') { a?.whoosh(); a?.nitroPickup(); return }
      else if (e.type === 'crash' && e.rammed) { a?.crash(e.impact); a?.honk(e.kind, 1, .2); line = pickLine(SLANG.rammed) }
      else if (e.type === 'blocking') line = pickLine(SLANG.blocking)
      // Reckless drivers: an unprovoked attack, or a sharp cut-in right in front of you.
      else if (e.type === 'fight') { a?.honk(e.kind, 1, 0); a?.honk(e.kind, 1, .5); line = pickLine(SLANG.fight); if (SLANG.isLuxury(e)) who = 'luxury' }
      else if (e.type === 'cutIn') { a?.honk(e.kind, vol, 0); if (Math.random() < .6) line = pickLine(SLANG.cutIn) }
      else if (e.type === 'nitroPickup') { a?.nitroPickup(); return }
      else if (e.type === 'gala') { a?.nitroPickup(); return }
      else if (e.type === 'nitro') { a?.nitro(); setNitroFx(n => n + 1); return }
      else if (e.type === 'turn') { a?.whoosh(); setWhip({ side: e.side, key: performance.now() }); if (e.followed) { const v = g.traffic.find(o => o.rage); if (v) { line = pickLine(SLANG.followed); e = { ...e, id: v.id, kind: v.kind }; who = v.kind } } }
      else if (e.type === 'splash') { a?.splash(e.speed); line = pickLine(SLANG.splash); who = 'you'; e = { ...e, id: 'player' } }
      else if (e.type === 'crash' && e.nitro) { a?.crash(e.impact, .8); a?.honk(e.kind, 1, .3); line = pickLine(SLANG.nitroHit) }
      else if (e.type === 'crash') { a?.crash(e.impact); if (e.kind !== 'police') a?.honk(e.kind); if (SLANG.isLuxury(e)) who = 'luxury'; line = pickLine(SLANG.crash[who] || SLANG.crash.car) }
      else if (e.type === 'scrape') { a?.scrape(); if (SLANG.isLuxury(e)) { who = 'luxury'; line = pickLine(SLANG.crash.luxury) } else if (e.racer) line = pickLine(SLANG.ramming); else if (Math.random() < .6) line = pickLine(SLANG.scrape) }
      else if (e.type === 'raceJoin') line = pickLine(SLANG.raceJoin)
      else if (e.type === 'rage') { a?.honk(e.kind, 1, .1); line = pickLine(SLANG.isLuxury(e) ? SLANG.rageLuxury : SLANG.rage); if (SLANG.isLuxury(e)) who = 'luxury' }
      else if (e.type === 'rageHonk') { a?.honk(e.kind, vol, 0); if (Math.random() < .5) line = pickLine(SLANG.rageHonk) }
      else if (e.type === 'npcHonk') { if (vol > .05) a?.honk(e.kind, vol * .7, 0); if (vol > .3 && Math.random() < .55) line = pickLine(SLANG.npcHonk[e.atKind] || SLANG.npcHonk.car) }
      else if (e.type === 'npcCrash') {
        a?.crash(e.impact, vol * .8); if (vol > .1) a?.honk(e.otherKind, vol, .35)
        if (vol > .25) { const reply = pickLine(SLANG.npcCrashReply); setTimeout(() => { bubble(e.id, reply, e.kind); setChat(c => [...c.slice(-2), { who: SPEAKER[e.kind] || 'DRIVER', text: reply, at: performance.now(), key: ++chatKey.current }]) }, 1400); line = pickLine(SLANG.npcCrash); e = { ...e, id: e.other, kind: e.otherKind }; who = e.kind }
      }
      else if (e.type === 'chaos') { if (e.what === 'blowout') a?.crash(25, vol * .6); a?.honk(e.kind, vol * .8, 0); line = pickLine(CHAOS_LINES[e.what]) }
      else if (e.type === 'pickup') { if (Math.random() < .5) line = pickLine(CITIES[city].calls) }
      else if (e.type === 'jamAhead') { setToast({ text: pickLine(SLANG.jamAhead), at: performance.now() }); return }
      else if (e.type === 'nearMiss') { a?.whoosh(); if (Math.random() < .45) line = pickLine(SLANG.nearMiss) }
      else if (e.type === 'race') line = pickLine(SLANG.raceStart[e.kind === 'danfo' ? 'danfo' : 'car'])
      else if (e.type === 'raceEnd') line = pickLine(e.won ? SLANG.raceWon : SLANG.raceLost)
      else if (e.type === 'rageWon' || e.type === 'rageLost') { line = pickLine(e.type === 'rageWon' ? SLANG.rageWon : SLANG.rageLost); if (SLANG.isLuxury(e)) who = 'luxury' }
      if (!line) return
      const urgent = ['race', 'raceEnd', 'raceJoin', 'rageWon', 'rageLost', 'fight'].includes(e.type)
      if (!urgent && now - (lastSaid.get(e.id) ?? -9) < 2.5) return
      lastSaid.set(e.id, now)
      // Other drivers get a bubble over their car; your own lines only go in the chat (a bubble over your car fills the screen).
      if (e.id !== 'player') bubble(e.id, line, urgent ? 'race' : e.kind, e.kind)
      setChat(c => [...c.slice(-2), { who: e.type.startsWith('race') ? 'RACER' : SPEAKER[who] || 'DRIVER', text: line, at: performance.now(), key: ++chatKey.current }])
    }
    const settings = { maxSpeed, engine: car.engine, acceleration: car.acceleration + profile.upgrades[1] * 8, handling: car.handling / 85 + profile.upgrades[2] * .1 }
    function tick(t) {
      // Fixed 60 Hz physics: the same speed and handling whatever the frame rate, and no slow-motion when a frame runs long.
      const frameDt = Math.min((t - (previous || t)) / 1000, .25); previous = t
      const g = game.current, k = keys.current, STEP = 1 / 60
      acc += frameDt
      let substeps = 0
      // Weather drifts in and out over a few seconds; heavy rain brings lightning and thunder.
      const wantRain = rainTarget(weatherRef.current, t / 1000)
      rain += Math.max(-frameDt / 6, Math.min(frameDt / 6, wantRain - rain)); g.rain = rain
      flash = Math.max(0, flash - frameDt * 4)
      if (rain > .7 && Math.random() < frameDt * .05) { const close = Math.random(); flash = .6 + close * .4; audio.current?.thunder(close) }
      if (playing || coasting) {
        g.model = profile.car   // your car's real size for collisions
        while (acc >= STEP && substeps < 10) { stepWorld(g, coasting ? {} : k, STEP, settings, peerRef.current, target => { fetch('/api/bump', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id.current, target }) }).catch(() => {}) }); acc -= STEP; substeps++ }
        if (substeps === 10) acc = 0
        if (substeps) k.nTap = false
        if (g.arrested && !g.reported) { g.reported = true; report('busted') }
        if (g.wrecked && !g.reported) { g.reported = true; report('wrecked') }
        if (g.arrested) setScreen('busted')
        else if (g.wrecked && g.time - g.wreckedAt > 2.8) setScreen('wrecked')
        else if (playing && g.race?.done && g.time - g.race.done.at > 2.4) setScreen('results')
        for (const e of g.events || []) react(e, g)
        // A rival who pulls clear brags about it.
        const rival = g.race?.launched && !g.race.done && g.traffic.find(v => g.race.rivals.includes(v.id) && v.z - g.z > 15 && v.z - g.z < 80)
        if (rival && g.time > tauntAt) { tauntAt = g.time + 9; const line = pickLine(SLANG.rivalLeads); bubble(rival.id, line, 'race', rival.kind); setChat(c => [...c.slice(-2), { who: 'RIVAL', text: line, at: performance.now(), key: ++chatKey.current }]) }
      } else if (!started) { while (acc >= STEP && substeps < 4) { stepWorld(g, {}, STEP, settings); acc -= STEP; substeps++ } acc = Math.min(acc, STEP) }  // Let the city live behind the title screen.
      else acc = 0
      if (!warmSeen && rendererRef.current?.isReady?.()) { warmSeen = true; setWarm(true) }
      const mode = ['garage', 'onboard-car'].includes(screenRef.current) ? 'garage' : ['drive', 'paused', 'busted', 'results'].includes(screenRef.current) ? 'drive' : 'menu'
      rendererRef.current?.render({ ...g, city, color: profile.color, mode, ambientTime: t / 1000, timeOfDay: timePhase(timeRef.current, t / 1000), lightning: flash * (Math.random() > .35 ? 1 : .25), peers: peerRef.current, car: mode === 'garage' ? viewRef.current ?? profile.car : profile.car })
      // Siren loudness and the HUD distance follow the nearest police unit.
      const p = g.police, units = policeUnits(g), policeDistance = units.length ? Math.round(Math.min(...units.map(u => Math.hypot((g.x - u.x) * 7, g.z - u.z)))) : null
      g.events = []
      // Music heats up for races and police chases, cools down in menus.
      const intensity = playing ? (g.race || g.police ? 1 : .55) : .2
      if (intensity !== lastIntensity) { lastIntensity = intensity; audio.current?.setIntensity(intensity) }
      audio.current?.update({ rpm: g.rpm || car.engine.idle, gear: g.gear || 1, throttle: g.throttle || 0, engine: car.engine, turbo: profile.upgrades[1], skid: g.skid || 0, playing, horn: !!k.h, time: t / 1000, rain, speed: Math.abs(g.speed), siren: p && p.phase !== 'arrested' ? Math.max(0, 1 - policeDistance / 220) : 0 })
      if (t - uiTime > 100) {
        uiTime = t
        // Bank earned rep with the UI refresh, not every physics step.
        if (Math.abs(g.score) >= 1) { const pts = Math.trunc(g.score); g.score -= pts; setProfile(p => ({ ...p, points: Math.max(0, p.points + pts) })) }
        if (g.message && g.message !== lastMessage) { lastMessage = g.message; setToast({ text: g.message, at: t }) }
        setHud({
          speed: Math.round(g.speed), distance: g.z / 1000, rain: rain > .5, nitro: g.nitro || 0, boost: g.time < (g.boostUntil || 0), street: g.street || 0, /* [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning. junction: (() => { const j = nextJunction(g); return !g.turning && j.z - g.z < 170 && `${g.street}:${j.k}` !== g.turnedAt ? { d: Math.max(0, Math.round(j.z - g.z)), cross: j.cross } : null })(), */ wanted: g.police ? g.wanted : 0, arrested: g.arrested, policePhase: p?.phase, arrest: Math.min(1, (g.arrestMeter || 0) / ARREST_TIME), escape: g.escape || 0, policeDistance, units: units.length,
          race: raceHud(g, peerRef.current), results: coasting || g.race?.done ? rushResults(g) : null,
          countdown: !g.race?.grid ? null : !g.race.launched ? (g.race.go - g.time > 3 ? null : Math.ceil(g.race.go - g.time)) : g.time - g.race.go < .9 ? 'GO!' : null,
          reckless: g.rush && !g.police && !g.race?.done ? clamp01((g.reckless || 0) / RECKLESS_LIMIT) : 0, damage: Math.round(g.damage || 0), gear: g.gear || 1, rpm: (g.rpm || 0) / car.engine.redline,
          blips: [...units.map(u => ({ x: u.x - g.x, z: u.z - g.z, police: true })), ...g.traffic.filter(v => Math.abs(v.z - g.z) < 90).map(v => ({ x: v.x - g.x, z: v.z - g.z, color: v.rival !== undefined ? RIVALS[v.rival].color : null }))],
        })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [playing, coasting, started, city, profile.color, profile.car, profile.upgrades, car.acceleration, car.handling, car.engine, maxSpeed])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id) }, [toast])
  useEffect(() => { if (!chat.length) return; const id = setTimeout(() => setChat(c => c.filter(m => performance.now() - m.at < 5000)), 5100 - (performance.now() - chat[0].at)); return () => clearTimeout(id) }, [chat])

  function changeCity(next) { if (next === city) return; setCity(next); game.current = newRace({ countdown: false }); setStarted(false) }
  function upgrade(i) { const price = UPGRADE_PRICES[profile.upgrades[i]]; if (profile.points >= price && profile.upgrades[i] < 5) setProfile(p => ({ ...p, points: p.points - price, upgrades: p.upgrades.map((v, j) => j === i ? v + 1 : v) })) }
  function drive() { setViewCar(null); if (!profile.onboarded) { setScreen('onboard-name'); return } startDrive() }
  // A new race waits on the grid while the briefing is up; START RACE begins the 3-2-1.
  function freshRace() { game.current = newRace({ countdown: skipBriefing }); setBriefing(!skipBriefing) }
  function startCountdown() { const g = game.current; if (g.race && g.race.go === Infinity) g.race.go = g.time + COUNTDOWN; setBriefing(false) }
  function startDrive() { runPending.current = true; audio.current?.start(); keys.current = {}; autoFullscreen(); if (!started) { freshRace(); setStarted(true) } setScreen('drive') }
  // Onboarding: a street name first, then a car; then straight into the drive.
  const nameOk = profile.name.trim().length >= 2
  function finishOnboarding() { setViewCar(null); setProfile(p => ({ ...p, name: p.name.trim(), onboarded: true })); startDrive() }
  function randomName() { setProfile(p => ({ ...p, name: NAME_IDEAS.filter(n => n !== p.name)[Math.floor(Math.random() * (NAME_IDEAS.length - 1))] })) }
  function restart() { runPending.current = true; audio.current?.start(); autoFullscreen(); freshRace(); keys.current = {}; setStarted(true); setScreen('drive') }
  function quit() { game.current = newRace({ countdown: false }); setStarted(false); setScreen('title') }
  function cycleCar(d) { const next = ((viewCar ?? profile.car) + d + CARS.length) % CARS.length; setViewCar(next); if (profile.owned.includes(next)) setProfile(p => ({ ...p, car: next })) }
  function buyCar(i) { const price = CARS[i].price; if (profile.owned.includes(i) || profile.points < price) return; setProfile(p => ({ ...p, points: p.points - price, owned: [...p.owned, i], car: i })); setToast({ text: `${CARS[i].name.toUpperCase()} NA YOURS NOW!`, at: performance.now() }) }
  const shown = viewCar ?? profile.car, shownCar = CARS[shown], shownOwned = profile.owned.includes(shown)
  const shopButton = shownOwned ? null : <button className="play small buy" disabled={profile.points < shownCar.price} onClick={() => buyCar(shown)}>{profile.points >= shownCar.price ? `BUY · ${shownCar.price.toLocaleString()} RP` : `🔒 NEED ${(shownCar.price - profile.points).toLocaleString()} MORE RP`}</button>
  const lockTag = shownOwned ? null : <span className="lock-tag">🔒 {shownCar.price.toLocaleString()} RP</span>
  const canFullscreen = typeof document !== 'undefined' && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
  async function enterFullscreen() {
    const el = document.documentElement
    try { await (el.requestFullscreen || el.webkitRequestFullscreen).call(el); await window.screen.orientation?.lock?.('landscape').catch(() => {}) } catch { /* the browser said no */ }
  }
  // Phones and tablets go fullscreen as the race starts (it needs the tap that started it).
  function autoFullscreen() { if (canFullscreen && !isFullscreen() && matchMedia('(pointer: coarse)').matches) enterFullscreen() }
  async function fullscreen() {
    if (isFullscreen()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document) } catch { /* already out */ } return }
    if (!canFullscreen) { setRenderError('This browser can\'t go fullscreen from a web page (iPhone Safari). Tap Share, then Add to Home Screen, and open Naija Rush from your home screen to play fullscreen.'); return }
    await enterFullscreen()
  }
  const hold = key => ({ onPointerDown: e => { e.currentTarget.setPointerCapture(e.pointerId); keys.current[key] = true }, onPointerUp: () => { keys.current[key] = false }, onPointerCancel: () => { keys.current[key] = false } })

  const wrap = (n, len) => ((n % len) + len) % len, roads = CITIES[city].roads, road = roads[wrap(hud.street || 0, roads.length)], area = CITIES[city].areas[wrap((hud.street || 0) * 3 + Math.floor(hud.distance / .84), CITIES[city].areas.length)]
  // [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
  // const crossName = hud.junction ? roads[wrap(hud.junction.cross, roads.length)] : ''
  const back = <button className="round-btn back" aria-label="Back" onClick={() => { setViewCar(null); setScreen(started ? 'paused' : 'title') }}>‹</button>
  const sliders = <div className="sliders">{[['sfx', 'SOUND FX', '🔊'], ['music', 'MUSIC', '🎵']].map(([k, label, icon]) => <label key={k}><span>{icon} {label}</span><input type="range" min="0" max="100" value={volume[k]} aria-label={`${label} volume`} onChange={e => setVolume(v => ({ ...v, [k]: Number(e.target.value) }))} style={{ '--fill': `${volume[k]}%` }} /><b>{volume[k]}</b></label>)}</div>
  function cycleWeather() { const order = Object.keys(WEATHER); setWeather(m => order[(order.indexOf(m) + 1) % order.length]) }
  const weatherButton = <button className="round-btn time-btn" aria-label={`Weather: ${WEATHER[weather]}`} title="Weather (R)" onClick={cycleWeather}>{weather === 'rainy' ? '🌧' : weather === 'sunny' ? '☀' : '⛅'}<small>{WEATHER[weather]}</small></button>
  function cycleTime() { const order = Object.keys(TIME_MODES); setTimeMode(m => order[(order.indexOf(m) + 1) % order.length]) }
  const timeButton = <button className="round-btn time-btn" aria-label={`Time of day: ${TIME_MODES[timeMode]}`} title="Time of day (T)" onClick={cycleTime}>{timeMode === 'night' ? '☾' : timeMode === 'day' ? '☀' : timeMode === 'live' ? '🕑' : '◐'}<small>{TIME_MODES[timeMode]}</small></button>
  const coins = <div className="coins"><i>₦</i>{profile.points.toLocaleString()}<small>RP</small></div>
  const gaugeR = 54, arc = Math.PI * 1.5 * gaugeR, fill = Math.min(1, Math.abs(hud.speed) / maxSpeed)
  const wantedStars = hud.wanted > 0 && <div className="wanted">{[1, 2, 3].map(s => <b key={s} className={s <= hud.wanted ? 'on' : ''}>★</b>)}</div>
  const recklessChip = hud.reckless > .02 && <div className={`chip reckless ${hud.reckless > .75 ? 'hot' : ''}`}><span>{hud.reckless > .75 ? 'OLOKPA DEY WATCH YOU!' : 'RECKLESS DRIVING'}</span><i style={{ width: `${hud.reckless * 100}%` }} /></div>
  const meters = (
          <div className="gauge-wrap">
          {(hud.nitro > 0 || hud.boost) && <div className={`nos-chip ${hud.boost ? 'burning' : ''}`}>{hud.boost ? 'PEPSI POWER!!' : <>PEPSI {'🥤'.repeat(hud.nitro)}<kbd>N</kbd></>}</div>}
          {hud.damage > 0 && <div className={`damage ${hud.damage > 70 ? 'bad' : hud.damage > 35 ? 'mid' : ''}`}><span>DAMAGE</span><i><em style={{ width: `${hud.damage}%` }} /></i></div>}
          <div className="gauge">
            <svg viewBox="-64 -64 128 128"><circle r={gaugeR} className="g-track" strokeDasharray={`${arc} 999`} transform="rotate(135)" /><circle r={gaugeR} className="g-fill" strokeDasharray={`${arc * fill} 999`} transform="rotate(135)" /></svg>
            <div><strong>{Math.abs(hud.speed)}</strong><small>KM/H</small><b>{hud.gear < 0 ? 'R' : hud.speed === 0 ? 'N' : hud.gear}</b><i className={`rpm ${hud.rpm > .9 ? 'red' : ''}`}><em style={{ width: `${Math.min(100, hud.rpm * 100)}%` }} /></i></div>
          </div>
          </div>
  )

  return <div className={`game-app screen-${screen}`}>
    <canvas className="world-canvas" ref={canvas} aria-label="3D Nigerian city racing game" />
    <div className="vignette" />
    {hud.boost && screen === 'drive' && <div className="nitro-fx" key={nitroFx} aria-hidden="true" />}
    {whip && <div className={`whip ${whip.side}`} key={whip.key} aria-hidden="true" onAnimationEnd={() => setWhip(null)} />}
    {hud.rain && screen === 'drive' && <div className="rain-screen" aria-hidden="true">{DROPS.map(([l, t, s, d], i) => <i key={i} style={{ left: `${l}%`, top: `${t * .6}%`, width: s * .3, height: s * .36, animationDelay: `${d * 2.5 + i * .37}s` }} />)}</div>}

    {['drive', 'paused'].includes(screen) && <div className="hud">
      <div className="hud-top">
        <div className="hud-left">
          {!touch && <div className="street-sign"><strong>{road}</strong><span>{area} · {CITIES[city].code}</span></div>}
          {touch && hud.race && <div className={`pos-badge ${hud.race.place === 1 ? 'first' : ''}`}>{ORDINAL[hud.race.place - 1]}<small>/{hud.race.of}</small></div>}
          {touch && wantedStars}
          {touch && recklessChip}
          {!touch && hud.race?.standings && screen === 'drive' && <ol className="live-standings">{hud.race.standings.map(e => <li key={e.name} className={e.me ? 'me' : ''}><b>{e.pos}</b><i style={{ background: e.color }} /><span>{e.name}</span><em>{e.gap === null ? '' : `${e.gap > 0 ? '+' : ''}${e.gap}m`}</em></li>)}</ol>}
        </div>
        <div className="hud-center">
          {!touch && wantedStars}
          {hud.race && !touch && <div className="race-card">
            <div className="race-head"><b className={hud.race.place === 1 ? 'first' : 'second'}>{ORDINAL[hud.race.place - 1]}<small>/{hud.race.of}</small></b><span className={hud.race.lap === hud.race.laps && hud.race.laps > 1 ? 'final' : ''}>{hud.race.laps > 1 ? (hud.race.lap === hud.race.laps ? 'FINAL LAP' : `LAP ${hud.race.lap}/${hud.race.laps}`) : hud.race.label}</span><em>{hud.race.time}s</em></div>
            <div className="race-track">{hud.race.rivals.map(r => <i key={r.id} className="them" style={{ left: `${r.at * 100}%`, background: r.color }} />)}<i className="me" style={{ left: `${hud.race.me * 100}%` }} /><span>🏁</span></div>
            <small>{(hud.race.toGo / 1000).toFixed(1)} km TO FINISH{hud.race.gap !== null && `  ·  ${hud.race.gap >= 0 ? '+' : ''}${hud.race.gap} m`}</small>
          </div>}
          {/* [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
          {hud.junction && !hud.race && <div className="chip junction"><span>↰ {crossName} ↱</span><small>JUNCTION {hud.junction.d} m · KEEP LEFT OR RIGHT + STEER IN{Math.abs(hud.speed) > TURN_SPEED ? ` · SLOW BELOW ${TURN_SPEED}` : ''}</small></div>} */}
          {!touch && recklessChip}
          {hud.arrest > 0 && !hud.arrested && <div className="chip arrest"><span>OLOKPA DON REACH YOU! DRIVE OFF!</span><i style={{ width: `${hud.arrest * 100}%` }} /></div>}
          {hud.wanted > 0 && hud.policePhase === 'pursuit' && <div className="chip pursuit">{hud.escape > 0 ? `LOSING THEM… ${Math.max(0, Math.ceil(6 - hud.escape))}` : `${hud.units > 1 ? `${hud.units} UNITS · ` : ''}POLICE ${hud.policeDistance} m`}</div>}
        </div>
        {touch
          ? <div className="hud-right mobile"><div className="mobile-stats">{coins}{meters}</div><div className="mobile-buttons">{weatherButton}{timeButton}<button className="round-btn" aria-label="Fullscreen" onClick={fullscreen}>⛶</button><button className="round-btn" aria-label="Pause" onClick={() => setScreen('paused')}>❚❚</button></div></div>
          : <div className="hud-right">{coins}{weatherButton}{timeButton}<button className="round-btn fs-btn" aria-label="Fullscreen" title="Fullscreen" onClick={fullscreen}>⛶</button><button className="round-btn" aria-label="Pause" onClick={() => setScreen('paused')}>❚❚</button></div>}
      </div>
      {screen === 'drive' && hud.countdown && <div className={`countdown ${hud.countdown === 'GO!' ? 'go' : ''}`} key={hud.countdown}>{hud.countdown}</div>}
      {toast && !hud.countdown && <div className="toast" key={toast.at}>{toast.text}</div>}
      {musicOn && track && <div className="radio" key={track.at} onClick={() => audio.current?.nextTrack()}><i>📻</i><span><small>{track.station} · NOW PLAYING</small><b>{track.name}</b> — {track.artist}</span></div>}
      <div className="chat">{chat.map(c => <div key={c.key}><b>{c.who}:</b> “{c.text}”</div>)}</div>
      <div className="hud-bottom">
        {!touch && <div className="minimap" aria-label="Minimap">
          <svg viewBox="-50 -50 100 100">
            <circle r="48" className="mm-bg" /><path d="M-24-50V50M24-50V50" className="mm-road" /><path d="M0-50V50" className="mm-lane" />
            {hud.blips.map((b, i) => <circle key={i} cx={Math.max(-44, Math.min(44, b.x * 20))} cy={Math.max(-44, Math.min(44, -b.z * .5))} r={b.police ? 5 : b.color ? 4.2 : 2.6} style={b.color ? { fill: b.color, stroke: '#10161a', strokeWidth: 1.2 } : undefined} className={b.police ? 'mm-police' : 'mm-car'} />)}
            <path d="M0-7 5 6 0 3-5 6Z" className="mm-me" />
          </svg>
          {connected && <span className="online">● {peers.length + 1} ONLINE</span>}
        </div>}
        {showControls && <div className="key-hints"><kbd>W A S D</kbd> drive <kbd>SPACE</kbd> brake <kbd>H</kbd> horn <kbd>N</kbd> nitro <kbd>T</kbd> day/night <kbd>R</kbd> weather <kbd>M</kbd> radio <kbd>ESC</kbd> pause</div>}
        {!touch && meters}
      </div>
    </div>}

    {screen === 'drive' && <div className="touch">
      <div className="steer"><button aria-label="Steer left" {...hold('a')}>◀</button><button aria-label="Steer right" {...hold('d')}>▶</button></div>
      <div className="pedals"><div className="pedal-col"><button className="horn" aria-label="Horn" {...hold('h')}>📯</button><button className="brake" aria-label="Brake and reverse" {...hold('s')}>BRAKE</button></div><div className="pedal-col"><button className={`nos ${hud.nitro ? 'ready' : ''} ${hud.boost ? 'burning' : ''}`} aria-label={`Nitro boost, ${hud.nitro} left`} onPointerDown={() => { keys.current.nTap = true }}>PEPSI<b>{hud.nitro}</b></button><button className="gas" aria-label="Accelerate" {...hold('w')}>GAS</button></div></div>
    </div>}

    {screen === 'drive' && briefing && <div className="briefing" role="dialog" aria-label="Power-ups">
      <div className="brief-card">
        <small>BEFORE YOU RACE</small>
        <h2>POWER-UPS ON THE ROAD</h2>
        <div className="brief-items">
          <div className="brief-item pepsi"><div className="brief-icon">{PEPSI_ICON}</div><div><b>PEPSI = NITRO</b><p>Drive through Pepsi bottles to collect them (carry up to {NOS_MAX}). Press <kbd>N</kbd> or <kbd>SHIFT</kbd>, or tap the <em>PEPSI</em> button, for {NOS_TIME} seconds of nitro: up to {NOS_BOOST} km/h past your top speed, and cars in your way get shoved aside.</p></div></div>
          <div className="brief-item gala"><div className="brief-icon">{GALA_ICON}</div><div><b>BEEF GALA = REPAIR</b><p>Drive through a Gala pack to fix up to {GALA_HEAL} damage and clear the engine smoke. Grab one when your DAMAGE bar is high.</p></div></div>
        </div>
        <button className="play small" onClick={startCountdown}>START RACE ›</button>
        <label className="brief-skip"><input type="checkbox" checked={skipBriefing} onChange={e => setSkipBriefing(e.target.checked)} /> Don't show this before every race</label>
      </div>
    </div>}

    {screen === 'title' && <div className="title-screen">
      <div className="top-bar">
        <button className="profile" onClick={() => setScreen('driver')}><span className="avatar" style={{ background: profile.color }}>{profile.avatar}</span><span>{profile.name}<small>TAP TO EDIT</small></span></button>
        <div className="top-right">{coins}{weatherButton}{timeButton}<button className="round-btn" aria-label="Settings" onClick={() => setScreen('settings')}>⚙</button><button className="round-btn" aria-label="Fullscreen" onClick={fullscreen}>⛶</button></div>
      </div>
      <div className="logo"><span>NAIJA RUSH</span><small>STREET RACING · LAGOS &amp; ABUJA</small></div>
      <div className="title-bottom">
        <div className="cities">{Object.entries(CITIES).map(([name, c]) => <button key={name} className={city === name ? 'on' : ''} onClick={() => changeCity(name)}><small>{c.tag}</small><strong>{name}</strong><span>{c.blurb}</span></button>)}</div>
        <button className="play" disabled={!warm} onClick={drive}>{warm ? 'RACE!' : 'WARMING UP…'}</button>
        <div className="title-actions"><button className="tile" onClick={() => setScreen('garage')}><i>🚗</i>GARAGE</button><button className="tile" onClick={() => setScreen('driver')}><i>🪪</i>DRIVER</button><button className="tile" onClick={() => setScreen('settings')}><i>⚙</i>SETTINGS</button></div>
      </div>
    </div>}

    {screen === 'garage' && <div className="garage">
      <div className="top-bar">{back}<h2>GARAGE</h2>{coins}</div>
      <div className="carousel">
        <button className="arrow" aria-label="Previous car" onClick={() => cycleCar(-1)}>‹</button>
        <div className="car-name"><small>{shownCar.year} · {shownCar.tag}</small><strong>{shownCar.name}</strong>{lockTag}</div>
        <button className="arrow" aria-label="Next car" onClick={() => cycleCar(1)}>›</button>
      </div>
      <div className="garage-panel">
        <div className="stats">{[['TOP SPEED', shownCar.speed + profile.upgrades[0] * 10, 300], ['ACCELERATION', shownCar.acceleration + profile.upgrades[1] * 8, 95], ['HANDLING', shownCar.handling + profile.upgrades[2] * 8, 120]].map(([n, v, m]) => <div key={n}><span>{n}<b>{v}</b></span><i><em style={{ width: `${v / m * 100}%` }} /></i></div>)}</div>
        <div className="paint">{colors.map(c => <button key={c} aria-label={'Paint ' + c} className={profile.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setProfile(p => ({ ...p, color: c }))} />)}</div>
        <div className="upgrades">{['ENGINE', 'TURBO', 'GRIP'].map((m, i) => <button key={m} disabled={profile.upgrades[i] >= 5 || profile.points < UPGRADE_PRICES[profile.upgrades[i]]} onClick={() => upgrade(i)}><strong>{m}</strong><span className="pips">{[0, 1, 2, 3, 4].map(l => <i key={l} className={l < profile.upgrades[i] ? 'on' : ''} />)}</span><b>{profile.upgrades[i] >= 5 ? 'MAX' : `${UPGRADE_PRICES[profile.upgrades[i]].toLocaleString()} RP`}</b></button>)}</div>
        {shopButton || <button className="play small" disabled={!warm} onClick={drive}>{warm ? 'RACE!' : 'WARMING UP…'}</button>}
      </div>
    </div>}

    {screen === 'onboard-name' && <div className="sheet-wrap onboard"><div className="sheet">
      <div className="onboard-head"><small>STEP 1 OF 2</small><h2>WELCOME TO NAIJA RUSH</h2><p>Wetin we go dey call you for road?</p></div>
      <label className="field">STREET NAME<input autoFocus maxLength="20" placeholder="Type your name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && nameOk) setScreen('onboard-car') }} /></label>
      <div className="name-ideas">{NAME_IDEAS.slice(0, 6).map(n => <button key={n} className={profile.name === n ? 'on' : ''} onClick={() => setProfile(p => ({ ...p, name: n }))}>{n}</button>)}<button aria-label="Random name" onClick={randomName}>🎲</button></div>
      <div className="avatars">{['01', '02', '03', '04', '05', '06'].map(a => <button key={a} className={profile.avatar === a ? 'on' : ''} style={{ background: profile.color }} onClick={() => setProfile(p => ({ ...p, avatar: a }))}>{a}</button>)}</div>
      <button className="play small" disabled={!nameOk} onClick={() => setScreen('onboard-car')}>{nameOk ? 'NEXT: PICK YOUR RIDE ›' : 'ENTER A NAME (2+ LETTERS)'}</button>
    </div></div>}

    {screen === 'onboard-car' && <div className="garage onboard-car">
      <div className="top-bar"><button className="round-btn back" aria-label="Back" onClick={() => setScreen('onboard-name')}>‹</button><h2><small>STEP 2 OF 2</small>PICK YOUR RIDE</h2><span className="car-count">{shown + 1}/{CARS.length}</span></div>
      <div className="carousel">
        <button className="arrow" aria-label="Previous car" onClick={() => cycleCar(-1)}>‹</button>
        <div className="car-name"><small>{shownCar.year} · {shownCar.tag}</small><strong>{shownCar.name}</strong><em>{shownCar.engine.label}</em>{lockTag}</div>
        <button className="arrow" aria-label="Next car" onClick={() => cycleCar(1)}>›</button>
      </div>
      <div className="garage-panel">
        <div className="stats">{[['TOP SPEED', shownCar.speed, 300], ['ACCELERATION', shownCar.acceleration, 95], ['HANDLING', shownCar.handling, 120]].map(([n, v, m]) => <div key={n}><span>{n}<b>{v}</b></span><i><em style={{ width: `${v / m * 100}%` }} /></i></div>)}</div>
        <div className="paint">{colors.map(c => <button key={c} aria-label={'Paint ' + c} className={profile.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setProfile(p => ({ ...p, color: c }))} />)}</div>
        <button className="play small" disabled={!warm || !shownOwned} onClick={finishOnboarding}>{shownOwned ? `LET'S GO, ${profile.name.trim().toUpperCase()}!` : `🔒 ${shownCar.price.toLocaleString()} RP · PICK A FREE CAR`}</button>
      </div>
    </div>}

    {screen === 'driver' && <div className="sheet-wrap"><div className="sheet">
      <div className="sheet-head">{back}<h2>YOUR DRIVER</h2></div>
      <div className="avatars">{['01', '02', '03', '04', '05', '06'].map(a => <button key={a} className={profile.avatar === a ? 'on' : ''} style={{ background: profile.color }} onClick={() => setProfile(p => ({ ...p, avatar: a }))}>{a}</button>)}</div>
      <label className="field">STREET NAME<input maxLength="20" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></label>
      {peers.length > 0 && <div className="peers">{peers.map(p => <div key={p.id}>{p.name}<small>{p.car}</small></div>)}</div>}
      <button className="play small" disabled={!warm} onClick={drive}>{warm ? 'RACE!' : 'WARMING UP…'}</button>
    </div></div>}

    {screen === 'settings' && <div className="sheet-wrap"><div className="sheet">
      <div className="sheet-head">{back}<h2>SETTINGS</h2></div>
      {sliders}
      <div className="toggles">
        <button className={quality === 'high' ? 'on' : ''} onClick={() => setQuality(q => q === 'high' ? 'low' : 'high')}><span>GRAPHICS</span><b>{quality === 'high' ? 'HIGH' : 'FAST'}</b></button>
        <button className={sound ? 'on' : ''} onClick={() => setSound(s => !s)}><span>SOUND</span><b>{sound ? 'ON' : 'OFF'}</b></button>
        <button className={musicOn ? 'on' : ''} onClick={() => setMusicOn(m => !m)}><span>MUSIC · EKO FM</span><b>{musicOn ? 'ON' : 'OFF'}</b></button>
        <button onClick={() => audio.current?.nextTrack()}><span>NEXT SONG</span><b>⏭</b></button>
        <button className="on" onClick={cycleTime}><span>TIME OF DAY</span><b>{TIME_MODES[timeMode]}</b></button>
        <button className="on" onClick={cycleWeather}><span>WEATHER</span><b>{WEATHER[weather]}</b></button>
        <button className={showControls ? 'on' : ''} onClick={() => setShowControls(s => !s)}><span>KEY HINTS</span><b>{showControls ? 'ON' : 'OFF'}</b></button>
        <button onClick={fullscreen}><span>FULLSCREEN</span><b>⛶</b></button>
      </div>
      <div className="controls-list"><kbd>W / ↑</kbd>Gas<kbd>S / ↓</kbd>Brake · reverse<kbd>A D / ← →</kbd>Steer<kbd>SPACE</kbd>Brake<kbd>H</kbd>Horn: traffic clears the lane<kbd>N / SHIFT</kbd>Pepsi boost: pick up Pepsi bottles on the road · Beef Gala repairs your car<kbd>T</kbd>Time of day<kbd>R</kbd>Weather: sunny / rainy<kbd>M</kbd>Next song on the radio<kbd>ESC</kbd>Pause</div>
    </div></div>}

    {screen === 'paused' && <div className="sheet-wrap"><div className="sheet pause">
      <h2>PAUSED</h2>
      <button className="play small" onClick={drive}>RESUME</button>
      {sliders}
      <div className="pause-grid"><button className="tile" onClick={restart}><i>↻</i>NEW RACE</button><button className="tile" onClick={fullscreen}><i>⛶</i>FULLSCREEN</button><button className="tile" onClick={() => setScreen('garage')}><i>🚗</i>GARAGE</button><button className="tile" onClick={() => setScreen('settings')}><i>⚙</i>SETTINGS</button><button className="tile" onClick={quit}><i>⌂</i>MENU</button></div>
    </div></div>}

    {screen === 'results' && hud.results && (() => {
      const r = hud.results, title = r.place === 1 ? 'YOU WIN THE RUSH!' : r.place <= 3 ? 'PODIUM FINISH!' : 'RACE COMPLETED'
      return <div className={`results place-${r.place}`}>
        {r.place === 1 && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 6) * .18}s`, '--c': ['#ffc61a', '#1fa34a', '#ee3b2b', '#fffdf5'][i % 4] }} />)}</div>}
        <div className="results-card">
          <div className="badge-wrap"><div className="rays" /><div className="badge"><b>{r.place}</b><small>{ORDINAL[r.place - 1].slice(1)}</small></div></div>
          <div className="ribbon"><span>{title}</span></div>
          <div className="reward"><i>₦</i><b>+<CountUp to={r.prize} /></b><small>RP</small></div>
          <ol className="standings">{r.order.map(e => <li key={e.id} className={e.me ? 'me' : ''} style={{ '--i': e.pos }}><b>{e.pos}</b><span>{e.me ? profile.name || 'YOU' : e.name}<small>{e.me ? car.name : e.car}</small></span><em>{e.time !== null ? `${e.time.toFixed(1)}s` : `+${e.gap} m`}</em></li>)}</ol>
          <button className="play small" onClick={restart}>NEW RACE ›</button>
          <div className="results-actions"><button className="tile" onClick={() => { quit(); setScreen('garage') }}><i>🚗</i>GARAGE</button><button className="tile" onClick={quit}><i>⌂</i>MENU</button></div>
        </div>
      </div>
    })()}
    {screen === 'wrecked' && <div className="busted wrecked">
      <div className="stamp">WRECKED!</div>
      <p>“Your motor don burn finish. Call mechanic.”</p><b>−150 RP</b>
      <div className="busted-actions"><button className="play small" onClick={restart}>TRY AGAIN</button><button className="tile" onClick={() => { quit(); setScreen('garage') }}><i>🚗</i>GARAGE</button></div>
    </div>}
    {screen === 'busted' && <div className="busted">
      <div className="stamp">BUSTED!</div>
      <p>“Oga, follow us go station.”</p><b>−100 RP</b>
      <div className="busted-actions"><button className="play small" onClick={restart}>TRY AGAIN</button><button className="tile" onClick={() => { quit(); setScreen('garage') }}><i>🚗</i>GARAGE</button></div>
    </div>}

    {renderError && <div role="alert" className="render-error">{renderError}<button onClick={() => setRenderError('')}>OK</button></div>}
  </div>
}
