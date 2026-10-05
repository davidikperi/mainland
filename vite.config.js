import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createWorld } from './server/world.js'

// Multiplayer world + admin stats on the dev and preview servers. Stats persist in data/; the admin token
// comes from ADMIN_TOKEN or is generated once into data/admin-token and printed on startup.
function mainlandWorld(server) {
  const world = createWorld({ statsFile: 'data/stats.json', tokenFile: 'data/admin-token' })
  server.middlewares.use((req, res, next) => { if (req.url === '/admin' || req.url === '/admin/') req.url = '/admin.html'; next() })
  server.middlewares.use(world.middleware)
  server.httpServer?.on('close', world.close)
  server.httpServer?.once('listening', () => { const a = server.httpServer.address(); console.log(`\n  Admin panel: http://localhost:${a?.port}/admin  ·  token: ${world.stats.token}\n`) })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), { name: 'mainland-world', configureServer: mainlandWorld, configurePreviewServer: mainlandWorld }],
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
})
