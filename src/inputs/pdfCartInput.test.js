import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseCartTable, readPdfCart, MAX_PDF_BYTES } from './pdfCartInput.js'
import { parseCartCSV } from './csvInput.js'
import { priceCart } from '../engine/discountEngine.js'
import { buildCartPdf, SAMPLE_PDFS } from '../../scripts/samplePdfs.js'
import { SAMPLE_RULES } from '../test/fixtures.js'

// ── Synthetic text lines (no PDF library): monospace, 6pt per character ──
const piece = (str, x) => ({ str, x, width: str.length * 6 })
const line = (y, ...pieces) => ({ page: 1, y, items: pieces })
const HEADER = line(700, piece('Product', 50), piece('Brand', 190), piece('Platform', 300), piece('Base Price', 410))
const row = (y, product, brand, platform, price) =>
  line(y, ...[[product, 50], [brand, 190], [platform, 300], [price, 410]].filter(([s]) => s).map(([s, x]) => piece(s, x)))

describe('parseCartTable', () => {
  it('reads a table whose values are drawn at their column positions', () => {
    const res = parseCartTable([
      line(750, piece('Order #OP-9921 | Date: 15 Jan 2025', 50)),
      HEADER,
      row(680, 'Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'),
    ])
    expect(res.orderRef).toBe('OP-9921')
    expect(res.items).toEqual([{ itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 }])
    expect(res.fileError).toBeUndefined()
  })

  it('joins words stored as separate pieces and splits plain-text lines on wide gaps', () => {
    const wordByWord = line(680, piece('Cushion', 50), piece('Cover', 98), piece('Natura', 190), piece('Casa', 232),
      piece('Amazon', 300), piece('India', 342), piece('Rs.1,299', 410))
    const plainText = line(660, piece('Bed Sheet Set'.padEnd(23) + 'Natura Casa'.padEnd(18) + 'Flipkart'.padEnd(18) + 'Rs.849', 50))
    const res = parseCartTable([HEADER, wordByWord, plainText])
    expect(res.items.map((i) => [i.product, i.brand, i.platform, i.basePrice])).toEqual([
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 1299],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 849],
    ])
  })

  it('skips separators, ignores totals and page footers, and follows a repeated header onto the next page', () => {
    const res = parseCartTable([
      HEADER,
      line(690, piece('------------------------------------', 50)),
      row(680, 'Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'),
      line(100, piece('Page 1 of 2', 50)),
      { ...HEADER, page: 2 },
      { ...row(680, 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'), page: 2 },
      line(650, piece('Total', 50), piece('Rs.1,898', 410)),
    ])
    expect(res.items.map((i) => i.itemId)).toEqual(['ITEM-01', 'ITEM-02'])
    expect(res.ignoredLines).toEqual(['Page 1 of 2', 'Total  Rs.1,898'])
    expect(res.skipped).toEqual([])
  })

  it('skips a malformed row with its reason and keeps the good ones', () => {
    const res = parseCartTable([
      HEADER,
      row(680, 'Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'),
      row(660, 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.abc'),
      row(640, 'Ceramic Vase', 'LivSpace Pro', '', 'Rs.2,499'),
      row(620, 'Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899 each'),
    ])
    expect(res.items.map((i) => i.product)).toEqual(['Cushion Cover'])
    expect(res.skipped).toEqual([
      { row: 2, text: 'Wall Shelf  LivSpace Pro  Amazon India  Rs.abc', reason: 'base price must be a positive number, got "Rs.abc"' },
      { row: 3, text: 'Ceramic Vase  LivSpace Pro  Rs.2,499', reason: 'platform is missing' },
      { row: 4, text: 'Desk Organiser  Nordic Basics  Flipkart  Rs.899 each', reason: 'base price must be a positive number, got "Rs.899 each"' },
    ])
  })

  it('reports a missing header', () => {
    expect(parseCartTable([row(680, 'Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299')]).fileError)
      .toMatch(/Couldn't find the table header/)
  })

  it('reports which columns are missing', () => {
    const res = parseCartTable([line(700, piece('Product', 50), piece('Brand', 190), piece('Price', 410))])
    expect(res.fileError).toBe('The table is missing column(s): Platform. Expected: Product, Brand, Platform, Base Price.')
  })

  it('reports when no row is usable, keeping the reasons', () => {
    const res = parseCartTable([HEADER, row(680, 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 'free')])
    expect(res.fileError).toBe('No cart items could be read from this PDF.')
    expect(res.skipped).toHaveLength(1)
  })
})

// ── Real PDFs through pdf.js (Node build) ──
const toArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const read = async (spec) => readPdfCart(toArrayBuffer(await buildCartPdf(spec)), { pdfjs })

describe('readPdfCart with real PDFs', () => {
  it('reads the brief\'s cart PDF into the same items as cart.csv, priced at Rs.5,339', async () => {
    const res = await read(SAMPLE_PDFS['cart.pdf'])
    const csvCart = parseCartCSV(readFileSync(join(process.cwd(), 'sample-data', 'cart.csv'), 'utf8')).data
    expect(res.items).toEqual(csvCart)
    expect(res.orderRef).toBe('OP-9921')
    expect(priceCart(res.items, SAMPLE_RULES).total).toBe(5339)
  })

  it('reads a plain-text style PDF (different cart, below the cart-offer minimum)', async () => {
    const res = await read(SAMPLE_PDFS['cart-small-order.pdf'])
    expect(res.items.map((i) => i.product)).toEqual(['Throw Blanket', 'Table Lamp', 'Storage Basket'])
    const pricing = priceCart(res.items, SAMPLE_RULES)
    expect(pricing.cartOffer).toBeNull()
    expect(pricing.total).toBe(3437)
  })

  it('reads a PDF with broken rows, reporting what was skipped and ignored', async () => {
    const res = await read(SAMPLE_PDFS['cart-with-errors.pdf'])
    expect(res.items.map((i) => i.itemId)).toEqual(['ITEM-01', 'ITEM-02', 'ITEM-05', 'ITEM-06'])
    expect(res.skipped.map((s) => s.reason)).toEqual(['base price must be a positive number, got "Rs.abc"', 'platform is missing'])
    expect(res.ignoredLines).toEqual(['Total  Rs.5,932'])
  })

  it('explains a PDF with no text layer (e.g. a scan)', async () => {
    expect((await read({ noText: true })).fileError).toMatch(/no selectable text/)
  })

  it('explains a file that is not a PDF', async () => {
    const res = await readPdfCart(toArrayBuffer(new TextEncoder().encode('item_id,product\nITEM-01,Vase')), { pdfjs })
    expect(res.fileError).toBe("This file couldn't be read as a PDF.")
  })

  it('refuses very large files before parsing', async () => {
    const res = await readPdfCart({ byteLength: MAX_PDF_BYTES + 1 }, { pdfjs })
    expect(res.fileError).toMatch(/larger than 5 MB/)
  })

  it('the committed sample PDFs match the generator (run "npm run make:pdfs" after changing it)', async () => {
    for (const [name, spec] of Object.entries(SAMPLE_PDFS)) {
      const committed = readFileSync(join(process.cwd(), 'sample-data', name))
      expect(Buffer.from(await buildCartPdf(spec)).equals(committed), name).toBe(true)
    }
  })
})
