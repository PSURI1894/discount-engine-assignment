/**
 * handler.js
 *
 * POST /api/parse-rule — framework-agnostic core, shared by the Vercel function
 * (api/parse-rule.js) and the Vite dev server (vite.config.js).
 *
 * Request:  { text, knownBrands?, knownPlatforms? }
 * Response: { parser, parserNote?, output }
 *   parser  — the model name, or "offline" for the built-in parser
 *   output  — the parser's raw reply (string from an LLM, object from the
 *             offline parser). The client parses and validates it.
 *
 * Configuration (environment variables, server-side only):
 *   LLM_API_KEY   — when absent, the offline parser is used (no cost)
 *   LLM_BASE_URL  — any OpenAI-compatible endpoint (default: Google Gemini)
 *   LLM_MODEL     — model name (default below)
 */

import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js'
import { offlineParse } from './offlineParser.js'
import { callOpenAiCompatible } from './openAiCompatible.js'

export const MAX_DESCRIPTION_LENGTH = 300
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

const reply = (status, json) => ({ status, json })

const nameList = (v) =>
  Array.isArray(v)
    ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 60)).slice(0, 50)
    : []

export async function handleParseRule(body, env = {}, { fetchImpl = fetch, log = console } = {}) {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return reply(400, { error: 'Describe the rule you want to add.' })
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    return reply(400, { error: `Please keep the description under ${MAX_DESCRIPTION_LENGTH} characters.` })
  }

  const context = { knownBrands: nameList(body.knownBrands), knownPlatforms: nameList(body.knownPlatforms) }

  if (!env.LLM_API_KEY) {
    return reply(200, {
      parser: 'offline',
      parserNote: 'No LLM is configured, so the built-in offline parser was used.',
      output: offlineParse(text, context),
    })
  }

  const model = env.LLM_MODEL || DEFAULT_MODEL
  try {
    const output = await callOpenAiCompatible({
      baseUrl: env.LLM_BASE_URL || DEFAULT_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(text, context),
      fetchImpl,
    })
    return reply(200, { parser: model, output })
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timed out' : err?.message || 'unknown error'
    log.error?.(`[parse-rule] LLM call failed: ${reason}`)
    return reply(200, {
      parser: 'offline',
      parserNote: `The LLM (${model}) was unavailable (${reason}), so the built-in offline parser was used.`,
      output: offlineParse(text, context),
    })
  }
}
