import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from './csvParser.js'

const sample = (name) => readFileSync(new URL(`../../sample-data/${name}`, import.meta.url), 'utf8')

describe('parseRulesCSV', () => {
  it('parses the sample rules file', () => {
    const { data, errors } = parseRulesCSV(sample('rules.csv'))
    expect(errors).toEqual([])
    expect(data.map((r) => r.ruleId)).toEqual(['RULE-01', 'RULE-02', 'RULE-03'])
  })

  it('rejects a percentage above 100', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\nRULE-09,brand,Natura Casa,percentage,150,false'
    const { data, errors } = parseRulesCSV(csv)
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/cannot exceed 100/)
  })
})

describe('parseCartCSV', () => {
  it('parses the sample cart file', () => {
    const { data, errors } = parseCartCSV(sample('cart.csv'))
    expect(errors).toEqual([])
    expect(data).toHaveLength(6)
  })
})
