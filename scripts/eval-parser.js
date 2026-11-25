/**
 * Scores the rule parser on the evaluation set (server/ruleParser/evalCases.js).
 *
 *   npm run eval:parser
 *
 * Uses the LLM configured in .env (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL), or
 * the rule-based parser when no key is set. Results are scored after client-side
 * validation — i.e. what a user would actually be shown.
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

const usingLlm = Boolean(process.env.LLM_API_KEY)
const model = process.env.LLM_MODEL || DEFAULT_MODEL
const delayMs = Number(process.env.EVAL_DELAY_MS ?? (usingLlm ? 4000 : 0))
const RETRY_PAUSES_MS = [15000, 45000]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (want) => (want === 'refuse' ? 'refuse' : Object.entries(want).map(([k, v]) => `${k}=${v}`).join(', '))
const describeResult = (r) => (r.status === 'ok' ? Object.entries(r.rule).filter(([k]) => k !== 'ruleId').map(([k, v]) => `${k}=${v}`).join(', ') : `${r.status}: ${r.message ?? ''}`)
const quiet = { log: { error() {} } }

/** Asks the configured parser; with an LLM, retries rate limits and timeouts. Returns the endpoint's JSON. */
async function ask(text) {
  let response = (await handleParseRule({ text, ...EVAL_CONTEXT }, process.env, quiet)).json
  if (!usingLlm) return response
  for (const pause of RETRY_PAUSES_MS) {
    if (response.parser !== 'offline' || !/HTTP 429|HTTP 5\d\d|timed out/.test(response.parserNote ?? '')) break
    process.stdout.write(`        (LLM busy: ${response.parserNote.match(/\(([^)]*)\)/g)?.at(-1) ?? 'retrying'}; waiting ${pause / 1000}s)\n`)
    await sleep(pause)
    response = (await handleParseRule({ text, ...EVAL_CONTEXT }, process.env, quiet)).json
  }
  return response
}

let scored = 0
let passed = 0
let wrongRules = 0
const unanswered = []

console.log(`Evaluating ${EVAL_CASES.length} cases with ${usingLlm ? `the LLM (${model})` : 'the rule-based parser'}…\n`)

for (const [i, testCase] of EVAL_CASES.entries()) {
  if (i > 0 && delayMs) await sleep(delayMs)
  const response = await ask(testCase.text)

  if (usingLlm && response.parser === 'offline') {
    // A setup problem (bad key, unknown model) will fail every case: stop and say so.
    if (i === 0 && !/HTTP 429|HTTP 5\d\d|timed out/.test(response.parserNote ?? '')) {
      console.log(`The LLM didn't answer: ${response.parserNote}\nRun "npm run check:llm" to diagnose it.`)
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
