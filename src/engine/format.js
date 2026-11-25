/** Formats whole rupees the way an Indian checkout shows them: 5932 → "Rs.5,932". */
export function formatRupees(amount) {
  return `Rs.${amount.toLocaleString('en-IN')}`
}

/** "15% off" / "Rs.150 off" for a rule's value. */
export function formatRuleValue(rule) {
  return rule.type === 'percentage' ? `${rule.value}% off` : `${formatRupees(rule.value)} off`
}
