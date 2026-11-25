/**
 * Checks that a real LLM is answering plain-English rules.
 *
 *   npm run check:llm                                  # uses LLM_* from .env, calls the provider directly
 *   npm run check:llm -- https://your-app.vercel.app   # checks the deployed /api/parse-rule
 *
 * Prints which parser answered and what it read. If the LLM didn't answer, it
 * says why (missing or rejected key, rate limit, unknown model) and, for an
 * unknown model, lists the models the key can use. Exits with code 1 on failure.
 */

import { handleParseRule, DEFAULT_BASE_URL, DEFAULT_MODEL } from '../server/ruleParser/handler.js'
import { interpretParserOutput } from '../src/inputs/nlRuleInput.js'

const SAMPLE = {
  text: '20% off for Natura Casa brand, stackable with other offers',
  knownBrands: ['LivSpace Pro', 'Natura Casa', 'Nordic Basics'],
  knownPlatforms: ['Amazon India', 'Flipkart', 'Noon'],
}
const EXPECTED = { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true }

const fail = (message) => {
  console.log(`\nFAIL  ${message}`)
  process.exit(1)
}

/** Lists model IDs from the provider's OpenAI-compatible /models endpoint, if it has one. */
async function listModels(baseUrl, apiKey) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? []).map((m) => m.id).filter(Boolean)
  } catch {
    return []
  }
}

function explainFailure(note = '') {
  if (/HTTP 40[13]/.test(note)) return 'The provider rejected the key. Check LLM_API_KEY (and that it belongs to the provider in LLM_BASE_URL).'
  if (/HTTP 404/.test(note)) return 'The provider doesn\'t know this model. Set LLM_MODEL to one your key can use (listed above, if the provider shares them).'
  if (/HTTP 429/.test(note)) return 'Rate limited by the provider. Wait a minute and try again (free tiers allow a few requests per minute).'
  if (/timed out/.test(note)) return 'The provider took longer than 8 seconds. Try again, or pick a faster model.'
  return 'The LLM call failed.'
}

const target = process.argv[2]
let body
const started = Date.now()

if (target) {
  const url = `${target.replace(/\/+$/, '')}/api/parse-rule`
  console.log(`Checking the deployed endpoint: ${url}`)
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(SAMPLE) })
    body = await res.json().catch(() => null)
    if (!res.ok || !body) fail(`The endpoint answered HTTP ${res.status}${body?.error ? `: ${body.error}` : ''}. Is the URL right, and did the deploy finish?`)
  } catch (err) {
    fail(`Couldn't reach ${url} (${err.message}).`)
  }
} else {
  try {
    process.loadEnvFile('.env')
  } catch {
    // no .env file
  }
  if (!process.env.LLM_API_KEY) {
    fail('No LLM_API_KEY found. Copy .env.example to .env and put your key in it (see README → LLM setup).')
  }
  console.log(`Checking ${process.env.LLM_MODEL || DEFAULT_MODEL} at ${process.env.LLM_BASE_URL || DEFAULT_BASE_URL}`)
  body = (await handleParseRule(SAMPLE, process.env, { log: { error() {} } })).json
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)

if (body.parser === 'offline') {
  console.log(`\nThe rule-based parser answered, not an LLM (${seconds}s).`)
  console.log(`Reason given: ${body.parserNote ?? 'none'}`)
  if (target) {
    fail(/No LLM is configured/.test(body.parserNote ?? '')
      ? 'The deployed site has no LLM key. In Vercel: Settings → Environment Variables → add LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL if not using Gemini defaults), then redeploy.'
      : `${explainFailure(body.parserNote)} Fix the variables in Vercel and redeploy.`)
  }
  if (/HTTP 404/.test(body.parserNote ?? '')) {
    const models = await listModels(process.env.LLM_BASE_URL || DEFAULT_BASE_URL, process.env.LLM_API_KEY)
    if (models.length) console.log(`Models this key can use:\n  ${models.slice(0, 40).join('\n  ')}`)
  }
  fail(explainFailure(body.parserNote))
}

const result = interpretParserOutput(body.output)
console.log(`\n${body.parser} answered in ${seconds}s.`)
console.log(`Description: "${SAMPLE.text}"`)
if (result.status !== 'ok') fail(`The LLM answered, but its reply was ${result.status}: ${result.message ?? ''}`)

console.log(`Parsed as:   ${Object.entries(result.rule).filter(([k, v]) => k !== 'ruleId' && v !== null).map(([k, v]) => `${k}=${v}`).join(', ')}`)
if (result.assumptions.length) console.log(`Assumptions: ${result.assumptions.join('; ')}`)

const wrong = Object.entries(EXPECTED).filter(([k, v]) => (k === 'appliesTo' ? String(result.rule[k]).toLowerCase() !== v.toLowerCase() : result.rule[k] !== v))
if (wrong.length) fail(`The LLM misread: ${wrong.map(([k, v]) => `${k} should be ${v}, got ${result.rule[k]}`).join('; ')}`)

console.log(`\nPASS  A real LLM (${body.parser}) is reading plain-English rules correctly.`)
