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

export const RULE_SCOPES = ['brand', 'platform']
export const RULE_TYPES = ['percentage', 'flat']

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''
const text = (v) => (isBlank(v) ? '' : String(v).trim())
const orList = (xs) => xs.map((x) => `"${x}"`).join(' or ')

/**
 * Parses numbers as people write them: 1299, "1,299", "Rs.1,299", "₹ 1,299.00", "15%".
 * Returns null when the input is not a plain non-negative number.
 */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = text(v).replace(/^(rs\.?|inr|₹)/i, '').replace(/[,\s%]/g, '')
  return /^\d+(\.\d+)?$/.test(cleaned) ? parseFloat(cleaned) : null
}

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
 * Input fields: ruleId, scope, appliesTo, type, value, stackable (strings or typed values).
 */
export function validateRule(raw) {
  const errors = []
  const ruleId = text(raw.ruleId)
  const scope = text(raw.scope).toLowerCase()
  const appliesTo = text(raw.appliesTo)
  const type = text(raw.type).toLowerCase()
  const value = parseNumber(raw.value)
  const stackable = parseBoolean(raw.stackable)

  if (!ruleId) errors.push('rule ID is missing')

  if (!RULE_SCOPES.includes(scope)) {
    errors.push(`scope must be ${orList(RULE_SCOPES)}, got "${text(raw.scope)}"`)
  } else if (!appliesTo) {
    errors.push(`a ${scope} rule must say which ${scope} it applies to`)
  }

  if (!RULE_TYPES.includes(type)) {
    errors.push(`type must be ${orList(RULE_TYPES)}, got "${text(raw.type)}"`)
  }

  if (value === null || value <= 0) {
    errors.push(`value must be a positive number, got "${text(raw.value)}"`)
  } else if (type === 'percentage' && value > 100) {
    errors.push(`a percentage discount cannot exceed 100, got "${text(raw.value)}"`)
  }

  if (stackable === null) {
    errors.push(`stackable must be true or false, got "${text(raw.stackable)}"`)
  }

  if (errors.length > 0) return { errors }
  return { parsed: { ruleId, scope, appliesTo, type, value, stackable } }
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
