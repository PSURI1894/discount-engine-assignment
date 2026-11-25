/**
 * csvInput.js
 *
 * Input adapter: CSV text → DiscountRule[] / CartItem[].
 *
 * Papaparse handles CSV syntax; validate.js decides what counts as a valid rule
 * or item. A bad row is skipped and reported with its row number, so one typo
 * doesn't throw away the rest of the file.
 *
 * rules.csv columns: rule_id, scope, applies_to, type, value, stackable, min_cart_value
 *                    (min_cart_value is optional so older rule files still load)
 * cart.csv columns:  item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'
import { validateRule, validateCartItem } from './validate.js'

const RULE_COLUMNS = ['rule_id', 'scope', 'applies_to', 'type', 'value', 'stackable']
const CART_COLUMNS = ['item_id', 'product', 'brand', 'platform', 'base_price']

/**
 * Parses CSV text into header-keyed rows: { rows: [{ rowNum, row, syntaxError? }], fileError? }.
 * fileError is set when the file can't be used at all (wrong file, no rows).
 */
function readCsv(csvText, requiredColumns, fileKind) {
  const { data, errors, meta } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  const missing = requiredColumns.filter((c) => !(meta.fields ?? []).includes(c))
  if (missing.length > 0) {
    return { rows: [], fileError: `This doesn't look like a ${fileKind} file — missing column(s): ${missing.join(', ')}` }
  }
  if (data.length === 0) {
    return { rows: [], fileError: `The ${fileKind} file has no data rows` }
  }

  // A short row only leaves trailing fields empty; validation reports anything required.
  // Any other syntax problem (extra fields, broken quotes) makes the row unreliable.
  const syntaxErrors = new Map()
  for (const e of errors) {
    if (e.code !== 'TooFewFields' && e.row !== undefined) syntaxErrors.set(e.row, e.message)
  }

  return {
    rows: data.map((row, i) => ({ rowNum: i + 2, row, syntaxError: syntaxErrors.get(i) })), // row 1 is the header
  }
}

/** Validates each row, skipping and reporting bad or duplicate rows. */
function toObjects({ rows, fileError }, mapRow, validate, idField, kind) {
  if (fileError) return { data: [], errors: [fileError] }

  const data = []
  const errors = []
  const seenIds = new Map()

  for (const { rowNum, row, syntaxError } of rows) {
    if (syntaxError) {
      errors.push(`Row ${rowNum}: ${syntaxError}`)
      continue
    }
    const result = validate(mapRow(row))
    if (result.errors) {
      errors.push(`Row ${rowNum}: ${result.errors.join('; ')}`)
      continue
    }
    const id = result.parsed[idField]
    if (seenIds.has(id)) {
      errors.push(`Row ${rowNum}: duplicate ${kind} ID "${id}" (already used on row ${seenIds.get(id)})`)
      continue
    }
    seenIds.set(id, rowNum)
    data.push(result.parsed)
  }

  return { data, errors }
}

/** Parses rules.csv text. Returns { data: DiscountRule[], errors: string[] }. */
export function parseRulesCSV(csvText) {
  return toObjects(
    readCsv(csvText, RULE_COLUMNS, 'rules'),
    (r) => ({
      ruleId: r.rule_id,
      scope: r.scope,
      appliesTo: r.applies_to,
      type: r.type,
      value: r.value,
      stackable: r.stackable,
      minCartValue: r.min_cart_value,
    }),
    validateRule,
    'ruleId',
    'rule'
  )
}

/** Parses cart.csv text. Returns { data: CartItem[], errors: string[] }. */
export function parseCartCSV(csvText) {
  return toObjects(
    readCsv(csvText, CART_COLUMNS, 'cart'),
    (r) => ({
      itemId: r.item_id,
      product: r.product,
      brand: r.brand,
      platform: r.platform,
      basePrice: r.base_price,
    }),
    validateCartItem,
    'itemId',
    'item'
  )
}
