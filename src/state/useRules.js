/**
 * useRules.js
 *
 * The active discount rules. They come from two places: the uploaded rules
 * file, and rules added in plain English during the session. A new rules file
 * replaces only the file rules; added rules are kept (renumbered if their ID
 * now clashes) and can be removed individually.
 */

import { useMemo, useState } from 'react'
import { parseRulesCSV } from '../inputs/csvInput.js'
import { nextRuleId, renumberAddedRules } from '../inputs/ruleIds.js'

export function useRules() {
  const [fileRules, setFileRules] = useState([])
  const [addedRules, setAddedRules] = useState([])
  const [errors, setErrors] = useState([])
  const [fileName, setFileName] = useState('')

  const rules = useMemo(() => [...fileRules, ...addedRules], [fileRules, addedRules])
  const addedIds = useMemo(() => new Set(addedRules.map((r) => r.ruleId)), [addedRules])

  /** A file that yields nothing usable never wipes out the rules already loaded. */
  function loadRulesCsv(csvText, name) {
    const { data, errors: rowErrors } = parseRulesCSV(csvText)
    if (data.length === 0) {
      setErrors(fileRules.length > 0 ? [...rowErrors, 'Nothing was loaded from this file, so the previous rules are still active.'] : rowErrors)
      return
    }
    setFileRules(data)
    setAddedRules((prev) => renumberAddedRules(data, prev))
    setErrors(rowErrors)
    setFileName(name)
  }

  /** Adds a confirmed plain-English rule. Its ID was chosen at parse time; re-check in case rules changed since. */
  function addRule(rule) {
    const clashes = rules.some((r) => r.ruleId === rule.ruleId)
    setAddedRules((prev) => [...prev, clashes ? { ...rule, ruleId: nextRuleId(rules) } : rule])
  }

  function removeRule(ruleId) {
    setAddedRules((prev) => prev.filter((r) => r.ruleId !== ruleId))
  }

  return { rules, fileRules, addedRules, addedIds, errors, fileName, loadRulesCsv, addRule, removeRule }
}
