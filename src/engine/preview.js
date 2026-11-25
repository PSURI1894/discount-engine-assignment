/**
 * preview.js
 *
 * "What would this rule change?" — prices the cart with and without a candidate
 * rule and reports the difference. Built on priceCart(); it does not change how
 * discounts are calculated.
 */

import { priceCart, ruleMatchesItem } from './discountEngine.js'
import { formatRupees as rs } from './format.js'

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
