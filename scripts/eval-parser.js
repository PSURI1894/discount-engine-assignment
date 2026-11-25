/**
 * Scores the rule parser on the evaluation set (server/ruleParser/evalCases.js).
 *
 *   npm run eval:parser                                  # LLM in .env, or the rule-based parser
 *   npm run eval:parser -- https://your-app.vercel.app   # whatever the deployed site uses
 *
 * Locally it uses the LLM configured in .env (LLM_API_KEY / LLM_BASE_URL /
 * LLM_MODEL), or the rule-based parser when no key is set. Given a URL, it asks
 * the deployed /api/parse-rule instead, so the key never has to leave Vercel.
 * Results are scored after client-side validation — what a user would be shown.
 *
 * With an LLM, requests are spaced out (EVAL_DELAY_MS, default 4000) to stay
 * inside free-tier limits. If the LLM is rate limited, the case is retried after
 * a pause; a case the LLM never answers is reported and left out of its score,
 * rather than being scored with the rule-based parser's answer. The last line is
 * a row ready to paste into the README.
 */

import { handleParseRule, DEFAULT_MODEL } from '../server/ruleParser/handler.js'
import { interpretParserOutput } from '../src/inputs/nlRuleInput.js'
import { EVAL_CASES, EVAL_CONTEXT, scoreCase } from '../server/ruleParser/evalCases.js'

try {
  process.loadEnvFile('.env')
} catch {
  // no .env: use the rule-based parser (or variables already in the environment)
}

const target = process.argv[2]?.replace(/\/+$/, '')
// With a URL we only learn which parser the site uses from its first answer.
let usingLlm = target ? true : Boolean(process.env.LLM_API_KEY)
let model = target ? 'deployed site' : process.env.LLM_MODEL || DEFAULT_MODEL
const delayMs = Number(process.env.EVAL_DELAY_MS ?? (usingLlm ? 4000 : 0))
const RETRY_PAUSES_MS = [15000, 45000]
const RETRYABLE = /HTTP 429|HTTP 5\d\d|timed out/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (want) => (want === 'refuse' ? 'refuse' : Object.entries(want).map(([k, v]) => `${k}=${v}`).join(', '))
const describeResult = (r) => (r.status === 'ok' ? Object.entries(r.rule).filter(([k]) => k !== 'ruleId').map(([k, v]) => `${k}=${v}`).join(', ') : `${r.status}: ${r.message ?? ''}`)
const quiet = { log: { error() {} } }

/** One request to the parser: the local handler, or the deployed endpoint. Returns the endpoint's JSON. */
async function callParser(text) {
  const request = { text, ...EVAL_CONTEXT }
  if (!target) return (await handleParseRule(request, process.env, quiet)).json
  try {
    const res = await fetch(`${target}/api/parse-rule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
    const body = await res.json().catch(() => null)
    if (res.ok && body) return body
    return { parser: 'offline', parserNote: `the endpoint answered (HTTP ${res.status})`, output: null }
  } catch (err) {
    return { parser: 'offline', parserNote: `the endpoint couldn't be reached (${err.message})`, output: null }
  }
}

/** Asks the parser; with an LLM, retries rate limits and timeouts. */
async function ask(text) {
  let response = await callParser(text)
  if (!usingLlm) return response
  for (const pause of RETRY_PAUSES_MS) {
    if (response.parser !== 'offline' || !RETRYABLE.test(response.parserNote ?? '')) break
    process.stdout.write(`        (LLM busy: ${response.parserNote.match(/\(([^)]*)\)/g)?.at(-1) ?? 'retrying'}; waiting ${pause / 1000}s)\n`)
    await sleep(pause)
    response = await callParser(text)
  }
  return response
}

let scored = 0
let passed = 0
let wrongRules = 0
const unanswered = []

console.log(`Evaluating ${EVAL_CASES.length} cases with ${target ? target : usingLlm ? `the LLM (${model})` : 'the rule-based parser'}…\n`)

for (const [i, testCase] of EVAL_CASES.entries()) {
  if (i > 0 && delayMs) await sleep(delayMs)
  const response = await ask(testCase.text)

  if (i === 0 && target) {
    if (response.parser === 'offline' && /No LLM is configured/.test(response.parserNote ?? '')) {
      console.log('The deployed site has no LLM key, so this would only score the rule-based parser.')
      console.log('Add LLM_API_KEY in Vercel (Settings → Environment Variables), redeploy, and run this again.')
      process.exit(1)
    }
    if (response.parser !== 'offline') model = response.parser
  }

  if (usingLlm && response.parser === 'offline') {
    // A setup problem (bad key, unknown model, unreachable site) will fail every case: stop and say so.
    if (i === 0 && !RETRYABLE.test(response.parserNote ?? '')) {
      console.log(`The LLM didn't answer: ${response.parserNote}\nRun "npm run check:llm${target ? ` -- ${target}` : ''}" to diagnose it.`)
      process.exit(1)
    }
    unanswered.push(testCase.text)
    console.log(`SKIP  "${testCase.text}"  (the LLM never answered; not scored)`)
    continue
  }

  const result = interpretParserOutput(response.output)
  const { pass, wrongRule } = scoreCase(testCase, result)
  scored += 1
  if (pass) passed += 1
  if (wrongRule) wrongRules += 1

  console.log(`${pass ? 'PASS' : wrongRule ? 'WRONG' : 'MISS'}  "${testCase.text}"`)
  if (!pass) {
    console.log(`        wanted: ${describe(testCase.want)}${testCase.why ? ` (${testCase.why})` : ''}`)
    console.log(`        got:    ${describeResult(result)}`)
  }
}

const label = usingLlm ? `LLM (${model})` : 'Rule-based'
console.log(`\n${passed}/${scored} passed — parser: ${label}`)
console.log(`${wrongRules} wrong rule${wrongRules === 1 ? '' : 's'} (a rule that would have been shown but didn't match)`)
if (unanswered.length) console.log(`${unanswered.length} case${unanswered.length === 1 ? '' : 's'} not scored because the LLM never answered`)
console.log(`\nREADME row:\n| ${label} | ${passed}/${scored}${unanswered.length ? ` (${unanswered.length} unanswered)` : ''} | ${wrongRules} |`)
