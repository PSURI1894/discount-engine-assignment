/**
 * preview.js
 *
 * What-if questions answered with the engine, without changing how discounts
 * are calculated:
 *   previewRule()   — what would adding this rule change?
 *   nextCartOffer() — how much more would this cart need for a (better) cart offer?
 */

import { priceCart, ruleMatchesItem, applyCartRules } from './discountEngine.js'
import { formatRupees as rs, formatRuleValue } from './format.js'

/**
 * The nearest cart offer this cart hasn't reached yet, if reaching it would give
 * a bigger cart discount than the cart gets now — e.g. a Rs.3,433 cart is Rs.567
 * short of RULE-04 (10% off at Rs.4,000). Like the offer itself, the minimum is
 * measured on the subtotal after item discounts.
 * Returns { ruleId, shortfall, minCartValue, offer } or null.
 */
export function nextCartOffer(pricing, rules) {
  const currentSaving = pricing.cartOffer?.totalDiscount ?? 0

  const reachable = rules
    .filter((r) => r.scope === 'cart' && r.minCartValue > pricing.subtotal)
    .map((rule) => {
      const atMinimum = applyCartRules(rule.minCartValue, rules)
      return {
        rule,
        shortfall: rule.minCartValue - pricing.subtotal,
        saving: atMinimum?.totalDiscount ?? 0,
        wouldApply: atMinimum?.appliedRules.includes(rule.ruleId) ?? false,
      }
    })
    .filter((c) => c.wouldApply && c.saving > currentSaving)
    .sort((a, b) => a.shortfall - b.shortfall)

  const next = reachable[0]
  if (!next) return null
  return { ruleId: next.rule.ruleId, shortfall: next.shortfall, minCartValue: next.rule.minCartValue, offer: formatRuleValue(next.rule) }
}

/** Differences between two pricings of the same cart. */
export function comparePricing(before, after) {
  const itemChanges = after.items
    .map((a, i) => ({ itemId: a.itemId, product: a.product, from: before.items[i].finalPrice, to: a.finalPrice }))
    .filter((c) => c.from !== c.to)

  const cartOfferFrom = before.cartOffer?.totalDiscount ?? 0
  const cartOfferTo = after.cartOffer?.totalDiscount ?? 0

  return {
    itemChanges,
    cartOfferChange: cartOfferFrom !== cartOfferTo ? { from: cartOfferFrom, to: cartOfferTo } : null,
    totalChange: before.total !== after.total ? { from: before.total, to: after.total } : null,
  }
}

function whyNoChange(rule, cartItems, before) {
  if (rule.scope === 'cart') {
    if (before.subtotal < rule.minCartValue) {
      return `The cart total before cart offers is ${rs(before.subtotal)}, below this rule's ${rs(rule.minCartValue)} minimum, so it doesn't apply yet.`
    }
    return `This cart already gets an equal or bigger cart offer (${before.cartOffer.appliedRules.join(', ')}), so this rule wouldn't change the price.`
  }
  if (!cartItems.some((item) => ruleMatchesItem(item, rule))) {
    return 'No items in the current cart match this rule.'
  }
  return 'The matching items already get an equal or better offer.'
}

/**
 * Previews adding `rule` to `rules` for the current cart.
 * Returns null when there is no cart to preview against.
 */
export function previewRule(cartItems, rules, rule) {
  if (cartItems.length === 0) return null
  const before = priceCart(cartItems, rules)
  const after = priceCart(cartItems, [...rules, rule])
  const diff = comparePricing(before, after)
  const changed = diff.itemChanges.length > 0 || diff.cartOfferChange !== null || diff.totalChange !== null
  return { ...diff, changed, reason: changed ? null : whyNoChange(rule, cartItems, before) }
}
