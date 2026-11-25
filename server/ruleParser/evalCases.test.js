import { describe, it, expect } from 'vitest'
import { EVAL_CASES, EVAL_CONTEXT, scoreCase } from './evalCases.js'
import { offlineParse } from './offlineParser.js'
import { interpretParserOutput } from '../../src/inputs/nlRuleInput.js'

const offline = (text) => interpretParserOutput(offlineParse(text, EVAL_CONTEXT))

describe('evaluation set — offline parser', () => {
  it.each(EVAL_CASES.map((c) => [c.text, c]))('never returns a wrong rule: "%s"', (_, testCase) => {
    expect(scoreCase(testCase, offline(testCase.text)).wrongRule).toBe(false)
  })

  it('refuses every case that must be refused', () => {
    const refusals = EVAL_CASES.filter((c) => c.want === 'refuse')
    const passed = refusals.filter((c) => scoreCase(c, offline(c.text)).pass)
    expect(passed.map((c) => c.text)).toEqual(refusals.map((c) => c.text))
  })

  it('reads the brief\'s examples and common phrasings', () => {
    const score = EVAL_CASES.filter((c) => scoreCase(c, offline(c.text)).pass).length
    // Known gap: "a hundred rupees" (number words) — the offline parser asks instead of guessing.
    expect(score).toBeGreaterThanOrEqual(EVAL_CASES.length - 1)
  })
})

describe('scoreCase', () => {
  const rule = { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true }

  it('passes a matching rule, comparing names without case', () => {
    expect(scoreCase({ want: { appliesTo: 'natura casa', value: 20 } }, { status: 'ok', rule })).toEqual({ pass: true, wrongRule: false })
  })

  it('treats a mismatching rule as worse than a refusal', () => {
    expect(scoreCase({ want: { value: 15 } }, { status: 'ok', rule })).toEqual({ pass: false, wrongRule: true })
    expect(scoreCase({ want: { value: 15 } }, { status: 'unresolvable' })).toEqual({ pass: false, wrongRule: false })
  })

  it('passes a refusal case on any non-ok status', () => {
    expect(scoreCase({ want: 'refuse' }, { status: 'invalid' }).pass).toBe(true)
    expect(scoreCase({ want: 'refuse' }, { status: 'ok', rule }).wrongRule).toBe(true)
  })
})
