/**
 * offlineParser.js
 *
 * A deterministic, zero-cost stand-in for the LLM. It returns exactly the same
 * JSON contract as the model (see prompt.js), so everything downstream —
 * validation, the confirmation step, the engine — runs identically.
 *
 * Used for local development and tests, and as a clearly labelled fallback when
 * no LLM key is configured or the LLM is unavailable. It understands common
 * phrasings (including every example in the brief); it is not a substitute for
 * the model on arbitrary text, and it errs towards "unresolvable" or
 * "unsupported" rather than guessing.
 */

const UNSUPPORTED_PATTERNS = [
  [/\b(until|till|valid (?:till|until|through)|expires?|today|tomorrow|tonight|this (?:week|weekend|month)|weekends?|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|diwali|festive)\b/i,
    'it has a time limit, and the engine applies rules for as long as they are active'],
  [/\b(first[- ]time|new (?:customers?|users?|buyers?)|members?|prime|loyalty|students?|employees?)\b/i,
    'it targets a type of customer, and the engine treats every customer the same'],
  [/\b(buy \d+|bogo|get \d+ free|\d+\s*(?:or more\s+)?(?:items|units|pieces))\b/i,
    'it depends on quantities, and the engine only supports brand, platform and cart-value rules'],
  [/\b(up to|upto|max(?:imum)?|capped)\b/i,
    '"up to" or capped amounts don\'t say exactly how much to take off'],
]

const THRESHOLD_BEFORE = /(more than|above|over|at least|minimum(?: of)?|min\.?|exceeds?|exceeding|greater than|reaches|crosses|worth|≥|>=|>)\s*(?:of\s*)?$/i
const THRESHOLD_AFTER = /^\s*(?:or more|or above|and above|\+)/i
const STRICT_THRESHOLD_CUE = /(more than|above|over|exceeds?|exceeding|greater than|>)\s*(?:of\s*)?$/i
const CART_CUE = /\b(cart|carts|order|orders|basket|checkout|bill|purchase|spend)\b/i
const STACK_NEGATIVE = /\b(not stackable|non[- ]?stackable|can(?:not|'t) be combined|cannot stack|does(?:n't| not) stack|exclusive)\b/i
const STACK_POSITIVE = /\b(stackable|stacks?|stacking|combinable|combined? with|on top of|in addition to|with other offers)\b/i

const NUMBER_TOKEN = /(rs\.?\s*|₹\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)(\s*k\b)?(\s*(?:%|percent\b|per cent\b))?/gi

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Finds every number in the text and classifies it as a percentage, a threshold or a flat amount. */
function readNumbers(text) {
  const tokens = []
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const [whole, currency, digits, thousands, percent] = m
    const before = text.slice(Math.max(0, m.index - 30), m.index)
    const after = text.slice(m.index + whole.length)
    const amount = parseFloat(digits.replace(/,/g, '')) * (thousands ? 1000 : 1)
    const isPercent = Boolean(percent)
    const isThreshold = !isPercent && (THRESHOLD_BEFORE.test(before) || THRESHOLD_AFTER.test(after))
    const looksLikeMoney = Boolean(currency) || /^\s*(?:rupees|rs\b|(?:flat\s+)?off\b|flat\b)/i.test(after)
    tokens.push({ amount, isPercent, isThreshold, looksLikeMoney, strictCue: STRICT_THRESHOLD_CUE.test(before), raw: whole.trim() })
  }
  return tokens
}

/** Finds the longest known name mentioned in the text, or a known name the text abbreviates. */
function findKnownName(text, names) {
  const lower = text.toLowerCase()
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const exact = sorted.find((n) => new RegExp(`\\b${escapeRegex(n.toLowerCase())}\\b`).test(lower))
  if (exact) return { name: exact, assumed: null }
  for (const n of sorted) {
    const firstWord = n.split(/\s+/)[0].toLowerCase()
    if (firstWord.length >= 4 && new RegExp(`\\b${escapeRegex(firstWord)}\\b`).test(lower)) {
      return { name: n, assumed: `"${n.split(/\s+/)[0]}" matched to "${n}" from the current cart` }
    }
  }
  return null
}

/** Picks up a name the merchant spelled out, e.g. "for the Acme brand" or "on all Myntra items". */
function findWrittenName(text) {
  const brand = text.match(/\b(?:for|on) (?:the )?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*) brand\b/) ||
    text.match(/\bbrand ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*)/)
  if (brand) return { scope: 'brand', name: brand[1] }
  const platform = text.match(/\b(?:on|from) (?:all )?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*) (?:items|products|orders)\b/) ||
    text.match(/\bplatform ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*)/)
  if (platform) return { scope: 'platform', name: platform[1] }
  return null
}

const unresolvable = (missing, message) => ({ status: 'unresolvable', rule: null, assumptions: [], missing, message })
const unsupported = (message) => ({ status: 'unsupported', rule: null, assumptions: [], missing: [], message })

export function offlineParse(text, { knownBrands = [], knownPlatforms = [] } = {}) {
  for (const [pattern, reason] of UNSUPPORTED_PATTERNS) {
    if (pattern.test(text)) return unsupported(`This rule can't be added because ${reason}.`)
  }

  const numbers = readNumbers(text)
  const thresholds = numbers.filter((n) => n.isThreshold)
  const discounts = numbers.filter((n) => n.isPercent || (!n.isThreshold && n.looksLikeMoney))

  if (discounts.length > 1 || thresholds.length > 1) {
    return unsupported('This looks like more than one rule. Please describe one rule at a time.')
  }

  const brand = findKnownName(text, knownBrands)
  const platform = findKnownName(text, knownPlatforms)
  if (brand && platform) {
    return unsupported(`An offer can apply to a brand or to a platform, not to both together ("${brand.name}" on "${platform.name}").`)
  }

  const written = brand || platform ? null : findWrittenName(text)
  const itemTarget = brand ? { scope: 'brand', ...brand } : platform ? { scope: 'platform', ...platform } : written
  const isCart = thresholds.length > 0 || (!itemTarget && CART_CUE.test(text))

  if (isCart && itemTarget) {
    return unsupported(`A minimum cart value can't be attached to a ${itemTarget.scope} offer. Use either a ${itemTarget.scope} offer or a whole-cart offer.`)
  }

  const discount = discounts[0]
  const missing = []
  if (!discount) missing.push('value')
  if (isCart && thresholds.length === 0) missing.push('minCartValue')
  if (!isCart && !itemTarget) missing.push('scope')

  if (missing.length > 0) {
    const example = isCart
      ? '"10% off when the cart total is Rs.5,000 or more"'
      : '"Rs.100 off all Flipkart items" or "15% off Natura Casa products"'
    const asks = {
      value: 'how much the discount is',
      minCartValue: 'the minimum cart value',
      scope: 'which brand or platform it is for (or that it applies to the whole cart above a minimum value)',
    }
    return unresolvable(missing, `Please say ${missing.map((m) => asks[m]).join(' and ')}, for example ${example}.`)
  }

  const assumptions = []
  if (itemTarget?.assumed) assumptions.push(itemTarget.assumed)

  let stackable = false
  if (STACK_NEGATIVE.test(text)) stackable = false
  else if (STACK_POSITIVE.test(text)) stackable = true
  else assumptions.push('Stackability not mentioned, so the rule does not stack with other offers')

  let minCartValue = null
  if (isCart) {
    minCartValue = thresholds[0].amount
    if (thresholds[0].strictCue) {
      assumptions.push(`'more than Rs.${minCartValue.toLocaleString('en-IN')}' treated as 'Rs.${minCartValue.toLocaleString('en-IN')} or more'`)
    }
  }

  if (!discount.isPercent && !/^(rs|₹|inr)/i.test(discount.raw)) {
    assumptions.push(`"${discount.raw}" read as Rs.${discount.amount.toLocaleString('en-IN')} off`)
  }

  return {
    status: 'ok',
    rule: {
      scope: isCart ? 'cart' : itemTarget.scope,
      appliesTo: isCart ? null : itemTarget.name,
      type: discount.isPercent ? 'percentage' : 'flat',
      value: discount.amount,
      stackable,
      minCartValue,
    },
    assumptions,
    missing: [],
    message: '',
  }
}
