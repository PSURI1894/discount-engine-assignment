import { describe, it, expect } from 'vitest'
import { previewRule } from './preview.js'
import { SAMPLE_CART, SAMPLE_RULES, item, makeRule } from '../test/fixtures.js'

describe('previewRule', () => {
  it('lists the item, cart-offer and total changes a rule would make (brief example 1)', () => {
    const rule = makeRule({ ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true })
    const preview = previewRule(SAMPLE_CART, SAMPLE_RULES, rule)
    expect(preview.changed).toBe(true)
    expect(preview.itemChanges).toEqual([
      { itemId: 'ITEM-01', product: 'Cushion Cover', from: 1104, to: 883 },
      { itemId: 'ITEM-02', product: 'Bed Sheet Set', from: 629, to: 503 },
    ])
    expect(preview.cartOfferChange).toEqual({ from: 593, to: 559 })
    expect(preview.totalChange).toEqual({ from: 5339, to: 5026 })
  })

  it('explains why a cart rule changes nothing when an existing cart offer is as good (brief example 3)', () => {
    const rule = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 })
    const preview = previewRule(SAMPLE_CART, SAMPLE_RULES, rule)
    expect(preview.changed).toBe(false)
    expect(preview.reason).toBe("This cart already gets an equal or bigger cart offer (RULE-04), so this rule wouldn't change the price.")
  })

  it('explains when the cart is below a cart rule\'s minimum', () => {
    const rule = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 10000 })
    expect(previewRule(SAMPLE_CART, SAMPLE_RULES, rule).reason).toMatch(/Rs.5,932, below this rule's Rs.10,000 minimum/)
  })

  it('explains when no item matches', () => {
    const rule = makeRule({ ruleId: 'RULE-05', scope: 'platform', appliesTo: 'Myntra', type: 'flat', value: 50, stackable: false })
    expect(previewRule(SAMPLE_CART, SAMPLE_RULES, rule).reason).toBe('No items in the current cart match this rule.')
  })

  it('explains when matching items already have a better offer', () => {
    const rule = makeRule({ ruleId: 'RULE-05', scope: 'platform', appliesTo: 'Amazon India', type: 'flat', value: 10, stackable: false })
    expect(previewRule([item({ platform: 'Amazon India' })], SAMPLE_RULES, rule).reason).toBe('The matching items already get an equal or better offer.')
  })

  it('returns null when there is no cart', () => {
    expect(previewRule([], SAMPLE_RULES, SAMPLE_RULES[0])).toBeNull()
  })
})
