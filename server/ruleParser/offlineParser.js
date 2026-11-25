/**
 * offlineParser.js
 *
 * A deterministic, zero-cost stand-in for the LLM. It returns the same JSON
 * contract as the model (see prompt.js), so everything downstream —
 * validation, the confirmation step, the engine — runs identically.
 *
 * Used for local development and tests, as a clearly labelled fallback when no
 * LLM key is configured or the LLM is unavailable, and as a second opinion on
 * the LLM's reading.
 *
 * Design rule: it only returns a rule when it can account for EVERY word of the
 * description. A word it doesn't recognise might be a condition ("except",
 * "only", a name it doesn't know), and dropping a condition makes an offer
 * broader than intended — so it refuses instead of guessing. It understands
 * common phrasings (including every example in the brief) and is measured
 * against server/ruleParser/evalCases.js.
 */

// ── Conditions the engine cannot apply ───────────────────────────
// Each list is a set of regex phrases matched as whole words. A match means the
// description needs a condition the rule model can't hold, so it is refused.

/** A case-insensitive regex matching any of the phrases as whole words. */
const anyOf = (phrases) => new RegExp(`\\b(?:${phrases.join('|')})\\b`, 'i')

const MONTHS = [
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'apr', 'jun', 'jul', 'aug', 'sept?', 'oct', 'nov', 'dec', // "may" and "mar" are left out: too common as words
]
const TIME_LIMITS = [
  'until', 'till', 'valid (?:till|until|through|from)', 'expires?', 'expiry',
  'today', 'tomorrow', 'tonight', 'this (?:week|weekend|month|year)', '(?:next|for) \\d+ (?:days?|weeks?|months?)',
  'weekends?', 'weekdays?', '(?:mon|tues|wednes|thurs|fri|satur|sun)days?',
  'diwali', 'holi', 'festive', 'festival', 'season', 'sale', ...MONTHS,
  'before noon', 'after noon', 'afternoon', 'morning', 'evening', 'midnight', '\\d{1,2}\\s*(?:am|pm)', "o'clock", 'hours?',
]
const CUSTOMER_LIMITS = [
  'first[- ]time', 'new (?:customers?|users?|buyers?|shoppers?)', 'returning', 'existing customers?',
  'members?', 'membership', 'prime', 'loyal', 'loyalty', 'vip', 'students?', 'employees?', 'staff',
  'per (?:customer|person|user|order)', 'each customer', 'one per', 'limit \\d+',
]
const PAYMENT_METHODS = [
  'credit cards?', 'debit cards?', 'cards?', 'upi', 'wallets?', 'paytm', 'cash on delivery', 'cod',
  'bank', 'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'emi',
]
const QUANTITIES = [
  'buy \\d+', 'bogo', 'get \\d+ free', 'quantity', 'quantities',
  '\\d+\\s*(?:\\+\\s*|or more\\s+)?(?:items?|products?|pieces?|units?|things?|qty)', // "3 items", "3+ items", "2 or more products"
]
const CAPS = ['up to', 'upto', 'max', 'maximum', 'capped', 'at most']
const MAXIMUMS = ['under', 'below', 'less than', 'lower than']
const EXCLUSIONS = ['except', 'excluding', 'excludes?', 'excluded', 'other than', 'apart from', 'but not', 'not on']

const UNSUPPORTED_PATTERNS = [
  [anyOf(TIME_LIMITS), 'it has a time limit, and the engine applies rules for as long as they are active'],
  [anyOf(CUSTOMER_LIMITS), 'it targets a type of customer or limits how often it can be used, and the engine treats every customer and order the same'],
  [anyOf(PAYMENT_METHODS), "it depends on how the customer pays, which the engine doesn't know"],
  [anyOf(QUANTITIES), 'it depends on quantities, and the engine only supports brand, platform and cart-value rules'],
  [anyOf(CAPS), '"up to" or capped amounts don\'t say exactly how much to take off'],
  [anyOf(MAXIMUMS), 'it sets a maximum, and cart rules only support a minimum cart value'],
  [anyOf(EXCLUSIONS), 'it excludes something, and the engine has no exclusions'],
]

// ── Amounts ──────────────────────────────────────────────────────
const NUMBER_TOKEN = /(rs\.?\s*|₹\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)(\s*(?:k|thousand|lakhs?|lacs?|crores?|cr)\b)?(\s*\/-)?(\s*(?:%|percent\b|per cent\b))?(\s*(?:rupees|rs)\b\.?)?/gi
const MULTIPLIER = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7 }
const THRESHOLD_BEFORE = /(more than|above|over|at least|minimum(?: purchase| order| cart value| order value| value)?(?: of)?|min\.?|exceeds?|exceeding|greater than|reaches|crosses|worth|spends?|spending|purchase of|orders? of|carts? of|≥|>=|>)\s*$/i
const THRESHOLD_AFTER = /^\s*(?:or more|or above|and above|and more|\+|onwards)/i
const STRICT_THRESHOLD_CUE = /(more than|above|over|exceeds?|exceeding|greater than|>)\s*$/i
const THRESHOLD_WORDS = /\b(more than|above|over|at least|minimum(?: purchase| order| cart value| order value| value)?(?: of)?|min|exceeds?|exceeding|greater than|reaches|crosses|worth|spends?|spending|purchase of|or more|or above|and above|and more|onwards)\b|≥|>=|>|\+/gi
const CART_CUE = /\b(cart|carts|order|orders|basket|checkout|bill|purchase|spend)\b/i

// ── Stackability (negation-aware) ────────────────────────────────
const NEG = "(?:not|no|non|never|cannot|can't|cant|can not|do not|don't|does not|doesn't|is not|isn't|should not|shouldn't|will not|won't|must not|mustn't)"
const OFFERS = '(?:(?:any|all)\\s+)?(?:other\\s+)?(?:offers?|discounts?|deals?|promotions?|coupons?|promos?)'
const STACK_PATTERNS = [
  new RegExp(`\\b(${NEG}[\\s-]*(?:be[\\s-]+)?)?(?:stackable|stack(?:s|ing|ed)?|combinable|combin(?:e|es|ed)|club(?:s|bed|bable)?)(?:\\s+(?:with|alongside|on top of|in addition to)\\s+${OFFERS})?\\b`, 'gi'),
  new RegExp(`\\b(${NEG}\\s+(?:be\\s+)?)?(?:valid\\s+)?(?:with|alongside|on top of|in addition to)\\s+(?:any\\s+|all\\s+)?other\\s+(?:offers?|discounts?|deals?|promotions?|coupons?|promos?)\\b`, 'gi'),
]
const EXCLUSIVE = /\bexclusive\b/gi

// ── Words that carry no condition ────────────────────────────────
const FILLER = new Set((
  'a an the all any every everything anything entire whole off on in at to from for of by is are be can ' +
  'get gets take give make discount discounts flat offer items item products product goods brand brands ' +
  'platform platforms if when cart carts basket value total order orders bill purchase purchases checkout ' +
  'sold applies apply applicable you your'
).split(' '))
// Leftover words worth pointing out when comparing with an LLM's reading.
const RISKY = new Set('only and or but not no without with unless between plus also'.split(' '))

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Tracks which characters of the description have been explained. */
function createTracker(text) {
  let masked = text
  return {
    get text() { return masked },
    consume(start, end) { masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end) },
    /** Runs a global regex over what's left, consuming every match. */
    consumeAll(regex, onMatch) {
      for (const m of [...masked.matchAll(regex)]) {
        onMatch?.(m)
        this.consume(m.index, m.index + m[0].length)
      }
    },
  }
}

function readNumbers(text) {
  const tokens = []
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const [whole, currency, digits, multiplier, slashDash, percent, rupeesAfter] = m
    const before = text.slice(Math.max(0, m.index - 40), m.index)
    const after = text.slice(m.index + whole.length)
    const scale = multiplier ? MULTIPLIER[multiplier.trim().toLowerCase()] : 1
    tokens.push({
      amount: parseFloat(digits.replace(/,/g, '')) * scale,
      isPercent: Boolean(percent),
      isThreshold: !percent && (THRESHOLD_BEFORE.test(before) || THRESHOLD_AFTER.test(after)),
      looksLikeMoney: Boolean(currency || rupeesAfter || slashDash) || /^\s*(?:(?:flat\s+)?off\b|flat\b)/i.test(after),
      strictCue: STRICT_THRESHOLD_CUE.test(before),
      hasCurrency: Boolean(currency || rupeesAfter),
      raw: whole.trim(),
      start: m.index,
      end: m.index + whole.length,
    })
  }
  return tokens
}

/** Every known brand/platform mentioned (full name, or a distinctive first word). */
function findKnownNames(tracker, names) {
  const found = []
  const sorted = [...names].sort((a, b) => b.length - a.length)
  for (const name of sorted) {
    tracker.consumeAll(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi'), () => {
      if (!found.some((f) => f.name === name)) found.push({ name, assumed: null })
    })
  }
  for (const name of sorted) {
    const firstWord = name.split(/\s+/)[0]
    if (firstWord.length < 4 || found.some((f) => f.name === name)) continue
    tracker.consumeAll(new RegExp(`\\b${escapeRegex(firstWord)}\\b`, 'gi'), () => {
      if (!found.some((f) => f.name === name)) found.push({ name, assumed: `"${firstWord}" matched to "${name}" from the current cart` })
    })
  }
  return found
}

/** A name the merchant spelled out, e.g. "for the Acme brand" or "on all Myntra items". */
function findWrittenName(tracker) {
  const patterns = [
    ['brand', /\b(?:for|on) (?:the )?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*) brand\b/d],
    ['brand', /\bbrand ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*)/d],
    ['platform', /\b(?:on|from) (?:all )?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*) (?:items|products|orders)\b/d],
    ['platform', /\bplatform ([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*)/d],
  ]
  for (const [scope, pattern] of patterns) {
    const m = tracker.text.match(pattern)
    if (m) {
      const [start, end] = m.indices[1]
      tracker.consume(start, end)
      return { scope, name: m[1], assumed: null }
    }
  }
  return null
}

const reply = (status, fields) => ({ status, rule: null, assumptions: [], missing: [], message: '', unaccounted: [], suspicious: [], ...fields })
const unsupported = (message) => reply('unsupported', { message })
const list = (words) => words.map((w) => `"${w}"`).join(', ')

export function offlineParse(input, { knownBrands = [], knownPlatforms = [] } = {}) {
  const text = input.replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim()

  for (const [pattern, reason] of UNSUPPORTED_PATTERNS) {
    if (pattern.test(text)) return unsupported(`This rule can't be added because ${reason}.`)
  }

  const tracker = createTracker(text)

  // Amounts
  const numbers = readNumbers(text)
  for (const n of numbers) tracker.consume(n.start, n.end)
  const thresholds = numbers.filter((n) => n.isThreshold)
  const discounts = numbers.filter((n) => n.isPercent || (!n.isThreshold && n.looksLikeMoney))
  if (discounts.length > 1 || thresholds.length > 1) {
    return unsupported('This mentions more than one amount. If one of them is a minimum cart value, say it like "Rs.500 off when the cart total is Rs.3,000 or more"; otherwise describe one rule at a time.')
  }
  tracker.consumeAll(THRESHOLD_WORDS)

  // Stackability
  let positive = 0
  let negative = 0
  for (const pattern of STACK_PATTERNS) {
    tracker.consumeAll(pattern, (m) => { if (m[1]) negative += 1; else positive += 1 })
  }
  tracker.consumeAll(EXCLUSIVE, () => { negative += 1 })

  // Who it applies to
  const brands = findKnownNames(tracker, knownBrands)
  const platforms = findKnownNames(tracker, knownPlatforms)
  if (brands.length > 1 || platforms.length > 1) {
    const names = brands.length > 1 ? brands : platforms
    return unsupported(`A rule can only apply to one ${brands.length > 1 ? 'brand' : 'platform'} (this mentions ${names.map((n) => `"${n.name}"`).join(' and ')}). Add one rule for each.`)
  }
  if (brands.length && platforms.length) {
    return unsupported(`An offer can apply to a brand or to a platform, not to both together ("${brands[0].name}" on "${platforms[0].name}").`)
  }
  const known = brands[0] ? { scope: 'brand', ...brands[0] } : platforms[0] ? { scope: 'platform', ...platforms[0] } : null
  const itemTarget = known ?? findWrittenName(tracker)
  const isCart = thresholds.length > 0 || (!itemTarget && CART_CUE.test(text))

  if (isCart && itemTarget) {
    return unsupported(`A minimum cart value can't be attached to a ${itemTarget.scope} offer. Use either a ${itemTarget.scope} offer or a whole-cart offer.`)
  }

  // Anything left unexplained?
  const firstWord = text.match(/[A-Za-z]+/)?.[0]
  const leftover = (tracker.text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) ?? [])
    .map((w) => w.replace(/'s$/i, ''))
    .filter((w) => !FILLER.has(w.toLowerCase()))
  // "10% off Nordic Basics only" says nothing the rule doesn't. "only" is harmless when it is the
  // sole leftover; next to anything else ("on Myntra only") the other words still cause a refusal.
  const onlyRestates = leftover.length > 0 && leftover.every((w) => w.toLowerCase() === 'only')
  const unaccounted = onlyRestates ? [] : leftover
  const suspicious = unaccounted.filter((w) => RISKY.has(w.toLowerCase()) || (/^[A-Z]/.test(w) && w !== firstWord) || /\d/.test(w))
  const extra = { unaccounted, suspicious }

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
    return reply('unresolvable', { missing, message: `Please say ${missing.map((m) => asks[m]).join(' and ')}, for example ${example}.`, ...extra })
  }

  if (positive > 0 && negative > 0) {
    return reply('unresolvable', { missing: ['stackable'], message: 'The description says both that this offer stacks and that it doesn\'t. Which is it?', ...extra })
  }

  if (unaccounted.length > 0) {
    return reply('unresolvable', {
      message: `I couldn't account for ${list(unaccounted)} in this description, so I won't guess what it means — it might be a condition the engine can't apply. Supported rules look like "15% off Natura Casa products", "Rs.100 off all Flipkart items" or "10% off when the cart total is Rs.5,000 or more".`,
      ...extra,
    })
  }

  const assumptions = []
  if (itemTarget?.assumed) assumptions.push(itemTarget.assumed)
  if (onlyRestates) assumptions.push('"only" read as restating the rule, not adding a condition')

  const stackable = positive > 0
  if (positive === 0 && negative === 0) assumptions.push('Stackability not mentioned, so the rule does not stack with other offers')

  let minCartValue = null
  if (isCart) {
    minCartValue = thresholds[0].amount
    if (thresholds[0].strictCue) {
      const amount = minCartValue.toLocaleString('en-IN')
      assumptions.push(`'more than Rs.${amount}' treated as 'Rs.${amount} or more'`)
    }
  }

  if (!discount.isPercent && !discount.hasCurrency) {
    assumptions.push(`"${discount.raw}" read as Rs.${discount.amount.toLocaleString('en-IN')} off`)
  }

  return reply('ok', {
    rule: {
      scope: isCart ? 'cart' : itemTarget.scope,
      appliesTo: isCart ? null : itemTarget.name,
      type: discount.isPercent ? 'percentage' : 'flat',
      value: discount.amount,
      stackable,
      minCartValue,
    },
    assumptions,
  })
}
