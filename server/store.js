// Where admin stats are kept between restarts. With DATABASE_URL (Postgres, e.g. Neon) they live in the database,
// so deploys and restarts on hosts that wipe the app folder (Render, Railway) keep them. Otherwise a local JSON file.
import pg from 'pg'

const ROW = 'stats'

export async function openStore({ databaseUrl, file, log = console }) {
  if (!databaseUrl) return { statsFile: file, label: `file ${file}`, end: async () => {} }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, idleTimeoutMillis: 30e3, connectionTimeoutMillis: 15e3 })
  pool.on('error', err => log.error('Stats database connection error:', err.message))   // idle client dropped by the server: the pool reconnects
  // Neon suspends idle databases; the first query wakes it, so give it a few tries.
  let initial
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS mainland_stats (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
      initial = (await pool.query('SELECT data FROM mainland_stats WHERE id = $1', [ROW])).rows[0]?.data ?? null
      break
    } catch (err) {
      if (attempt === 5) {
        // Never save over the stored stats with an empty set: keep this run in memory only.
        log.error(`Could not load stats from the database (${err.message}). Stats for this run are kept in memory only and NOT saved.`)
        await pool.end().catch(() => {})
        return { label: 'memory only (database unreachable)', end: async () => {} }
      }
      await new Promise(r => setTimeout(r, attempt * 2000))
    }
  }
  let saving = Promise.resolve()
  // Saves run one at a time, in order. Serialise now so later changes don't leak into this snapshot.
  const persist = data => {
    const json = JSON.stringify(data)
    saving = saving.then(() => pool.query('INSERT INTO mainland_stats (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [ROW, json]))
      .catch(err => log.error('Could not save stats to the database:', err.message))
    return saving
  }
  return { initial, persist, label: initial ? 'database (loaded saved stats)' : 'database (no saved stats yet)', end: () => saving.then(() => pool.end()).catch(() => {}) }
}
