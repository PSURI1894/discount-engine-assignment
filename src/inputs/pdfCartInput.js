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

import { validateCartItem } from './validate.js'
import { extractPdfLines, PdfReadError } from './pdfText.js'

export const MAX_PDF_BYTES = 5 * 1024 * 1024

const COLUMNS = [
  { key: 'product', label: 'Product', pattern: /^(product|product name|item|description)$/i },
  { key: 'brand', label: 'Brand', pattern: /^brand$/i },
  { key: 'platform', label: 'Platform', pattern: /^(platform|marketplace|channel)$/i },
  { key: 'basePrice', label: 'Base Price', pattern: /^(base price|price|mrp)(\s*\(.*\))?$/i },
]

const SEPARATOR = /^[\s\-–—_=─━.·•*|]+$/
// Summary/footer wording. Only treated as a non-item line when the row also has
// no brand or platform — so a product called "Item Holder" or "Total Gym Mat" is still an item.
const NON_ITEM = /^(sub-?total|total|grand total|order total|net payable|amount( due| paid)?|items?\b|page \d+|thank you|delivery|shipping|tax|gst|discount|coupon)/i

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

/** Matches a line's cells against the expected column headings. */
function readHeader(cells) {
  const found = []
  for (const cell of cells) {
    const column = COLUMNS.find((c) => c.pattern.test(cell.text.trim()))
    if (column && !found.some((f) => f.key === column.key)) {
      found.push({ key: column.key, x: cell.x, charWidth: cell.charWidth })
    }
  }
  return found
}

/** Assigns each cell to the column whose heading starts at or just before it. */
function toRow(cells, header) {
  const columns = [...header].sort((a, b) => a.x - b.x)
  const row = {}
  for (const cell of cells) {
    const tolerance = Math.max(4, 2 * cell.charWidth)
    let column = columns[0]
    for (const c of columns) if (c.x <= cell.x + tolerance) column = c
    row[column.key] = row[column.key] ? `${row[column.key]} ${cell.text}` : cell.text
  }
  return row
}

/**
 * Turns text lines (from extractPdfLines) into cart items. Pure: no PDF library involved.
 * Returns { items, skipped: [{ row, text, reason }], ignoredLines: string[], orderRef, fileError? }.
 */
export function parseCartTable(lines) {
  const result = { items: [], skipped: [], ignoredLines: [], orderRef: null }
  let header = null
  let rowNumber = 0

  for (const line of lines) {
    const cells = toCells(line)
    if (cells.length === 0) continue
    const text = lineText(cells)
    const headings = readHeader(cells)

    if (headings.length >= 2) {
      // A header row — the first one, or a repeat at the top of a later page.
      const missing = COLUMNS.filter((c) => !headings.some((h) => h.key === c.key))
      if (missing.length > 0) {
        return { ...result, fileError: `The table is missing column(s): ${missing.map((c) => c.label).join(', ')}. Expected: ${COLUMNS.map((c) => c.label).join(', ')}.` }
      }
      header = headings
      continue
    }

    if (!header) {
      // Title lines above the table, e.g. "Order #OP-9921 | Date: 15 Jan 2025".
      result.orderRef ??= text.match(/order\s*(?:no\.?|number)?\s*#?\s*([A-Z0-9][\w-]*)/i)?.[1] ?? null
      continue
    }

    if (SEPARATOR.test(text)) continue

    const row = toRow(cells, header)
    if (NON_ITEM.test(cells[0].text) && (!row.brand || !row.platform)) {
      result.ignoredLines.push(text)
      continue
    }

    rowNumber += 1
    const check = validateCartItem({ itemId: `ITEM-${String(rowNumber).padStart(2, '0')}`, ...row })
    if (check.errors) {
      result.skipped.push({ row: rowNumber, text, reason: check.errors.join('; ') })
    } else {
      result.items.push(check.parsed)
    }
  }

  if (!header) {
    return { ...result, fileError: `Couldn't find the table header in this PDF. Expected a row with: ${COLUMNS.map((c) => c.label).join(', ')}.` }
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
  const fail = (fileError) => ({ items: [], skipped: [], ignoredLines: [], orderRef: null, fileError })

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
