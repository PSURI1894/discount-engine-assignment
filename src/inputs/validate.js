/**
 * validate.js
 *
 * The single gate between untrusted input and the discount engine.
 *
 * Every input adapter (CSV today; plain-English rules and PDF carts next)
 * converts its raw data into a plain object using the engine's field names and
 * passes it through these validators. The engine itself assumes it is handed
 * well-formed DiscountRule and CartItem objects, so adding a new input mode
 * never requires touching the engine.
 *
 * Validators return { parsed } when the input is valid, or { errors: string[] }.
 */

export const RULE_SCOPES = ['brand', 'platform', 'cart']
export const RULE_TYPES = ['percentage', 'flat']

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''
const text = (v) => (isBlank(v) ? '' : String(v).trim())
const orList = (xs) => xs.map((x) => `"${x}"`).join(' or ')

/**
 * Parses numbers as people write them: 1299, "1,299", "Rs.1,299", "₹ 1,299.00", "Rs.849/-", "15%".
 * Returns null when the input is not a plain non-negative number.
 */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = text(v).replace(/^(rs\.?|inr|₹)/i, '').replace(/\/-$/, '').replace(/[,\s%]/g, '')
  return /^\d+(\.\d+)?$/.test(cleaned) ? parseFloat(cleaned) : null
}

// What "applies to" may say on a cart rule — anything narrower would be dropped.
const WHOLE_CART = /^(entire cart|whole cart|cart|all|all items|everything|any)$/i

/** Accepts true/false, yes/no, y/n, 1/0. Returns null for anything else rather than guessing. */
export function parseBoolean(v) {
  if (typeof v === 'boolean') return v
  const s = text(v).toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return true
  if (['false', 'no', 'n', '0'].includes(s)) return false
  return null
}

/**
 * Validates a candidate discount rule.
 * Input fields: ruleId, scope, appliesTo, type, value, stackable, minCartValue
 * (strings or typed values).
 *
 * Conditions are never dropped silently, because that would make an offer
 * broader than intended: a cart rule can't be limited to a brand or platform,
 * and a brand or platform rule can't carry a minimum cart value.
 */
export function validateRule(raw) {
  const errors = []
  const ruleId = text(raw.ruleId)
  const scope = text(raw.scope).toLowerCase()
  const appliesTo = text(raw.appliesTo)
  const type = text(raw.type).toLowerCase()
  const valueText = text(raw.value)
  const value = parseNumber(raw.value)
  const stackable = parseBoolean(raw.stackable)
  const minCartValue = parseNumber(raw.minCartValue)
  // Spreadsheet exports often put 0 in an unused column; on item rules that means "no minimum".
  const hasMinCartValue = !isBlank(raw.minCartValue) && !(scope !== 'cart' && minCartValue === 0)

  if (!ruleId) errors.push('rule ID is missing')

  if (!RULE_SCOPES.includes(scope)) {
    errors.push(`scope must be ${orList(RULE_SCOPES)}, got "${text(raw.scope)}"`)
  } else if (scope === 'cart') {
    if (appliesTo && !WHOLE_CART.test(appliesTo)) {
      errors.push(`a cart rule applies to the whole cart, so it can't be limited to "${appliesTo}"`)
    }
    if (!hasMinCartValue) {
      errors.push('a cart rule needs a minimum cart value')
    } else if (minCartValue === null || minCartValue <= 0) {
      errors.push(`minimum cart value must be a positive number, got "${text(raw.minCartValue)}"`)
    }
  } else {
    if (!appliesTo) errors.push(`a ${scope} rule must say which ${scope} it applies to`)
    if (hasMinCartValue) errors.push(`a minimum cart value only applies to cart rules, not ${scope} rules`)
  }

  if (!RULE_TYPES.includes(type)) {
    errors.push(`type must be ${orList(RULE_TYPES)}, got "${text(raw.type)}"`)
  }

  if (value === null || value <= 0) {
    errors.push(`value must be a positive number, got "${valueText}"`)
  } else if (type === 'percentage' && /^(rs|inr|₹)/i.test(valueText)) {
    errors.push(`value "${valueText}" is in rupees, but the type is percentage`)
  } else if (type === 'flat' && valueText.includes('%')) {
    errors.push(`value "${valueText}" is a percentage, but the type is flat`)
  } else if (type === 'percentage' && value > 100) {
    errors.push(`a percentage discount cannot exceed 100, got "${valueText}"`)
  }

  if (stackable === null) {
    errors.push(`stackable must be true or false, got "${text(raw.stackable)}"`)
  }

  if (errors.length > 0) return { errors }

  const isCart = scope === 'cart'
  return {
    parsed: {
      ruleId,
      scope,
      appliesTo: isCart ? null : appliesTo,
      type,
      value,
      stackable,
      minCartValue: isCart ? minCartValue : null,
    },
  }
}

/**
 * Validates a candidate cart item.
 * Input fields: itemId, product, brand, platform, basePrice.
 */
export function validateCartItem(raw) {
  const errors = []
  const fields = { itemId: 'item ID', product: 'product', brand: 'brand', platform: 'platform' }
  const parsed = {}

  for (const [key, label] of Object.entries(fields)) {
    parsed[key] = text(raw[key])
    if (!parsed[key]) errors.push(`${label} is missing`)
  }

  const basePrice = parseNumber(raw.basePrice)
  if (basePrice === null || basePrice <= 0) {
    errors.push(`base price must be a positive number, got "${text(raw.basePrice)}"`)
  }

  if (errors.length > 0) return { errors }
  return { parsed: { ...parsed, basePrice: Math.round(basePrice) } }
}
