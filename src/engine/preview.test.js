import { describe, it, expect } from 'vitest'
import { previewRule, nextCartOffer } from './preview.js'
import { priceCart } from './discountEngine.js'
import { SAMPLE_CART, SAMPLE_RULES, RULE_04, item, makeRule } from '../test/fixtures.js'

describe('nextCartOffer', () => {
  const withoutVase = SAMPLE_CART.filter((i) => i.itemId !== 'ITEM-04') // Rs.3,433 after item discounts

  it('says how far a cart is below a cart offer it does not get yet', () => {
    const pricing = priceCart(withoutVase, SAMPLE_RULES)
    expect(pricing.subtotal).toBe(3433)
    expect(nextCartOffer(pricing, SAMPLE_RULES)).toEqual({ ruleId: 'RULE-04', shortfall: 567, minCartValue: 4000, offer: '10% off' })
  })

  it('handles Rs.1 short of the minimum', () => {
    expect(nextCartOffer(priceCart([item({ basePrice: 3999 })], [RULE_04]), [RULE_04]).shortfall).toBe(1)
  })

  it('returns null once the cart already gets the best cart offer available', () => {
    expect(nextCartOffer(priceCart(SAMPLE_CART, SAMPLE_RULES), SAMPLE_RULES)).toBeNull()
  })

  it('points to a bigger cart offer at a higher minimum', () => {
    const pct20Above9000 = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 20, stackable: false, minCartValue: 9000 })
    const rules = [...SAMPLE_RULES, pct20Above9000]
    expect(nextCartOffer(priceCart(SAMPLE_CART, rules), rules)).toMatchObject({ ruleId: 'RULE-05', shortfall: 3068, offer: '20% off' })
  })

  it('ignores a higher-minimum offer that would not beat the one already applied', () => {
    const pct5Above9000 = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 5, stackable: false, minCartValue: 9000 })
    const rules = [...SAMPLE_RULES, pct5Above9000]
    expect(nextCartOffer(priceCart(SAMPLE_CART, rules), rules)).toBeNull()
  })

  it('returns null when there are no cart rules', () => {
    expect(nextCartOffer(priceCart(withoutVase, SAMPLE_RULES.slice(0, 3)), SAMPLE_RULES.slice(0, 3))).toBeNull()
  })
})

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

  it('explains — instead of crashing — when a cart rule\'s discount rounds to nothing', () => {
    const tiny = makeRule({ ruleId: 'RULE-05', scope: 'cart', type: 'percentage', value: 0.1, stackable: false, minCartValue: 100 })
    const preview = previewRule([item({ platform: 'Noon', basePrice: 449 })], SAMPLE_RULES, tiny)
    expect(preview.changed).toBe(false)
    expect(preview.reason).toBe("On a Rs.449 cart, its discount rounds to less than Rs.1, so it wouldn't change the price.")
  })

  it('explains when an item rule\'s discount rounds to nothing on the matching items', () => {
    const tiny = makeRule({ ruleId: 'RULE-05', scope: 'platform', appliesTo: 'Noon', type: 'percentage', value: 0.1, stackable: false })
    expect(previewRule([item({ platform: 'Noon', basePrice: 449 })], [], tiny).reason)
      .toBe("On the matching items, its discount rounds to less than Rs.1, so it wouldn't change the price.")
  })

  it('returns null when there is no cart', () => {
    expect(previewRule([], SAMPLE_RULES, SAMPLE_RULES[0])).toBeNull()
  })
})
