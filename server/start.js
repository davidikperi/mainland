import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { createWorld } from './world.js'
const root=resolve('dist'),world=createWorld({statsFile:'data/stats.json',tokenFile:'data/admin-token'})
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
server.listen(Number(globalThis.process.env.PORT)||3000,'0.0.0.0',()=>console.log('Mainland is ready on port '+(globalThis.process.env.PORT||3000)+'\nAdmin panel: /admin  token: '+world.stats.token))
