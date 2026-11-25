/**
 * nlRuleInput.js
 *
 * Input adapter: plain-English description → a DiscountRule awaiting confirmation.
 *
 *   text ─► POST /api/parse-rule (LLM, or the offline parser) ─► raw reply
 *        ─► interpretParserOutput(): read the JSON, check its shape,
 *           validateRule() — the same gate CSV rows go through — and add warnings
 *        ─► crossCheck(): when an LLM answered, compare with the rule-based reading
 *        ─► { status: 'ok', rule, assumptions, warnings } for the confirmation step
 *
 * Nothing the parser returns reaches the engine until it passes validateRule()
 * and the user confirms it. Failures come back as a status the UI can explain:
 *   unresolvable — the description is missing details (ask the user for them)
 *   unsupported  — it needs a condition the engine can't apply
 *   invalid      — the parser produced a rule that fails validation
 *   error        — the reply was unreadable or the request failed
 */

import { validateRule } from './validate.js'
import { nextRuleId } from './ruleIds.js'

export const PARSE_ENDPOINT = '/api/parse-rule'

const unique = (xs) => [...new Set(xs.filter(Boolean))].sort()
const sameName = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : [])

/** Brand and platform names from the current cart and rules — context for the parser. */
export function knownNames(rules, cartItems) {
  return {
    knownBrands: unique([...cartItems.map((i) => i.brand), ...rules.filter((r) => r.scope === 'brand').map((r) => r.appliesTo)]),
    knownPlatforms: unique([...cartItems.map((i) => i.platform), ...rules.filter((r) => r.scope === 'platform').map((r) => r.appliesTo)]),
  }
}

function readJson(output) {
  if (output && typeof output === 'object') return output
  if (typeof output !== 'string') return null
  const unfenced = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(unfenced)
  } catch {
    return null
  }
}

function sameRule(a, b) {
  return a.scope === b.scope && sameName(a.appliesTo, b.appliesTo) && a.type === b.type &&
    a.value === b.value && a.stackable === b.stackable && (a.minCartValue ?? null) === (b.minCartValue ?? null)
}

/** Non-blocking checks shown on the confirmation card. */
function warningsFor(rule, { rules, cartItems }) {
  const warnings = []

  if (rule.type === 'percentage' && rule.value < 1) {
    warnings.push(`This is only ${rule.value}% off. If you meant ${Math.round(rule.value * 100)}%, discard it and rephrase.`)
  }

  if (rule.scope !== 'cart' && cartItems.length > 0) {
    const values = unique(cartItems.map((i) => i[rule.scope]))
    if (!values.some((v) => sameName(v, rule.appliesTo))) {
      const target = rule.appliesTo.toLowerCase()
      const suggestion = values.find((v) => v.toLowerCase().includes(target) || target.includes(v.toLowerCase()))
      const where = rule.scope === 'brand' ? `from the brand "${rule.appliesTo}"` : `sold on "${rule.appliesTo}"`
      warnings.push(`No item in the current cart is ${where}, so this rule won't change any prices right now.` +
        (suggestion ? ` Did you mean "${suggestion}"?` : ''))
    }
  }

  const duplicate = rules.find((r) => sameRule(r, rule))
  if (duplicate) warnings.push(`This is the same as ${duplicate.ruleId}, which is already active.`)

  return warnings
}

/**
 * Turns the parser's raw reply into something the UI can act on. Pure — no network.
 * `rules` are the currently active rules (for the new ID and duplicate check);
 * `cartItems` is the current cart (for "matches nothing" warnings).
 */
export function interpretParserOutput(output, { rules = [], cartItems = [] } = {}) {
  const data = readJson(output)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'error', message: "The rule parser's reply couldn't be read. Try again, or rephrase the rule." }
  }

  const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : null

  if (data.status === 'unresolvable') {
    const missing = strings(data.missing)
    return {
      status: 'unresolvable',
      missing,
      message: message ?? `The description is missing some details${missing.length ? ` (${missing.join(', ')})` : ''}. Please be more specific.`,
    }
  }

  if (data.status === 'unsupported') {
    return { status: 'unsupported', message: message ?? 'This rule needs a condition the discount engine cannot apply.' }
  }

  if (data.status !== 'ok' || !data.rule || typeof data.rule !== 'object') {
    return { status: 'error', message: "The rule parser's reply wasn't in the expected format. Try again, or rephrase the rule." }
  }

  const r = data.rule
  const result = validateRule({
    ruleId: nextRuleId(rules),
    scope: r.scope,
    appliesTo: r.appliesTo,
    type: r.type,
    value: r.value,
    stackable: r.stackable,
    minCartValue: r.minCartValue, // validateRule treats 0 on an item rule as "no minimum"
  })

  if (result.errors) {
    return { status: 'invalid', errors: result.errors, message: 'The parsed rule failed validation, so it was not added.' }
  }

  return {
    status: 'ok',
    rule: result.parsed,
    assumptions: strings(data.assumptions),
    warnings: warningsFor(result.parsed, { rules, cartItems }),
  }
}

const FIELD_LABELS = {
  scope: 'scope', appliesTo: 'applies to', type: 'type', value: 'value', stackable: 'stackable', minCartValue: 'min cart value',
}

function show(field, value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'stackable') return value ? 'Yes' : 'No'
  if (field === 'value') return type === 'percentage' ? `${value}%` : `Rs.${value}`
  if (field === 'minCartValue') return `Rs.${value}`
  return String(value)
}

/**
 * Compares the LLM's validated rule with the offline parser's reading of the
 * same text. The offline parser is narrow but precise: when it can read a
 * description at all, it reads it literally, and it recognises conditions the
 * engine can't apply. So:
 *   both read a rule, same fields  → a reassuring note
 *   both read a rule, fields differ → a warning naming the fields
 *   offline flags "unsupported"     → a warning: the LLM may have dropped a condition
 *   offline can't account for words that look like a condition or a name
 *     ("only", "and", "Myntra")     → a warning naming them
 *   offline can't read it otherwise → nothing (expected for free-form phrasing)
 * Returns { warnings, note }.
 */
export function crossCheck(rule, offlineOutput) {
  if (!offlineOutput || typeof offlineOutput !== 'object') return { warnings: [], note: null }

  if (offlineOutput.status === 'unsupported') {
    return {
      warnings: [`A rule-based check flagged this description: "${offlineOutput.message}" Make sure the rule above doesn't leave out a condition.`],
      note: null,
    }
  }

  const suspicious = strings(offlineOutput.suspicious)
  if (offlineOutput.status !== 'ok' && suspicious.length > 0) {
    const words = suspicious.map((w) => `"${w}"`).join(', ')
    return {
      warnings: [`The description mentions ${words}, which the rule above may not reflect. Make sure it doesn't leave out a condition or a name.`],
      note: null,
    }
  }
  if (offlineOutput.status !== 'ok' || !offlineOutput.rule) return { warnings: [], note: null }

  const other = offlineOutput.rule
  const differences = Object.keys(FIELD_LABELS).filter((field) => {
    if (field === 'appliesTo') return !sameName(rule.appliesTo, other.appliesTo)
    return (rule[field] ?? null) !== (other[field] ?? null)
  })

  if (differences.length === 0) {
    return { warnings: [], note: 'A separate rule-based check read this description the same way.' }
  }
  const detail = differences
    .map((f) => `${FIELD_LABELS[f]} (LLM: ${show(f, rule[f], rule.type)}, rule-based: ${show(f, other[f], other.type)})`)
    .join('; ')
  return { warnings: [`A separate rule-based reading disagrees on ${detail}. Check this before adding.`], note: null }
}

/**
 * Sends the description to the parser endpoint and interprets the reply.
 * Never throws: network and server problems come back as { status: 'error' }.
 */
export async function parseRuleFromText(text, { rules = [], cartItems = [] } = {}, fetchImpl = fetch) {
  let response
  try {
    response = await fetchImpl(PARSE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...knownNames(rules, cartItems) }),
    })
  } catch {
    return { status: 'error', message: "Couldn't reach the rule parser. Check your connection and try again." }
  }

  const body = await response.json().catch(() => null)
  if (!response.ok || !body) {
    return { status: 'error', message: body?.error ?? `The rule parser failed (HTTP ${response.status}). Please try again.` }
  }

  const result = {
    ...interpretParserOutput(body.output, { rules, cartItems }),
    parser: body.parser ?? 'unknown',
    parserNote: body.parserNote ?? null,
    checkNote: null,
  }

  if (result.status === 'ok' && body.crossCheck) {
    const check = crossCheck(result.rule, body.crossCheck)
    result.warnings = [...result.warnings, ...check.warnings]
    result.checkNote = check.note
  }
  return result
}
