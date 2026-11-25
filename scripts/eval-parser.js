/**
 * Scores the rule parser on the evaluation set (server/ruleParser/evalCases.js).
 *
 *   npm run eval:parser
 *
 * Uses the LLM configured in .env (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL), or
 * the offline parser when no key is set. Results are scored after client-side
 * validation — i.e. what a user would actually be shown. With an LLM, requests
 * are spaced out (EVAL_DELAY_MS, default 2500) to stay inside free-tier limits.
 */

import { handleParseRule } from '../server/ruleParser/handler.js'
import { interpretParserOutput } from '../src/inputs/nlRuleInput.js'
import { EVAL_CASES, EVAL_CONTEXT, scoreCase } from '../server/ruleParser/evalCases.js'

try {
  process.loadEnvFile('.env')
} catch {
  // no .env: use the offline parser (or variables already in the environment)
}

const usingLlm = Boolean(process.env.LLM_API_KEY)
const delayMs = Number(process.env.EVAL_DELAY_MS ?? (usingLlm ? 2500 : 0))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (want) => (want === 'refuse' ? 'refuse' : Object.entries(want).map(([k, v]) => `${k}=${v}`).join(', '))
const describeResult = (r) => (r.status === 'ok' ? Object.entries(r.rule).filter(([k]) => k !== 'ruleId').map(([k, v]) => `${k}=${v}`).join(', ') : `${r.status}: ${r.message ?? ''}`)

let passed = 0
let wrongRules = 0
let fallbacks = 0
let parserName = 'offline'

console.log(`Evaluating ${EVAL_CASES.length} cases with ${usingLlm ? `the LLM (${process.env.LLM_MODEL || 'default model'})` : 'the offline parser'}…\n`)

for (const [i, testCase] of EVAL_CASES.entries()) {
  if (i > 0 && delayMs) await sleep(delayMs)
  const response = await handleParseRule({ text: testCase.text, ...EVAL_CONTEXT }, process.env, { log: { error() {} } })
  const result = interpretParserOutput(response.json.output)
  const { pass, wrongRule } = scoreCase(testCase, result)

  if (response.json.parser !== 'offline') parserName = response.json.parser
  const fellBack = usingLlm && response.json.parser === 'offline'
  if (fellBack) fallbacks += 1
  if (pass) passed += 1
  if (wrongRule) wrongRules += 1

  console.log(`${pass ? 'PASS' : wrongRule ? 'WRONG' : 'MISS'}  "${testCase.text}"${fellBack ? '  (LLM unavailable — offline fallback)' : ''}`)
  if (!pass) {
    console.log(`        wanted: ${describe(testCase.want)}${testCase.why ? ` (${testCase.why})` : ''}`)
    console.log(`        got:    ${describeResult(result)}`)
  }
}

const pct = Math.round((passed / EVAL_CASES.length) * 100)
console.log(`\n${passed}/${EVAL_CASES.length} passed (${pct}%) — parser: ${parserName}`)
console.log(`${wrongRules} wrong rule${wrongRules === 1 ? '' : 's'} (a rule that would have been shown but didn't match)`)
if (fallbacks > 0) console.log(`${fallbacks} case${fallbacks === 1 ? '' : 's'} fell back to the offline parser because the LLM was unavailable`)
