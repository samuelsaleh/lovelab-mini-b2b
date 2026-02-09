import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'api-proxy',
        configureServer(server) {
          // Anthropic Proxy
          server.middlewares.use('/api/anthropic', async (req, res) => {
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

          // Perplexity Proxy (company lookup only)
          server.middlewares.use('/api/perplexity', async (req, res) => {
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
              const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${env.VITE_PERPLEXITY_API_KEY}`,
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

          // VIES VAT Validation Proxy (EU VAT number lookup)
          server.middlewares.use('/api/vat', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
              })
              return res.end()
            }
            if (req.method !== 'GET') {
              res.writeHead(405)
              return res.end('Method not allowed')
            }

            try {
              const url = new URL(req.url, 'http://localhost')
              const country = url.searchParams.get('country')
              const number = url.searchParams.get('number')

              if (!country || !number) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Missing country or number parameter' }))
              }

              const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(country)}/vat/${encodeURIComponent(number)}`
              const response = await fetch(viesUrl)
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
