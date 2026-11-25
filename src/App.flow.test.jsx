// @vitest-environment jsdom
/**
 * User-level flows through the real UI, inputs and engine. The parser endpoint
 * is served in-process by the real handler with no LLM key, so these tests use
 * the offline parser and never touch the network.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import App from './App.jsx'
import { handleParseRule } from '../server/ruleParser/handler.js'

// Real pdf.js, but its Node build — there is no browser worker under jsdom.
// pdfTiming.delayMs lets a test make PDF reading slow.
const pdfTiming = vi.hoisted(() => ({ delayMs: 0 }))
vi.mock('./inputs/pdfText.js', async (importOriginal) => {
  const actual = await importOriginal()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return {
    ...actual,
    extractPdfLines: async (data) => {
      if (pdfTiming.delayMs) await new Promise((r) => setTimeout(r, pdfTiming.delayMs))
      return actual.extractPdfLines(data, pdfjs)
    },
  }
})

// import.meta.url isn't a file URL under jsdom, so resolve from the project root.
const samplePath = (name) => join(process.cwd(), 'sample-data', name)
const sample = (name) => readFileSync(samplePath(name), 'utf8')

beforeEach(() => {
  vi.stubGlobal('fetch', async (_url, init) => {
    const result = await handleParseRule(JSON.parse(init.body), {})
    return new Response(JSON.stringify(result.json), { status: result.status })
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function upload(input, name) {
  fireEvent.change(input, { target: { files: [new File([sample(name)], name, { type: 'text/csv' })] } })
}

function uploadPdf(name, bytes = readFileSync(samplePath(name))) {
  fireEvent.change(screen.getByLabelText('Upload cart.pdf'), {
    target: { files: [new File([bytes], name, { type: 'application/pdf' })] },
  })
}

async function loadSampleData() {
  const utils = render(<App />)
  const rulesInput = screen.getByLabelText('Upload rules.csv')
  upload(rulesInput, 'rules.csv')
  upload(screen.getByLabelText('Upload cart.csv'), 'cart.csv')
  await screen.findByText('Final cart total')
  return { ...utils, rulesInput }
}

const finalTotal = () => screen.getByText('Final cart total').nextSibling.textContent
const amountToPay = () => screen.getByText(/^(Final cart total|Cart total)$/).nextSibling.textContent

async function parse(text) {
  fireEvent.change(screen.getByLabelText('Describe a discount rule'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Parse rule' }))
}

describe('sample data on the page', () => {
  it('loads the sample rules and cart in one click, through the normal CSV adapter', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample data' }))
    await screen.findByText('Final cart total')
    expect(finalTotal()).toBe('Rs.5,339')
    expect(screen.getByText('rules.csv (sample)')).toBeTruthy()
  })

  it('offers every sample file for download', () => {
    render(<App />)
    for (const name of ['rules.csv', 'cart.csv', 'cart.pdf', 'cart-small-order.pdf', 'cart-with-errors.pdf']) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('download')).toBe(name)
      expect(link.getAttribute('href')).toBeTruthy()
    }
  })
})

describe('loading the sample files', () => {
  it('shows the brief\'s expected results straight away', async () => {
    await loadSampleData()
    expect(screen.getByText('Cart offer: 10% off — Rs.593 saved')).toBeTruthy()
    expect(finalTotal()).toBe('Rs.5,339')
    expect(screen.getByText('No offers available for LivSpace Pro products on Noon')).toBeTruthy()
  })
})

describe('adding a rule in plain English', () => {
  it('shows the parsed fields and the price impact, and only applies the rule once confirmed', async () => {
    await loadSampleData()
    await parse('20% off for Natura Casa brand, stackable with other offers')

    const card = await screen.findByRole('region', { name: 'Confirm new rule' })
    expect(within(card).getByText('Natura Casa')).toBeTruthy()
    expect(within(card).getByText('20% off')).toBeTruthy()
    expect(within(card).getByText(/Final cart total: Rs.5,339/)).toBeTruthy()
    expect(finalTotal()).toBe('Rs.5,339') // not applied yet

    fireEvent.click(within(card).getByRole('button', { name: 'Add rule' }))

    expect(screen.queryByRole('region', { name: 'Confirm new rule' })).toBeNull()
    expect(finalTotal()).toBe('Rs.5,026')
    expect(screen.getByText('RULE-05')).toBeTruthy()
    expect(screen.getByText('Natura Casa offer: Rs.150 off + Flipkart offer: 10% off + Natura Casa offer: 20% off')).toBeTruthy()
  })

  it('leaves prices untouched when the rule is discarded', async () => {
    await loadSampleData()
    await parse('Rs.100 flat discount on all Flipkart items')
    const card = await screen.findByRole('region', { name: 'Confirm new rule' })

    fireEvent.click(within(card).getByRole('button', { name: 'Discard' }))

    expect(screen.queryByRole('region', { name: 'Confirm new rule' })).toBeNull()
    expect(screen.queryByText('RULE-05')).toBeNull()
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('asks for more detail on a vague description instead of guessing', async () => {
    await loadSampleData()
    await parse('Give a discount for big orders')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Need a bit more detail')).toBeTruthy()
    expect(alert.textContent).toMatch(/how much the discount is and the minimum cart value/)
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('explains why a rule cannot be added', async () => {
    await loadSampleData()
    await parse('15% off Natura Casa on Flipkart only')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("This rule can't be added")).toBeTruthy()
  })

  it('can remove an added rule, restoring the previous prices', async () => {
    await loadSampleData()
    await parse('20% off for Natura Casa brand, stackable with other offers')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Confirm new rule' })).getByRole('button', { name: 'Add rule' }))
    expect(finalTotal()).toBe('Rs.5,026')

    fireEvent.click(screen.getByRole('button', { name: 'Remove RULE-05' }))
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('keeps added rules when a new cart is loaded, and re-prices the new cart with them', async () => {
    await loadSampleData()
    await parse('Rs.100 flat discount on all Flipkart items')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Confirm new rule' })).getByRole('button', { name: 'Add rule' }))

    uploadPdf('cart-small-order.pdf')
    await screen.findByText(/Loaded 3 items from cart-small-order.pdf/)
    // Table Lamp on Flipkart: Rs.1,249 − Rs.100 (RULE-05) = 1,149, then 10% stacked (RULE-03) = 1,034
    expect(screen.getByText('Flipkart offer: Rs.100 off + Flipkart offer: 10% off')).toBeTruthy()
  })

  it('keeps added rules when a new rules file is uploaded', async () => {
    const { rulesInput } = await loadSampleData()
    await parse('20% off for Natura Casa brand, stackable with other offers')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Confirm new rule' })).getByRole('button', { name: 'Add rule' }))

    upload(rulesInput, 'rules.csv')
    await screen.findByText(/4 from file, 1 added/)
    expect(finalTotal()).toBe('Rs.5,026')
  })
})

describe('customer view', () => {
  it('shows each item with one price and one offer label, and no rule IDs', async () => {
    await loadSampleData()
    fireEvent.click(screen.getByRole('button', { name: 'Customer view' }))

    const checkout = screen.getByRole('region', { name: 'Customer checkout view' })
    expect(within(checkout).getByText('Your cart (6 items)')).toBeTruthy()
    // Only the offer the shopper gets: no "(better than …)" comparison with offers they didn't get
    expect(within(checkout).getByText('Amazon India offer: 15% off · You save Rs.195')).toBeTruthy()
    expect(checkout.textContent).not.toMatch(/better than/)
    expect(within(checkout).getByText('No offers available for LivSpace Pro products on Noon')).toBeTruthy()
    expect(within(checkout).getByText('You pay').nextSibling.textContent).toBe('Rs.5,339')
    expect(checkout.textContent).not.toMatch(/RULE-0\d/)

    fireEvent.click(screen.getByRole('button', { name: 'Merchant view' }))
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('tells the shopper how much more unlocks the cart offer when just below it', async () => {
    await loadSampleData()
    uploadPdf('cart-small-order.pdf')
    await screen.findByText(/Loaded 3 items/)
    // Rs.3,437 after item discounts; the cart offer starts at Rs.4,000
    expect(screen.getByRole('note').textContent).toBe('No cart offer yet: the cart is Rs.563 short of RULE-04 (10% off at Rs.4,000 or more, counted after item offers).')

    fireEvent.click(screen.getByRole('button', { name: 'Customer view' }))
    expect(screen.getByRole('note').textContent).toBe("You're Rs.563 away from 10% off your cart. It applies from Rs.4,000, counted after item offers.")
  })
})

describe('uploading a cart PDF', () => {
  it('replaces the cart and re-runs the engine with the active rules', async () => {
    await loadSampleData()
    uploadPdf('cart-small-order.pdf')

    expect((await screen.findByRole('status')).textContent).toMatch(/Loaded 3 items from cart-small-order.pdf \(order #OP-9934\)/)
    expect(screen.getAllByText('Throw Blanket').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Cushion Cover')).toHaveLength(0)
    // Rs.3,437 is below the Rs.4,000 minimum: no cart offer line
    expect(screen.queryByText(/Cart offer:/)).toBeNull()
    expect(amountToPay()).toBe('Rs.3,437')
  })

  it('reads the brief\'s sample PDF into the same result as cart.csv', async () => {
    await loadSampleData()
    uploadPdf('cart.pdf')
    await screen.findByText(/Loaded 6 items from cart.pdf/)
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('asks before replacing the cart when some rows could not be read', async () => {
    await loadSampleData()
    uploadPdf('cart-with-errors.pdf')

    const review = await screen.findByRole('region', { name: 'Review cart PDF' })
    expect(review.textContent).toMatch(/Read 4 of 6 item rows from cart-with-errors.pdf/)
    expect(review.textContent).toMatch(/Row 3 — “Wall Shelf  LivSpace Pro  Amazon India  Rs.abc”: base price must be a positive number/)
    expect(review.textContent).toMatch(/Row 4 — .*platform is missing/)
    expect(review.textContent).toMatch(/Ignored \(not items\): Total  Rs.5,932/)
    expect(review.textContent).toMatch(/Cart total would change: Rs.5,339 → Rs.2,924/)
    expect(finalTotal()).toBe('Rs.5,339') // nothing replaced yet

    fireEvent.click(within(review).getByRole('button', { name: 'Keep current cart' }))
    expect(screen.queryByRole('region', { name: 'Review cart PDF' })).toBeNull()
    expect(finalTotal()).toBe('Rs.5,339')

    uploadPdf('cart-with-errors.pdf')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Review cart PDF' })).getByRole('button', { name: 'Replace cart with 4 items' }))
    expect(amountToPay()).toBe('Rs.2,924')
    expect(screen.getByRole('status').textContent).toMatch(/Row 3 skipped/)
  })

  it('ignores a slow PDF that finishes after a newer cart was loaded', async () => {
    await loadSampleData()
    pdfTiming.delayMs = 300
    try {
      uploadPdf('cart-small-order.pdf')
      upload(screen.getByLabelText('Upload cart.csv'), 'cart.csv') // the newer cart
      await new Promise((r) => setTimeout(r, 700))
    } finally {
      pdfTiming.delayMs = 0
    }
    expect(screen.queryByText(/Loaded 3 items/)).toBeNull()
    expect(screen.queryAllByText('Throw Blanket')).toHaveLength(0)
    expect(finalTotal()).toBe('Rs.5,339')
  })

  it('leaves the cart alone when the file is not a readable PDF', async () => {
    await loadSampleData()
    uploadPdf('not-really.pdf', new TextEncoder().encode('this is not a pdf'))
    expect(await screen.findByText("not-really.pdf: This file couldn't be read as a PDF.")).toBeTruthy()
    expect(screen.getByText('Nothing was loaded from this file, so the previous cart is unchanged.')).toBeTruthy()
    expect(finalTotal()).toBe('Rs.5,339')
  })
})
