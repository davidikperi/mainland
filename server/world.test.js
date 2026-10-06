import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWorld } from './world.js'
import { createStats } from './stats.js'
test('shared positions, contact checks, double-bump races and disconnect cleanup',async()=>{
  const world=createWorld(),server=createServer((req,res)=>world.middleware(req,res,()=>{res.writeHead(404);res.end()}))
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base=`http://127.0.0.1:${server.address().port}`
  const a=new AbortController(),b=new AbortController()
  try {
    const ra=await fetch(base+'/api/world?id=alpha',{signal:a.signal}),rb=await fetch(base+'/api/world?id=beta',{signal:b.signal})
    assert.equal(ra.status,200);assert.equal(rb.status,200)
    const reader=ra.body.getReader(),readerB=rb.body.getReader(),decoder=new TextDecoder()
    await reader.read();await readerB.read()
    const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    assert.equal((await post('/api/position',{id:'unknown'})).status,403)
    for(const id of ['alpha','beta'])assert.equal((await post('/api/position',{id,city:'Lagos',name:id,car:'Peugeot 504',color:'#d3f35d',x:0,z:50,speed:60})).status,200)
    let snapshot='';while(!(snapshot.includes('"name":"alpha"')&&snapshot.includes('"name":"beta"')))snapshot=decoder.decode((await reader.read()).value)
    assert.match(snapshot,/alpha/);assert.match(snapshot,/beta/)
    assert.equal((await post('/api/bump',{id:'alpha',target:'alpha'})).status,400)
    assert.equal((await post('/api/bump',{id:'alpha',target:'beta'})).status,200)
    assert.equal((await post('/api/bump',{id:'alpha',target:'beta'})).status,429)
    await new Promise(r=>setTimeout(r,850))
    assert.equal((await post('/api/bump',{id:'alpha',target:'beta'})).status,429)
    await post('/api/position',{id:'alpha',city:'Lagos',x:0,z:35,speed:-15})
    await post('/api/position',{id:'alpha',city:'Lagos',x:0,z:45.3,speed:25})
    assert.equal((await post('/api/bump',{id:'alpha',target:'beta'})).status,200)
    for(const r of [reader,readerB]){let data='';while(!data.includes('"type":"race"'))data=decoder.decode((await r.read()).value);assert.match(data,/race/)}
    b.abort();await new Promise(r=>setTimeout(r,200))
    let clean=false;for(let i=0;i<10;i++){const data=decoder.decode((await reader.read()).value);if(!data.includes('"id":"beta"')){clean=true;break}}assert.ok(clean)
  } finally {a.abort();b.abort();world.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})
test('admin token: whitespace and quotes around ADMIN_TOKEN are ignored',()=>{
  for(const token of ['  secret-token\n','"secret-token"',"'secret-token' "]){
    const s=createStats({token});assert.equal(s.token,'secret-token')
    assert.ok(s.authorized({headers:{authorization:'Bearer secret-token'}}));s.close()
  }
})
test('admin stats: loaded from and saved to a database store',async()=>{
  const saved=[],s=createStats({token:'t',initial:{totals:{sessions:41,runs:7,playSeconds:0,events:{}},devices:{}},persist:async d=>{saved.push(JSON.parse(JSON.stringify(d)))}})
  s.connect('dev1');assert.equal(s.snapshot().totals.sessions,42)
  await s.close();assert.equal(saved.length,1);assert.equal(saved[0].totals.sessions,42);assert.ok(saved[0].devices.dev1)
})
test('admin stats: sessions, live drivers, events and a token-protected endpoint',async()=>{
  const world=createWorld({token:'secret-token'}),server=createServer((req,res)=>world.middleware(req,res,()=>{res.writeHead(404);res.end()}))
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base=`http://127.0.0.1:${server.address().port}`,a=new AbortController()
  try {
    const ra=await fetch(base+'/api/world?id=driver1&device=phone-a',{signal:a.signal});await ra.body.getReader().read()
    const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    assert.equal((await post('/api/position',{id:'driver1',city:'Lagos',name:'Ade',car:'Honda Accord',color:'#d3f35d',x:0,z:50,speed:88})).status,200)
    assert.equal((await post('/api/stat',{id:'driver1',type:'run'})).status,200)
    assert.equal((await post('/api/stat',{id:'driver1',type:'wrecked'})).status,200)
    assert.equal((await post('/api/stat',{id:'driver1',type:'hack'})).status,400)
    assert.equal((await post('/api/stat',{id:'nobody',type:'run'})).status,403)
    assert.equal((await fetch(base+'/api/admin/stats')).status,401)
    assert.equal((await fetch(base+'/api/admin/stats',{headers:{Authorization:'Bearer wrong'}})).status,401)
    assert.equal((await (await fetch(base+'/api/admin/stats')).json()).error,'missing')
    assert.equal((await (await fetch(base+'/api/admin/stats',{headers:{Authorization:'Bearer wrong'}})).json()).error,'wrong')
    assert.equal((await fetch(base+'/api/admin/stats',{headers:{'X-Admin-Token':'secret-token'}})).status,200)
    const s=await (await fetch(base+'/api/admin/stats',{headers:{Authorization:'Bearer secret-token'}})).json()
    assert.equal(s.online,1);assert.equal(s.today.sessions,1);assert.equal(s.today.players,1);assert.equal(s.today.runs,1);assert.equal(s.today.events.wrecked,1)
    assert.equal(s.live[0].name,'Ade');assert.equal(s.live[0].car,'Honda Accord');assert.equal(s.cars['Honda Accord'],1);assert.equal(s.cities.Lagos,1)
  } finally {a.abort();world.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})
