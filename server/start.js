import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import { createWorld } from './world.js'
import { openStore } from './store.js'
const env=globalThis.process.env
// Stats go to the DATABASE_URL Postgres database when set, else DATA_DIR/stats.json. The generated admin token lives in DATA_DIR.
// Hosts that wipe the app folder on each deploy or restart (Render, Railway, Heroku) need DATABASE_URL, or DATA_DIR on a persistent disk.
const dataDir=env.DATA_DIR||'data'
const store=await openStore({databaseUrl:env.DATABASE_URL,file:join(dataDir,'stats.json')})
const root=resolve('dist'),world=createWorld({tokenFile:join(dataDir,'admin-token'),...store})
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}
const server=createServer((req,res)=>world.middleware(req,res,async()=>{
  try {
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/admin'||path==='/admin/')path='/admin.html'
    const file=resolve(root,`.${path==='/'?'/index.html':path}`)
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data)
  }catch{res.writeHead(404);res.end('Not found')}
}))
server.on('close',world.close)
// Hosts stop the old server with SIGTERM on every deploy: save the stats first (they are otherwise written once a minute).
let stopping=false
for(const signal of['SIGTERM','SIGINT'])globalThis.process.on(signal,async()=>{
  if(stopping)return;stopping=true
  setTimeout(()=>globalThis.process.exit(0),10e3).unref()   // don't hang the deploy if the database is slow
  await world.close();await store.end();globalThis.process.exit(0)
})
server.listen(Number(env.PORT)||3000,'0.0.0.0',()=>{
  console.log('Mainland is ready on port '+(env.PORT||3000)+'\nAdmin panel: /admin  token: '+world.stats.token+'\nStats storage: '+store.label)
  if(!env.ADMIN_TOKEN)console.warn('WARNING: ADMIN_TOKEN is not set. The admin token above is random, and it changes whenever '+dataDir+'/ is wiped (every deploy or restart on Render and similar hosts), which signs you out of /admin. Set ADMIN_TOKEN to keep it fixed.')
  if(!env.DATABASE_URL&&!env.DATA_DIR&&(env.RENDER||env.RAILWAY_ENVIRONMENT||env.DYNO))console.warn('WARNING: DATABASE_URL is not set, so admin stats are kept in the app folder and are lost on every deploy or restart. Set DATABASE_URL to a Postgres database (e.g. Neon), or mount a persistent disk and set DATA_DIR to its path.')
})
