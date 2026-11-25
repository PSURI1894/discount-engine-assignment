import { describe, it, expect } from 'vitest'
import { nextRuleId, renumberAddedRules } from './ruleIds.js'

const ids = (...xs) => xs.map((ruleId) => ({ ruleId }))

describe('nextRuleId', () => {
  it('continues after the highest RULE-NN in use', () => {
    expect(nextRuleId(ids('RULE-01', 'RULE-04', 'RULE-02'))).toBe('RULE-05')
  })

  it('starts at RULE-01 and ignores IDs in other formats', () => {
    expect(nextRuleId([])).toBe('RULE-01')
    expect(nextRuleId(ids('PROMO-9'))).toBe('RULE-01')
  })
})

describe('renumberAddedRules', () => {
  it('keeps added rules whose IDs are still free', () => {
    expect(renumberAddedRules(ids('RULE-01'), ids('RULE-05'))).toEqual(ids('RULE-05'))
  })

  it('gives a clashing added rule the next free ID', () => {
    const fileRules = ids('RULE-01', 'RULE-02', 'RULE-03', 'RULE-04', 'RULE-05')
    expect(renumberAddedRules(fileRules, ids('RULE-05', 'RULE-06'))).toEqual(ids('RULE-07', 'RULE-06'))
  })
})
