/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 * Inputs are assumed to be valid — every input path goes through src/inputs/validate.js.
 * All money is in whole rupees: each discount is rounded as it is applied.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string         — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string | null  — e.g. "Natura Casa", "Amazon India"; null for cart rules
 *   type:         "percentage" | "flat"
 *   value:        number         — percentage as integer (15 = 15%), flat in rupees
 *   stackable:    boolean
 *   minCartValue: number | null  — cart rules only: minimum cart total, inclusive
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartOffer {
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   lines:         { ruleId, label, amount, minCartValue }[]  — one per applied cart rule
 *   totalDiscount: number
 * }
 *
 * CartPricing {
 *   items:        DiscountResult[]
 *   baseTotal:    number            — sum of base prices
 *   subtotal:     number            — sum of final item prices, before any cart offer
 *   cartOffer:    CartOffer | null  — null when no cart rule's minimum is met
 *   total:        number            — what the customer pays
 *   totalSavings: number            — baseTotal - total
 * }
 */

import { formatRuleValue } from './format.js'

/**
 * Returns true if the rule applies to this cart item.
 * Cart rules never match an item; they are applied to the cart total instead.
 */
export function ruleMatchesItem(item, rule) {
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 * The discount is capped at the price: an offer can make an item free, never negative.
 */
export function calculateDiscountAmount(price, rule) {
  let amount = 0
  if (rule.type === 'percentage') {
    amount = Math.round(price * rule.value / 100)
  } else if (rule.type === 'flat') {
    amount = Math.round(rule.value)
  }
  return Math.min(Math.max(amount, 0), price)
}

/**
 * The selection logic shared by item offers and cart offers:
 *   1. Among non-stackable rules, the one giving the largest rupee saving wins.
 *      Ties go to the rule listed first.
 *   2. Stackable rules then apply on top, each on the already-reduced price.
 * Returns { price, applied: [{ rule, amount }], skipped: DiscountRule[] }.
 */
function pickAndApply(startPrice, rules) {
  const nonStackable = rules.filter((r) => !r.stackable)
  const stackable = rules.filter((r) => r.stackable)

  // Array.prototype.sort is stable, so equal savings keep their original order.
  const [winner, ...skipped] = [...nonStackable].sort(
    (a, b) => calculateDiscountAmount(startPrice, b) - calculateDiscountAmount(startPrice, a)
  )

  let price = startPrice
  const applied = []
  for (const rule of winner ? [winner, ...stackable] : stackable) {
    const amount = calculateDiscountAmount(price, rule)
    if (amount > 0) {
      price -= amount
      applied.push({ rule, amount })
    }
  }

  return { price, applied, skipped }
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
function ruleToReasoning(rule) {
  const scopeLabel = { brand: 'Brand', platform: 'Platform', cart: 'Cart' }[rule.scope] ?? 'Special'
  return `${scopeLabel} offer: ${formatRuleValue(rule)}`
}

/**
 * Applies the active discount rules to a single cart item.
 * Returns a DiscountResult.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))
  const { price, applied, skipped } = pickAndApply(item.basePrice, matchingRules)
  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules: applied.map(({ rule }) => rule.ruleId),
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: applied.length > 0
      ? applied.map(({ rule }) => ruleToReasoning(rule)).join(' + ')
      : 'No offers available',
  }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * Returns an array of DiscountResult objects.
 */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/**
 * Sums the final prices across all results.
 */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

/**
 * Applies cart-level rules to the cart subtotal (the sum of final item prices).
 * A cart rule qualifies when subtotal >= minCartValue. Qualifying rules then go
 * through the same best-saving / stacking logic as item rules.
 * Returns a CartOffer, or null when no cart rule qualifies.
 */
export function applyCartRules(subtotal, rules) {
  const qualifying = rules.filter((r) => r.scope === 'cart' && subtotal >= r.minCartValue)
  const { price, applied, skipped } = pickAndApply(subtotal, qualifying)
  if (applied.length === 0) return null

  return {
    appliedRules: applied.map(({ rule }) => rule.ruleId),
    skippedRules: skipped.map((r) => r.ruleId),
    lines: applied.map(({ rule, amount }) => ({
      ruleId: rule.ruleId,
      label: ruleToReasoning(rule),
      amount,
      minCartValue: rule.minCartValue,
    })),
    totalDiscount: subtotal - price,
  }
}

/**
 * Prices a whole cart: item offers first, then cart offers on the sum of the
 * final item prices. Returns a CartPricing.
 */
export function priceCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  const baseTotal = items.reduce((sum, r) => sum + r.basePrice, 0)
  const subtotal = cartTotal(items)
  const cartOffer = applyCartRules(subtotal, rules)
  const total = subtotal - (cartOffer ? cartOffer.totalDiscount : 0)

  return { items, baseTotal, subtotal, cartOffer, total, totalSavings: baseTotal - total }
}
