import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from './csvInput.js'

const sample = (name) => readFileSync(new URL(`../../sample-data/${name}`, import.meta.url), 'utf8')
const RULES_HEADER = 'rule_id,scope,applies_to,type,value,stackable'

describe('parseRulesCSV', () => {
  it('parses the sample rules file', () => {
    const { data, errors } = parseRulesCSV(sample('rules.csv'))
    expect(errors).toEqual([])
    expect(data.map((r) => r.ruleId)).toEqual(['RULE-01', 'RULE-02', 'RULE-03'])
  })

  it('rejects a percentage above 100', () => {
    const { data, errors } = parseRulesCSV(`${RULES_HEADER}\nRULE-09,brand,Natura Casa,percentage,150,false`)
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/cannot exceed 100/)
  })

  it('skips a bad row but keeps the good ones, reporting the row number', () => {
    const csv = [
      RULES_HEADER,
      'RULE-01,platform,Amazon India,percentage,15,false',
      'RULE-02,brand,Natura Casa,flat,150,ture',
      'RULE-03,platform,Flipkart,percentage,10,true',
    ].join('\n')
    const { data, errors } = parseRulesCSV(csv)
    expect(data.map((r) => r.ruleId)).toEqual(['RULE-01', 'RULE-03'])
    expect(errors).toEqual(['Row 3: stackable must be true or false, got "ture"'])
  })

  it('reports a row with too many fields instead of discarding the file', () => {
    const csv = `${RULES_HEADER}\nRULE-01,platform,Amazon India,percentage,15,false,extra\nRULE-03,platform,Flipkart,percentage,10,true`
    const { data, errors } = parseRulesCSV(csv)
    expect(data.map((r) => r.ruleId)).toEqual(['RULE-03'])
    expect(errors[0]).toMatch(/^Row 2:/)
  })

  it('rejects duplicate rule IDs', () => {
    const csv = `${RULES_HEADER}\nRULE-01,platform,Amazon India,percentage,15,false\nRULE-01,brand,Natura Casa,flat,150,false`
    const { data, errors } = parseRulesCSV(csv)
    expect(data).toHaveLength(1)
    expect(errors).toEqual(['Row 3: duplicate rule ID "RULE-01" (already used on row 2)'])
  })

  it('explains when the wrong file is uploaded', () => {
    const { data, errors } = parseRulesCSV(sample('cart.csv'))
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/doesn't look like a rules file/)
  })
})

describe('parseCartCSV', () => {
  it('parses the sample cart file', () => {
    const { data, errors } = parseCartCSV(sample('cart.csv'))
    expect(errors).toEqual([])
    expect(data).toHaveLength(6)
    expect(data[0]).toEqual({ itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 })
  })

  it('reports an empty file', () => {
    const { errors } = parseCartCSV('item_id,product,brand,platform,base_price\n')
    expect(errors).toEqual(['The cart file has no data rows'])
  })
})
