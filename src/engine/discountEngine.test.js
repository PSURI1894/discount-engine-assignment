import { describe, it, expect } from 'vitest'
import { processCart, cartTotal, applyDiscounts, priceCart } from './discountEngine.js'
import { SAMPLE_CART, SAMPLE_ITEM_RULES, SAMPLE_RULES, RULE_01, RULE_04, item, makeRule } from '../test/fixtures.js'

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
    expect(results['ITEM-04'].reasoning).toMatch(/^No offers available/)
  })

  it('ITEM-06: stackable RULE-03 applies on its own', () => {
    expect(results['ITEM-06'].finalPrice).toBe(809)
    expect(results['ITEM-06'].appliedRules).toEqual(['RULE-03'])
  })

  it('cart total before any cart offer is Rs.5,932', () => {
    expect(cartTotal(Object.values(results))).toBe(5932)
  })
})

describe('customer-facing explanations and status', () => {
  const results = byId(processCart(SAMPLE_CART, SAMPLE_RULES))

  it.each([
    ['ITEM-01', 'best', 'Amazon India offer: 15% off (better than Natura Casa Rs.150 off)'],
    ['ITEM-02', 'stacked', 'Natura Casa offer: Rs.150 off + Flipkart offer: 10% off'],
    ['ITEM-03', 'applied', 'Amazon India offer: 15% off'],
    ['ITEM-04', 'none', 'No offers available for LivSpace Pro products on Noon'],
    ['ITEM-05', 'applied', 'Amazon India offer: 15% off'],
    ['ITEM-06', 'applied', 'Flipkart offer: 10% off'],
  ])('%s → %s: "%s"', (id, status, reasoning) => {
    expect(results[id].status).toBe(status)
    expect(results[id].reasoning).toBe(reasoning)
  })

  it('stays accurate after a new rule is added', () => {
    const flipkartFlat100 = makeRule({ ruleId: 'RULE-05', scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false })
    const updated = byId(processCart(SAMPLE_CART, [...SAMPLE_RULES, flipkartFlat100]))
    expect(updated['ITEM-02'].reasoning).toBe('Natura Casa offer: Rs.150 off (better than Flipkart Rs.100 off) + Flipkart offer: 10% off')
    expect(updated['ITEM-02'].finalPrice).toBe(629)
    expect(updated['ITEM-06'].reasoning).toBe('Flipkart offer: Rs.100 off + Flipkart offer: 10% off')
    expect(updated['ITEM-06'].finalPrice).toBe(719)
  })

  it('says so when a flat offer is limited to the item price', () => {
    const nordicFlat500 = makeRule({ ruleId: 'RULE-X', scope: 'brand', appliesTo: 'Nordic Basics', type: 'flat', value: 500, stackable: false })
    const res = applyDiscounts(item({ brand: 'Nordic Basics', basePrice: 449 }), [nordicFlat500])
    expect(res.reasoning).toBe('Nordic Basics offer: Rs.500 off (limited to the item price)')
  })

  it('formats large flat values the Indian way', () => {
    const big = makeRule({ ruleId: 'RULE-X', scope: 'brand', appliesTo: 'Test Brand', type: 'flat', value: 1500, stackable: false })
    expect(applyDiscounts(item({ basePrice: 20000 }), [big]).reasoning).toBe('Test Brand offer: Rs.1,500 off')
  })
})

describe('cart-level offers', () => {
  it('matches the brief: Rs.5,932 ≥ Rs.4,000 → RULE-04 takes Rs.593 off → Rs.5,339', () => {
    const pricing = priceCart(SAMPLE_CART, SAMPLE_RULES)
    expect(pricing.subtotal).toBe(5932)
    expect(pricing.cartOffer.appliedRules).toEqual(['RULE-04'])
    expect(pricing.cartOffer.totalDiscount).toBe(593)
    expect(pricing.cartOffer.lines).toEqual([{ ruleId: 'RULE-04', label: 'Cart offer: 10% off', amount: 593, minCartValue: 4000 }])
    expect(pricing.total).toBe(5339)
    expect(pricing.baseTotal).toBe(6594)
    expect(pricing.totalSavings).toBe(6594 - 5339)
  })

  it('never applies a cart rule to individual items', () => {
    const withCartRule = processCart(SAMPLE_CART, SAMPLE_RULES).map((r) => r.finalPrice)
    const withoutCartRule = processCart(SAMPLE_CART, SAMPLE_ITEM_RULES).map((r) => r.finalPrice)
    expect(withCartRule).toEqual(withoutCartRule)
  })

  it('applies at exactly the minimum (inclusive)', () => {
    const pricing = priceCart([item({ basePrice: 4000 })], [RULE_04])
    expect(pricing.cartOffer.totalDiscount).toBe(400)
    expect(pricing.total).toBe(3600)
  })

  it('does not apply Rs.1 below the minimum, and reports no cart offer', () => {
    const pricing = priceCart([item({ basePrice: 3999 })], [RULE_04])
    expect(pricing.cartOffer).toBeNull()
    expect(pricing.total).toBe(3999)
  })

  it('checks the minimum against discounted item prices, not base prices', () => {
    // Base Rs.4,100, but 15% off on Amazon India brings it to Rs.3,485 — below Rs.4,000.
    const pricing = priceCart([item({ platform: 'Amazon India', basePrice: 4100 })], [RULE_01, RULE_04])
    expect(pricing.subtotal).toBe(3485)
    expect(pricing.cartOffer).toBeNull()
  })

  it('picks the biggest qualifying cart saving, ignoring rules whose minimum is not met', () => {
    const flat700Above5000 = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'flat', value: 700, stackable: false, minCartValue: 5000 })
    const pct20Above9000 = makeRule({ ruleId: 'RULE-06', scope: 'cart', type: 'percentage', value: 20, stackable: false, minCartValue: 9000 })
    const pricing = priceCart(SAMPLE_CART, [...SAMPLE_RULES, flat700Above5000, pct20Above9000])
    expect(pricing.cartOffer.appliedRules).toEqual(['RULE-05'])
    expect(pricing.cartOffer.skippedRules).toEqual(['RULE-04'])
    expect(pricing.total).toBe(5932 - 700)
  })

  it('breaks a tie between cart rules in favour of the rule listed first', () => {
    const pct10Above5000 = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 })
    const pricing = priceCart(SAMPLE_CART, [...SAMPLE_RULES, pct10Above5000])
    expect(pricing.cartOffer.appliedRules).toEqual(['RULE-04'])
    expect(pricing.total).toBe(5339)
  })

  it('stacks a stackable cart rule on top of the winning one', () => {
    const extra5 = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 5, stackable: true, minCartValue: 1000 })
    const pricing = priceCart(SAMPLE_CART, [...SAMPLE_RULES, extra5])
    // 5932 − 593 = 5339; 5% of 5339 = 266.95 → 267; 5339 − 267 = 5072
    expect(pricing.cartOffer.appliedRules).toEqual(['RULE-04', 'RULE-05'])
    expect(pricing.total).toBe(5072)
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
