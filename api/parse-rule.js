/**
 * Vercel serverless function: POST /api/parse-rule
 * Thin adapter around server/ruleParser/handler.js, which holds the logic.
 * The LLM key lives in Vercel's environment variables and never reaches the browser.
 */

import { handleParseRule } from '../server/ruleParser/handler.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST' })
  }

  let body = req.body ?? {}
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(400).json({ error: 'Request body must be JSON' })
    }
  }

  const result = await handleParseRule(body, process.env)
  return res.status(result.status).json(result.json)
}
