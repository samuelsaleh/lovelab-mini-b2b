import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'anthropic-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type',
              })
              return res.end()
            }
            if (req.method !== 'POST') {
              res.writeHead(405)
              return res.end('Method not allowed')
            }

            let body = ''
            for await (const chunk of req) body += chunk

            try {
              const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': env.VITE_ANTHROPIC_API_KEY,
                  'anthropic-version': '2023-06-01',
                },
                body,
              })
              const data = await response.text()
              res.writeHead(response.status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(data)
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        },
      },
    ],
    server: { port: 3000 },
  }
})
