/**
 * crossCheck.js
 *
 * A second opinion on an LLM's reading of a plain-English rule: compares the
 * LLM's validated rule with the rule-based parser's reading of the same text.
 * The rule-based parser is narrow but literal — when it can read a description
 * at all, it accounts for every word — and it recognises conditions the engine
 * can't apply. So:
 *   both read a rule, same fields   → a reassuring note
 *   both read a rule, fields differ  → a warning naming the fields
 *   rule-based flags "unsupported"   → a warning: the LLM may have dropped a condition
 *   rule-based finds it contradictory about stacking → a warning to check that field
 *   rule-based can't account for words that look like a condition or a name
 *     ("only", "and", "Myntra")      → a warning naming them
 *   rule-based can't read it otherwise → nothing (expected for free-form phrasing)
 */

import { formatRupees as rs, formatRuleValue } from '../engine/format.js'

const FIELD_LABELS = {
  scope: 'scope', appliesTo: 'applies to', type: 'type', value: 'value', stackable: 'stackable', minCartValue: 'min cart value',
}

const sameName = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : [])

function show(field, rule) {
  const value = rule[field]
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'stackable') return value ? 'Yes' : 'No'
  if (field === 'value') return formatRuleValue(rule).replace(/ off$/, '')
  if (field === 'minCartValue') return rs(value)
  return String(value)
}

/** Returns { warnings: string[], note: string | null } for the confirmation card. */
export function crossCheck(rule, offlineOutput) {
  if (!offlineOutput || typeof offlineOutput !== 'object') return { warnings: [], note: null }

  if (offlineOutput.status === 'unsupported') {
    return {
      warnings: [`A rule-based check flagged this description: "${offlineOutput.message}" Make sure the rule above doesn't leave out a condition.`],
      note: null,
    }
  }

  // The rule-based parser found the description contradictory about stacking
  // (e.g. "exclusive" and "stackable"): an LLM may have silently picked one side.
  if (offlineOutput.status === 'unresolvable' && strings(offlineOutput.missing).includes('stackable')) {
    return {
      warnings: [`A rule-based check found this description contradictory: "${offlineOutput.message}" Check the Stackable field before adding.`],
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
    .map((f) => `${FIELD_LABELS[f]} (LLM: ${show(f, rule)}, rule-based: ${show(f, other)})`)
    .join('; ')
  return { warnings: [`A separate rule-based reading disagrees on ${detail}. Check this before adding.`], note: null }
}
