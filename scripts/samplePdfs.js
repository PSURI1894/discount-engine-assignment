/**
 * samplePdfs.js
 *
 * Builds cart PDFs in the layout the brief describes: a title line, a header
 * row (Product, Brand, Platform, Base Price), a rule, one item per line.
 * Used by `npm run make:pdfs` to write sample-data/*.pdf, and by the tests.
 *
 * Two text layouts, because real PDFs come both ways:
 *   "cells" — each value drawn separately at its column position
 *   "lines" — each row drawn as one string padded with spaces (plain-text export)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const FIXED_DATE = new Date('2025-01-15T00:00:00Z') // keeps the generated files byte-for-byte stable
const COLUMN_X = [50, 190, 300, 410]
const LINE_WIDTHS = [20, 16, 16]
const FONT_SIZE = 10
const HEADER = ['Product', 'Brand', 'Platform', 'Base Price']

function drawRow(page, cells, y, font, layout) {
  if (layout === 'lines') {
    const text = cells.map((c, i) => (i < LINE_WIDTHS.length ? (c ?? '').padEnd(LINE_WIDTHS[i]) : c ?? '')).join('')
    page.drawText(text, { x: COLUMN_X[0], y, size: FONT_SIZE, font })
  } else {
    cells.forEach((c, i) => c && page.drawText(c, { x: COLUMN_X[i], y, size: FONT_SIZE, font }))
  }
}

/**
 * spec: { title, rows: string[][], footer?: string[][], layout?: 'cells' | 'lines',
 *         separator?: 'rule' | 'dashes', header?: string[], noText?: boolean }
 * Returns the PDF as a Uint8Array.
 */
export async function buildCartPdf(spec) {
  const { title, rows = [], footer = [], layout = 'cells', separator = 'rule', header = HEADER, noText = false } = spec
  const doc = await PDFDocument.create()
  doc.setTitle('Cart')
  doc.setCreator('discount-engine sample generator')
  doc.setProducer('pdf-lib')
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)

  const page = doc.addPage([595, 842]) // A4
  if (noText) {
    // Stands in for a scanned page: graphics only, no text layer.
    page.drawRectangle({ x: 50, y: 600, width: 400, height: 150, color: rgb(0.85, 0.85, 0.85) })
    return doc.save({ useObjectStreams: false })
  }

  const font = await doc.embedFont(StandardFonts.Courier)
  const bold = await doc.embedFont(StandardFonts.CourierBold)

  let y = 780
  page.drawText(title, { x: COLUMN_X[0], y, size: FONT_SIZE, font })
  y -= 30
  drawRow(page, header, y, bold, layout)
  y -= 10
  if (separator === 'dashes') {
    page.drawText('-'.repeat(70), { x: COLUMN_X[0], y, size: FONT_SIZE, font })
  } else {
    page.drawLine({ start: { x: COLUMN_X[0], y: y + 4 }, end: { x: 520, y: y + 4 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) })
  }
  y -= 16
  for (const row of [...rows, ...footer]) {
    drawRow(page, row, y, font, layout)
    y -= 16
  }

  return doc.save({ useObjectStreams: false })
}

/** The sample PDFs committed to sample-data/. */
export const SAMPLE_PDFS = {
  // Exactly the brief's example: same six items as cart.csv.
  'cart.pdf': {
    title: 'Order #OP-9921  |  Date: 15 Jan 2025',
    rows: [
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
      ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
      ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
      ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
      ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
    ],
  },
  // A different cart, laid out as plain-text lines, that falls below the Rs.4,000 cart offer.
  'cart-small-order.pdf': {
    title: 'Order #OP-9934  |  Date: 18 Jan 2025',
    layout: 'lines',
    rows: [
      ['Throw Blanket', 'Natura Casa', 'Amazon India', 'Rs.1,899'],
      ['Table Lamp', 'LivSpace Pro', 'Flipkart', 'Rs.1,249'],
      ['Storage Basket', 'Nordic Basics', 'Noon', 'Rs.699'],
    ],
  },
  // The brief's cart with two broken rows, a dashed separator and a total line.
  'cart-with-errors.pdf': {
    title: 'Order #OP-9940  |  Date: 20 Jan 2025',
    separator: 'dashes',
    rows: [
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
      ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.abc'],
      ['Ceramic Vase', 'LivSpace Pro', '', 'Rs.2,499'],
      ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
      ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
    ],
    footer: [['Total', '', '', 'Rs.5,932']],
  },
}
