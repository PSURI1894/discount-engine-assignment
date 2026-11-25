import { describe, it, expect } from 'vitest'
import { offlineParse } from './offlineParser.js'

const context = {
  knownBrands: ['LivSpace Pro', 'Natura Casa', 'Nordic Basics'],
  knownPlatforms: ['Amazon India', 'Flipkart', 'Noon'],
}
const parse = (text) => offlineParse(text, context)

describe('offlineParse — the brief\'s examples', () => {
  it('"20% off for Natura Casa brand, stackable with other offers"', () => {
    const out = parse('20% off for Natura Casa brand, stackable with other offers')
    expect(out.status).toBe('ok')
    expect(out.rule).toEqual({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null })
    expect(out.assumptions).toEqual([])
  })

  it('"Rs.100 flat discount on all Flipkart items"', () => {
    const out = parse('Rs.100 flat discount on all Flipkart items')
    expect(out.rule).toEqual({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null })
    expect(out.assumptions).toEqual(['Stackability not mentioned, so the rule does not stack with other offers'])
  })

  it('"10% off if cart value is more than Rs.5,000"', () => {
    const out = parse('10% off if cart value is more than Rs.5,000')
    expect(out.rule).toEqual({ scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 5000 })
    expect(out.assumptions).toContain("'more than Rs.5,000' treated as 'Rs.5,000 or more'")
  })

  it('"Give a discount for big orders" is unresolvable, and says what is missing', () => {
    const out = parse('Give a discount for big orders')
    expect(out.status).toBe('unresolvable')
    expect(out.rule).toBeNull()
    expect(out.missing).toEqual(['value', 'minCartValue'])
    expect(out.message).toMatch(/how much the discount is and the minimum cart value/)
  })
})

describe('offlineParse — other phrasings', () => {
  it('matches known names regardless of case', () => {
    expect(parse('15% off natura casa products').rule.appliesTo).toBe('Natura Casa')
  })

  it('matches a shortened platform name and records the assumption', () => {
    const out = parse('Rs.50 off on Amazon')
    expect(out.rule.appliesTo).toBe('Amazon India')
    expect(out.assumptions[0]).toMatch(/"Amazon" matched to "Amazon India"/)
  })

  it('reads ₹, "k" and "at least" thresholds without adding a "more than" assumption', () => {
    const out = parse('5% off orders of at least ₹2.5k')
    expect(out.rule).toMatchObject({ scope: 'cart', value: 5, minCartValue: 2500 })
    expect(out.assumptions.some((a) => a.includes('more than'))).toBe(false)
  })

  it('honours "not stackable"', () => {
    expect(parse('10% off Noon items, not stackable').rule.stackable).toBe(false)
  })

  it('keeps an unknown, spelled-out platform name as written', () => {
    expect(parse('Rs.200 off on all Myntra items').rule).toMatchObject({ scope: 'platform', appliesTo: 'Myntra' })
  })

  it('passes a percentage over 100 through unchanged, for validation to reject', () => {
    expect(parse('150% off Flipkart items').rule.value).toBe(150)
  })
})

describe('offlineParse — refuses rather than guessing', () => {
  it.each([
    ['15% off Natura Casa on Flipkart only', /brand or to a platform, not to both/],
    ['10% off Natura Casa if the cart is above Rs.3,000', /can't be attached to a brand offer/],
    ['20% off Flipkart items until Sunday', /time limit/],
    ['Rs.100 off for first-time buyers on Noon', /type of customer/],
    ['Buy 2 get 1 free on Natura Casa', /quantities/],
    ['Up to 30% off Amazon India', /up to/],
    ['15% off Flipkart and 10% off Noon', /more than one rule/],
  ])('"%s" → unsupported', (text, reason) => {
    const out = parse(text)
    expect(out.status).toBe('unsupported')
    expect(out.message).toMatch(reason)
  })

  it('asks which brand or platform when none is given', () => {
    const out = parse('10% off everything nice')
    expect(out.status).toBe('unresolvable')
    expect(out.missing).toEqual(['scope'])
  })

  it('asks for the amount when there is none', () => {
    const out = parse('Discount on Flipkart items')
    expect(out.status).toBe('unresolvable')
    expect(out.missing).toEqual(['value'])
  })
})
