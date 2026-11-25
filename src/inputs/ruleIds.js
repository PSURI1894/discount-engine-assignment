/**
 * ruleIds.js
 *
 * Rule IDs for rules added during the session, kept unique alongside the IDs
 * that come from an uploaded rules file.
 */

const idNumber = (ruleId) => {
  const m = /^RULE-(\d+)$/i.exec(ruleId ?? '')
  return m ? Number(m[1]) : 0
}

/** The next free "RULE-NN" after the highest one in use. */
export function nextRuleId(rules) {
  const max = rules.reduce((m, r) => Math.max(m, idNumber(r.ruleId)), 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}

/**
 * When a new rules file arrives, any added rule whose ID now clashes with a
 * file rule gets the next free ID, so every active rule stays uniquely named.
 */
export function renumberAddedRules(fileRules, addedRules) {
  const result = []
  for (const rule of addedRules) {
    const taken = [...fileRules, ...result]
    const clashes = taken.some((r) => r.ruleId.toUpperCase() === rule.ruleId.toUpperCase())
    result.push(clashes ? { ...rule, ruleId: nextRuleId([...taken, ...addedRules]) } : rule)
  }
  return result
}
