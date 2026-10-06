// Ephemeral, single-server guest multiplayer. No device location is collected.
import { createStats, givenToken } from './stats.js'
export function createWorld({ statsFile = null, tokenFile = null, token, initial = null, persist = null } = {}) {
  const players = new Map(), clients = new Map(), bumps = new Map()
  // Admin statistics. Each driver ID maps to an anonymous device ID; kept a little after disconnect so a
  // last event (busted, wrecked) sent as the drive ends still counts.
  const stats = createStats({ file: statsFile, tokenFile, token, initial, persist }), deviceOf = new Map(), eventTimes = new Map()
  const send = (res, events = []) => res.write(`data: ${JSON.stringify({ players: [...players.values()], events })}\n\n`)
  const timer = setInterval(() => {
    for (const [id,p] of players) if (Date.now() - p.updated > 5000) players.delete(id)
    for (const [key,b] of bumps) if (Date.now() - b.time > 60000) bumps.delete(key)
    for (const [id,d] of deviceOf) if (!clients.has(id) && Date.now() - d.left > 120000) deviceOf.delete(id)
    for (const res of clients.values()) send(res)
  }, 100)
  timer.unref()
  async function middleware(req,res,next) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()
    const reply = (status,body) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body)) }
    if (url.pathname === '/api/admin/stats' && req.method === 'GET') return stats.authorized(req) ? reply(200, stats.snapshot()) : reply(401, { error: givenToken(req) ? 'wrong' : 'missing' })
    if (url.pathname === '/api/world' && req.method === 'GET') {
      const id = url.searchParams.get('id')
      if (!id || !/^[\w-]{1,64}$/.test(id)) return reply(400,{error:'Invalid driver ID'})
      if (clients.size >= 100 && !clients.has(id)) return reply(503,{error:'Server full'})
      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'})
      const device = /^[\w-]{1,64}$/.test(url.searchParams.get('device') || '') ? url.searchParams.get('device') : id
      clients.get(id)?.end(); clients.set(id,res);send(res)
      deviceOf.set(id, { device, left: 0 }); stats.connect(device)
      req.on('close',()=>{if(clients.get(id)===res){clients.delete(id);players.delete(id)};stats.disconnect(device);const d=deviceOf.get(id);if(d)d.left=Date.now()})
      return
    }
    if(req.method !== 'POST') return reply(404,{error:'Not found'})
    let body=''
    try {
      for await(const chunk of req){body+=chunk;if(body.length>4096)return reply(413,{error:'Payload too large'})}
      const p=JSON.parse(body)
      // Game events for the admin panel (accepted shortly after a drive ends, rate-limited).
      if(url.pathname==='/api/stat') {
        const d=deviceOf.get(p.id); if(!d)return reply(403,{error:'Connect to the world first'})
        const times=(eventTimes.get(p.id)||[]).filter(t=>Date.now()-t<60000); if(times.length>=30)return reply(429,{error:'Slow down'})
        times.push(Date.now()); eventTimes.set(p.id,times)
        return stats.event(d.device,String(p.type))?reply(200,{ok:true}):reply(400,{error:'Unknown event'})
      }
      if(!clients.has(p.id))return reply(403,{error:'Connect to the world first'})
      if(url.pathname==='/api/position') {
        if(!['Lagos','Abuja'].includes(p.city)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Number.isFinite(p.speed))return reply(400,{error:'Invalid position'})
        const player={id:p.id,city:p.city,name:String(p.name||'Guest').slice(0,20),car:String(p.car||'Classic').slice(0,30),color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#d3f35d',x:Math.max(-1.3,Math.min(1.3,p.x)),z:p.z,speed:Math.max(-28,Math.min(355,p.speed)),updated:Date.now()}
        players.set(p.id,player); const d=deviceOf.get(p.id); if(d)stats.seen(d.device,player)
        for(const [key,contact] of bumps){if(!key.split(':').includes(p.id))continue;const [a,b]=key.split(':').map(id=>players.get(id));if(a&&b&&(Math.abs(a.z-b.z)>7||Math.abs(a.x-b.x)>.48))contact.armed=true}
        return reply(200,{ok:true})
      }
      if(url.pathname==='/api/bump') {
        const a=players.get(p.id),b=players.get(p.target)
        if(!a||!b||a.id===b.id||a.city!==b.city||Math.abs(a.z-b.z)>7||Math.abs(a.x-b.x)>.3)return reply(400,{error:'Drivers are not in contact'})
        const key=[a.id,b.id].sort().join(':'), previous=bumps.get(key)||{count:0,time:0,armed:true}
        if(!previous.armed||Date.now()-previous.time<800)return reply(429,{error:'Separate before bumping again'})
        const count=previous.count+1;bumps.set(key,{count,time:Date.now(),armed:false})
        for(const driver of [a,b])if(clients.has(driver.id))send(clients.get(driver.id),[{type:'impact'}])
        if(count%2===0){if(clients.has(a.id))send(clients.get(a.id),[{type:'race',from:b.id}]);if(clients.has(b.id))send(clients.get(b.id),[{type:'race',from:a.id}])}
        return reply(200,{ok:true,count})
      }
      return reply(404,{error:'Not found'})
    } catch { if(!res.headersSent)reply(400,{error:'Invalid request'}) }
  }
  return { middleware, stats, close(){clearInterval(timer);const saved=stats.close();for(const res of clients.values())res.end();clients.clear();players.clear();return saved} }
}
