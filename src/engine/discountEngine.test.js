import { describe, it, expect } from 'vitest'
import { processCart, cartTotal, applyDiscounts } from './discountEngine.js'
import { SAMPLE_CART, SAMPLE_ITEM_RULES, RULE_01, item } from '../test/fixtures.js'

const byId = (results) => Object.fromEntries(results.map((r) => [r.itemId, r]))

describe('item-level discounts — expected results from the brief', () => {
  const results = byId(processCart(SAMPLE_CART, SAMPLE_ITEM_RULES))

  it('ITEM-01: picks RULE-01 (Rs.195) over RULE-02 (Rs.150)', () => {
    expect(results['ITEM-01'].finalPrice).toBe(1104)
    expect(results['ITEM-01'].appliedRules).toEqual(['RULE-01'])
    expect(results['ITEM-01'].skippedRules).toEqual(['RULE-02'])
  })

  it('ITEM-02: applies RULE-02 then stacks RULE-03 on the reduced price', () => {
    expect(results['ITEM-02'].finalPrice).toBe(629)
    expect(results['ITEM-02'].appliedRules).toEqual(['RULE-02', 'RULE-03'])
  })

  it('ITEM-03 and ITEM-05: RULE-01 only', () => {
    expect(results['ITEM-03'].finalPrice).toBe(509)
    expect(results['ITEM-05'].finalPrice).toBe(382)
  })

  it('ITEM-04: no rules match, base price with a "no offer" note', () => {
    expect(results['ITEM-04'].finalPrice).toBe(2499)
    expect(results['ITEM-04'].appliedRules).toEqual([])
    expect(results['ITEM-04'].reasoning).toBe('No offers available')
  })

  it('ITEM-06: stackable RULE-03 applies on its own', () => {
    expect(results['ITEM-06'].finalPrice).toBe(809)
    expect(results['ITEM-06'].appliedRules).toEqual(['RULE-03'])
  })

  it('cart total before any cart offer is Rs.5,932', () => {
    expect(cartTotal(Object.values(results))).toBe(5932)
  })
})

describe('discounts never take a price below zero', () => {
  const nordicFlat500 = { ruleId: 'RULE-X', scope: 'brand', appliesTo: 'Nordic Basics', type: 'flat', value: 500, stackable: false }

  it('caps a flat discount larger than the item price (item becomes free, not negative)', () => {
    const res = applyDiscounts(item({ brand: 'Nordic Basics', platform: 'Noon', basePrice: 449 }), [nordicFlat500])
    expect(res.finalPrice).toBe(0)
    expect(res.totalDiscount).toBe(449)
  })

  it('caps a stackable flat applied after the winning rule', () => {
    const stackableFlat = { ...nordicFlat500, stackable: true }
    const res = applyDiscounts(item({ brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 }), [RULE_01, stackableFlat])
    expect(res.finalPrice).toBe(0)
    expect(res.totalDiscount).toBe(449)
  })
})
