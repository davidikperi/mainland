// Mainland admin panel: who is playing right now and how the game is being played.
// Reads /api/admin/stats with the admin token (kept for this browser tab only) and refreshes every 5 seconds.
import './admin.css'

const app = document.getElementById('admin')
const KEY = 'mainland-admin-token'
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const num = n => Number(n || 0).toLocaleString()
const ago = t => { if (!t) return '—'; const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago` }
const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
let token = (() => { try { return sessionStorage.getItem(KEY) || '' } catch { return '' } })(), timer = 0

function login(error = '') {
  clearInterval(timer)
  app.innerHTML = `<div class="login"><form>
    <h1>MAINLAND ADMIN</h1>
    <p>Enter the admin token. It is printed in the server console when the game starts (or set <code>ADMIN_TOKEN</code>).</p>
    <input type="password" name="token" placeholder="Admin token" autocomplete="current-password" autofocus />
    <div class="error">${esc(error)}</div>
    <button type="submit">OPEN DASHBOARD</button>
  </form></div>`
  app.querySelector('form').addEventListener('submit', e => { e.preventDefault(); token = new FormData(e.target).get('token').trim(); try { sessionStorage.setItem(KEY, token) } catch { /* private mode */ } load() })
}

async function load() {
  try {
    const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}`, 'X-Admin-Token': token }, cache: 'no-store' })
    if (res.status === 401) {
      try { sessionStorage.removeItem(KEY) } catch { /* private mode */ }
      const { error } = await res.json().catch(() => ({}))
      // 'missing' means a proxy in front of the server dropped the token headers; 'wrong' means this server instance has a different token.
      return login(!token ? '' : error === 'missing' ? 'The server never received the token: a proxy in front of it is stripping the headers.' : 'That token is not right for this server. Use the token from the latest start-up log, or set ADMIN_TOKEN.')
    }
    render(await res.json(), true)
  } catch { render(null, false) }
  clearTimeout(timer); timer = setTimeout(load, 5000)
}

let last = null
function render(s, ok) {
  if (!s) { s = last; if (!s) return app.innerHTML = '<div class="wrap"><p class="empty">Cannot reach the game server. Retrying…</p></div>' }
  last = s
  const ev = s.today.events || {}, tev = s.totals.events || {}
  const kpi = (label, value, note = '', cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${value}</b><em>${note}</em></div>`
  const bars = obj => { const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); const max = rows[0]?.[1] || 1; return rows.length ? `<div class="bars">${rows.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i><em style="width:${(v / max * 100).toFixed(1)}%"></em></i><b>${num(v)}</b></div>`).join('')}</div>` : '<p class="empty">No data yet</p>' }
  const outcome = (label, today, total) => `<div class="outcome"><small>${label}</small><b>${num(today)}</b><em>${num(total)} all time</em></div>`
  app.innerHTML = `<div class="wrap">
    <header>
      <div class="brand"><h1>MAINLAND</h1><span>Admin · player activity</span></div>
      <div class="status"><i class="dot ${ok ? '' : 'off'}"></i>${ok ? `Live · updated ${clock(s.now)}` : 'Connection lost · retrying'}<button class="ghost" id="signout">Sign out</button></div>
    </header>
    <section class="kpis">
      ${kpi('Playing now', num(s.online), 'drivers on the road', 'live')}
      ${kpi('Peak today', num(s.peakToday), `all-time peak ${num(s.peak.count)}${s.peak.at ? ` · ${new Date(s.peak.at).toLocaleDateString()}` : ''}`, 'peak')}
      ${kpi('Players today', num(s.today.players), `${num(s.totals.players)} all time`)}
      ${kpi('Sessions today', num(s.today.sessions), `${num(s.totals.sessions)} all time`)}
      ${kpi('Avg session', `${s.today.avgSessionMinutes}<em> min</em>`, `${num(s.today.playMinutes)} min played today`)}
      ${kpi('Drives started', num(s.today.runs), `${num(s.totals.runs)} all time · ${s.totals.playHours} h played`)}
    </section>
    <section class="grid">
      <div class="panel span-8"><h2>Players online · last 24 hours <span>${s.timeline.length ? `${s.timeline.length} samples` : 'samples every minute'}</span></h2>${timeline(s.timeline)}</div>
      <div class="panel span-4"><h2>Game outcomes · today</h2><div class="outcomes">
        ${outcome('Races won', ev.raceWon, tev.raceWon)}${outcome('Races lost', ev.raceLost, tev.raceLost)}
        ${outcome('Busted', ev.busted, tev.busted)}${outcome('Wrecked', ev.wrecked, tev.wrecked)}
        ${outcome('Rage wins', ev.rageWon, tev.rageWon)}${outcome('Pepsi used', ev.nitro, tev.nitro)}${outcome('Gala eaten', ev.gala, tev.gala)}
      </div></div>
      <div class="panel span-6"><h2>Daily players · last 14 days</h2>${days(s.days)}</div>
      <div class="panel span-6"><h2>Popular cars <span>sessions, last 30 days</span></h2>${bars(s.cars)}</div>
      <div class="panel span-4"><h2>Cities</h2>${bars(s.cities)}</div>
      <div class="panel span-8"><h2>On the road now <span>${num(s.live.length)} driving</span></h2>${s.live.length ? `<div class="table-wrap"><table><thead><tr><th>Driver</th><th>City</th><th>Car</th><th>Speed</th><th>Session</th></tr></thead><tbody>${s.live.map(p => `<tr><td class="name">${esc(p.name)}</td><td>${esc(p.city || '—')}</td><td>${esc(p.car || '—')}</td><td>${num(p.speed)} km/h</td><td><span class="pill">${p.minutes} min</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nobody is driving right now.</p>'}</div>
      <div class="panel span-12"><h2>Recent players</h2>${s.recent.length ? `<div class="table-wrap"><table><thead><tr><th>Driver</th><th>Sessions</th><th>Time played</th><th>Last seen</th></tr></thead><tbody>${s.recent.map(p => `<tr><td class="name">${esc(p.name)}</td><td>${num(p.sessions)}</td><td>${num(p.minutes)} min</td><td>${ago(p.last)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No players yet.</p>'}</div>
    </section>
  </div>`
  app.querySelector('#signout').addEventListener('click', () => { token = ''; try { sessionStorage.removeItem(KEY) } catch { /* private mode */ } login() })
}

// Line chart of players online, one sample a minute over the last day.
function timeline(points) {
  if (points.length < 2) return '<p class="empty">The chart fills in as the server runs (one sample per minute).</p>'
  const W = 800, H = 200, pad = 22, t0 = points[0][0], t1 = points.at(-1)[0], max = Math.max(2, ...points.map(p => p[1]))
  const x = t => pad + (t - t0) / Math.max(1, t1 - t0) * (W - pad * 2), y = n => H - pad - n / max * (H - pad * 2)
  const path = points.map(([t, n], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(n).toFixed(1)}`).join('')
  const ticks = [0, Math.round(max / 2), max]
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Players online over the last 24 hours">
    ${ticks.map(n => `<line class="grid-line" x1="${pad}" x2="${W - pad}" y1="${y(n)}" y2="${y(n)}"/><text x="2" y="${y(n) + 4}">${n}</text>`).join('')}
    <path class="area" d="${path}L${x(t1)},${H - pad}L${x(t0)},${H - pad}Z"/><path class="line" d="${path}"/>
    <text x="${pad}" y="${H - 4}">${clock(t0)}</text><text x="${W - pad}" y="${H - 4}" text-anchor="end">${clock(t1)}</text>
  </svg>`
}
function days(list) {
  if (!list.length) return '<p class="empty">No days recorded yet.</p>'
  const max = Math.max(1, ...list.map(d => d.players))
  return `<div class="days">${list.map(d => `<div class="day" title="${d.day}: ${d.players} players, ${d.sessions} sessions, ${d.playMinutes} min"><div data-v="${d.players}" style="height:${(d.players / max * 100).toFixed(1)}%"></div><span>${d.day.slice(5)}</span></div>`).join('')}</div>`
}

token ? load() : login()
