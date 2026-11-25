import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleParseRule } from './server/ruleParser/handler.js'

/**
 * Serves POST /api/parse-rule during `npm run dev` and `npm run preview`, using
 * the same handler as the Vercel function in api/, so local and deployed
 * behaviour match. Without LLM_API_KEY in .env it uses the offline parser.
 */
function localApi(env) {
  const middleware = async (req, res) => {
    const send = (status, json) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(json))
    }
    if (req.method !== 'POST') return send(405, { error: 'Use POST' })

    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 10_000) return send(413, { error: 'Request too large' })
    }
    let body
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      return send(400, { error: 'Request body must be JSON' })
    }
    const result = await handleParseRule(body, env)
    send(result.status, result.json)
  }

  // Block bodies matter: a value returned from these hooks is treated by Vite as a post-hook.
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/parse-rule', middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  // The '' prefix loads LLM_* variables too. They are only used by the server
  // middleware above; Vite only exposes VITE_* variables to browser code.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), localApi(env)],
  }
})
