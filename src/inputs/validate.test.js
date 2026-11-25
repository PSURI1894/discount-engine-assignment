import { describe, it, expect } from 'vitest'
import { parseNumber, parseBoolean, validateRule, validateCartItem } from './validate.js'

describe('parseNumber', () => {
  it.each([
    [1299, 1299],
    ['1299', 1299],
    ['1,299', 1299],
    ['Rs.1,299', 1299],
    ['Rs. 1,299', 1299],
    ['₹1,299.50', 1299.5],
    ['1,29,999', 129999],
    ['Rs.849/-', 849],
    ['15%', 15],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })

  it.each(['', 'abc', 'Rs.abc', '-5', '12-3', null, undefined, NaN])('rejects %s', (input) => {
    expect(parseNumber(input)).toBeNull()
  })
})

describe('parseBoolean', () => {
  it('accepts common spellings and refuses to guess otherwise', () => {
    expect(parseBoolean('TRUE')).toBe(true)
    expect(parseBoolean('no')).toBe(false)
    expect(parseBoolean(false)).toBe(false)
    expect(parseBoolean('ture')).toBeNull()
    expect(parseBoolean('')).toBeNull()
  })
})

describe('validateRule', () => {
  const good = { ruleId: 'RULE-01', scope: 'Platform', appliesTo: ' Amazon India ', type: 'percentage', value: '15', stackable: 'false' }

  it('normalises a valid rule', () => {
    expect(validateRule(good)).toEqual({
      parsed: { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false, minCartValue: null },
    })
  })

  it('accepts a cart rule without "applies to" and keeps its minimum', () => {
    const { parsed } = validateRule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: 'Entire cart', type: 'percentage', value: 10, stackable: false, minCartValue: 'Rs.4,000' })
    expect(parsed.appliesTo).toBeNull()
    expect(parsed.minCartValue).toBe(4000)
  })

  it('requires a minimum cart value on cart rules', () => {
    const { errors } = validateRule({ ruleId: 'RULE-04', scope: 'cart', type: 'percentage', value: 10, stackable: false })
    expect(errors).toEqual(['a cart rule needs a minimum cart value'])
  })

  it('refuses a minimum cart value on an item rule rather than silently dropping the condition', () => {
    const { errors } = validateRule({ ...good, minCartValue: '2000' })
    expect(errors).toEqual(['a minimum cart value only applies to cart rules, not platform rules'])
  })

  it('treats a minimum of 0 on an item rule as "no minimum" (spreadsheet exports)', () => {
    expect(validateRule({ ...good, minCartValue: '0' }).parsed.minCartValue).toBeNull()
  })

  it('refuses a cart rule limited to a brand rather than silently widening it to the whole cart', () => {
    const { errors } = validateRule({ ruleId: 'RULE-05', scope: 'cart', appliesTo: 'Natura Casa', type: 'percentage', value: 10, stackable: false, minCartValue: 2000 })
    expect(errors).toEqual(['a cart rule applies to the whole cart, so it can\'t be limited to "Natura Casa"'])
  })

  it('refuses a value whose unit contradicts the type', () => {
    expect(validateRule({ ...good, value: 'Rs.50' }).errors).toEqual(['value "Rs.50" is in rupees, but the type is percentage'])
    expect(validateRule({ ...good, type: 'flat', value: '15%' }).errors).toEqual(['value "15%" is a percentage, but the type is flat'])
  })

  it('lists every problem at once', () => {
    const { errors } = validateRule({ ruleId: '', scope: 'brand', appliesTo: '', type: 'bogo', value: '0', stackable: 'maybe' })
    expect(errors).toEqual([
      'rule ID is missing',
      'a brand rule must say which brand it applies to',
      'type must be "percentage" or "flat", got "bogo"',
      'value must be a positive number, got "0"',
      'stackable must be true or false, got "maybe"',
    ])
  })

  it('rejects an unknown scope', () => {
    expect(validateRule({ ...good, scope: 'category' }).errors).toEqual(['scope must be "brand" or "platform" or "cart", got "category"'])
  })
})

describe('validateCartItem', () => {
  it('rounds the base price to whole rupees', () => {
    const { parsed } = validateCartItem({ itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 'Rs.1,299.40' })
    expect(parsed.basePrice).toBe(1299)
  })

  it('rejects missing fields and bad prices', () => {
    const { errors } = validateCartItem({ itemId: 'ITEM-01', product: '', brand: 'X', platform: 'Y', basePrice: 'free' })
    expect(errors).toEqual(['product is missing', 'base price must be a positive number, got "free"'])
  })
})
