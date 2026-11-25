/**
 * pdfCartInput.js
 *
 * Input adapter: cart PDF → CartItem[].
 *
 * Expected layout (from the brief): optional title lines (e.g. "Order #OP-9921"),
 * a header row with Product, Brand, Platform and Base Price, then one item per
 * line. Columns are recovered from where the header words sit on the page, so
 * multi-word values like "Natura Casa" or "Amazon India" stay intact — splitting
 * on spaces can't tell where one column ends and the next begins.
 *
 * Every data row goes through validateCartItem() — the same gate as cart.csv.
 * Rows that fail are skipped with a reason; separators, totals and page
 * footers are ignored. The caller decides what to do with a partial result.
 */

import { validateCartItem, parseNumber } from './validate.js'
import { extractPdfLines, PdfReadError } from './pdfText.js'

export const MAX_PDF_BYTES = 5 * 1024 * 1024

// Recognised headings. Several can mean the price; the lowest rank wins, so MRP
// is only used when there is no "Base Price" or "Price" column.
const COLUMNS = [
  { key: 'product', pattern: /^(product|product name|item|item name|description)$/i },
  { key: 'brand', pattern: /^brand$/i },
  { key: 'platform', pattern: /^(platform|marketplace|channel)$/i },
  { key: 'basePrice', rank: 0, pattern: /^base price(\s*\(.*\))?$/i },
  { key: 'basePrice', rank: 1, pattern: /^(price|selling price|unit price)(\s*\(.*\))?$/i },
  { key: 'basePrice', rank: 2, pattern: /^mrp(\s*\(.*\))?$/i },
  { key: 'quantity', pattern: /^(qty|quantity|units)$/i },
]
const REQUIRED = { product: 'Product', brand: 'Brand', platform: 'Platform', basePrice: 'Base Price' }
const EXPECTED = Object.values(REQUIRED).join(', ')

const SEPARATOR = /^[\s\-–—_=─━.·•*|]+$/
// Summary/footer wording. Only treated as a non-item line when the row has neither
// a brand nor a platform — so a product called "Item Holder" or "Total Gym Mat" is still an item.
const NON_ITEM = /^(sub-?total|total|grand total|order total|net payable|amount( due| paid)?|items?\b|page \d+|thank you|delivery|shipping|tax|gst|discount|coupon)/i
// "Order #OP-9921", "Order No: OP-9921" — the reference must contain a digit, so "Order Summary" isn't one.
const ORDER_REF = /order\s*(?:no\.?|number|id|ref(?:erence)?)?\s*[:#.-]?\s*#?\s*([a-z]*-?\d[\w-]*)/i

/**
 * Splits a line's text pieces into cells: runs of two or more spaces separate
 * cells (plain-text style PDFs), and pieces about one space apart are joined
 * (PDFs that store each word separately).
 */
function toCells(line) {
  const pieces = []
  for (const item of line.items) {
    const charWidth = item.str.length > 0 ? item.width / item.str.length : 0
    for (const m of item.str.matchAll(/\S+(?: \S+)*/g)) {
      pieces.push({
        text: m[0],
        x: item.x + m.index * charWidth,
        end: item.x + (m.index + m[0].length) * charWidth,
        charWidth,
      })
    }
  }

  const cells = []
  for (const piece of pieces) {
    const prev = cells[cells.length - 1]
    const charWidth = Math.max(piece.charWidth, prev?.charWidth ?? 0, 1)
    if (prev && piece.x - prev.end < 1.5 * charWidth) {
      prev.text += ` ${piece.text}`
      prev.end = piece.end
    } else {
      cells.push({ ...piece })
    }
  }
  return cells
}

const lineText = (cells) => cells.map((c) => c.text).join('  ')

/**
 * Treats every cell of a candidate header line as a column. Recognised headings
 * get a key; anything else (Qty is recognised, but e.g. Category, SKU, a second
 * price column) is kept as an ignored column, so its values can't leak into a
 * neighbouring column.
 */
function readHeader(cells) {
  const columns = cells.map((cell) => {
    const def = COLUMNS.find((c) => c.pattern.test(cell.text.trim()))
    return { key: def?.key ?? null, rank: def?.rank ?? 0, label: cell.text.trim(), x: cell.x, end: cell.end }
  })
  // One column per key: keep the best-ranked (then leftmost); the others are ignored.
  for (const col of columns) {
    if (!col.key) continue
    const better = columns.find((o) => o !== col && o.key === col.key && (o.rank < col.rank || (o.rank === col.rank && o.x < col.x)))
    if (better) col.key = null
  }
  return columns
}

/**
 * Assigns each cell to the column it overlaps most. Column boundaries sit halfway
 * between neighbouring headings, which works for left- and right-aligned tables.
 */
function toRow(cells, columns) {
  const sorted = [...columns].sort((a, b) => a.x - b.x)
  const spans = sorted.map((col, i) => ({
    col,
    start: i === 0 ? -Infinity : (sorted[i - 1].end + col.x) / 2,
    end: i === sorted.length - 1 ? Infinity : (col.end + sorted[i + 1].x) / 2,
  }))
  const row = {}
  for (const cell of cells) {
    let best = spans[0]
    let bestOverlap = -Infinity
    for (const span of spans) {
      const overlap = Math.min(cell.end, span.end) - Math.max(cell.x, span.start)
      if (overlap > bestOverlap) {
        best = span
        bestOverlap = overlap
      }
    }
    const key = best.col.key ?? `ignored:${best.col.label}`
    row[key] = row[key] ? `${row[key]} ${cell.text}` : cell.text
  }
  return row
}

/** A row's quantity, if the table has a quantity column: only 1 is supported. */
function quantityProblem(row) {
  if (row.quantity === undefined) return null
  const quantity = parseNumber(row.quantity)
  if (quantity === null) return `quantity "${row.quantity}" isn't a number`
  if (quantity !== 1) return `quantity is ${quantity}; the engine prices one unit per line, so list each unit on its own line`
  return null
}

/**
 * Turns text lines (from extractPdfLines) into cart items. Pure: no PDF library involved.
 * Returns { items, skipped: [{ row, text, reason }], ignoredLines, ignoredColumns, orderRef, fileError? }.
 */
export function parseCartTable(lines) {
  const result = { items: [], skipped: [], ignoredLines: [], ignoredColumns: [], orderRef: null }
  let header = null
  let rowNumber = 0

  for (const line of lines) {
    const cells = toCells(line)
    if (cells.length === 0) continue
    const text = lineText(cells)
    const columns = readHeader(cells)
    const recognised = Object.keys(REQUIRED).filter((key) => columns.some((c) => c.key === key))

    if (recognised.length >= 2) {
      // A header row — the first one, or a repeat at the top of a later page.
      const missing = Object.keys(REQUIRED).filter((key) => !recognised.includes(key))
      if (missing.length > 0) {
        return { ...result, fileError: `The table is missing column(s): ${missing.map((k) => REQUIRED[k]).join(', ')}. Expected: ${EXPECTED}.` }
      }
      header = columns
      for (const col of columns) {
        if (!col.key && !result.ignoredColumns.includes(col.label)) result.ignoredColumns.push(col.label)
      }
      continue
    }

    if (!header) {
      // Title lines above the table, e.g. "Order #OP-9921 | Date: 15 Jan 2025".
      result.orderRef ??= text.match(ORDER_REF)?.[1] ?? null
      continue
    }

    if (SEPARATOR.test(text)) continue

    const row = toRow(cells, header)
    if (NON_ITEM.test(cells[0].text) && !row.brand && !row.platform) {
      result.ignoredLines.push(text)
      continue
    }

    rowNumber += 1
    const check = validateCartItem({ itemId: `ITEM-${String(rowNumber).padStart(2, '0')}`, ...row })
    const problems = [...(check.errors ?? []), ...[quantityProblem(row)].filter(Boolean)]
    if (problems.length > 0) {
      result.skipped.push({ row: rowNumber, text, reason: problems.join('; ') })
    } else {
      result.items.push(check.parsed)
    }
  }

  if (!header) {
    return { ...result, fileError: `Couldn't find the table header in this PDF. Expected a row with: ${EXPECTED}.` }
  }
  if (result.items.length === 0) {
    return { ...result, fileError: 'No cart items could be read from this PDF.' }
  }
  return result
}

/**
 * Reads a cart PDF (ArrayBuffer). Never throws: problems come back as fileError.
 * `pdfjs` can be injected (tests use pdf.js's Node build).
 */
export async function readPdfCart(data, { pdfjs } = {}) {
  const fail = (fileError) => ({ items: [], skipped: [], ignoredLines: [], ignoredColumns: [], orderRef: null, fileError })

  if (data.byteLength > MAX_PDF_BYTES) return fail('This PDF is larger than 5 MB. A cart PDF should be much smaller.')

  let lines
  try {
    lines = await extractPdfLines(data, pdfjs)
  } catch (err) {
    return fail(err instanceof PdfReadError ? err.message : "This file couldn't be read as a PDF.")
  }

  if (lines.length === 0) {
    return fail('This PDF has no selectable text — it may be a scanned image. Upload a PDF with a text table, or use cart.csv.')
  }
  return parseCartTable(lines)
}
