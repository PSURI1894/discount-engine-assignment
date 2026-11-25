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

// import.meta.url isn't a file URL under jsdom, so resolve from the project root.
const sample = (name) => readFileSync(join(process.cwd(), 'sample-data', name), 'utf8')

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

async function loadSampleData() {
  const utils = render(<App />)
  const [rulesInput, cartInput] = utils.container.querySelectorAll('input[type="file"]')
  upload(rulesInput, 'rules.csv')
  upload(cartInput, 'cart.csv')
  await screen.findByText('Final cart total')
  return { ...utils, rulesInput }
}

const finalTotal = () => screen.getByText('Final cart total').nextSibling.textContent

async function parse(text) {
  fireEvent.change(screen.getByLabelText('Describe a discount rule'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Parse rule' }))
}

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

  it('keeps added rules when a new rules file is uploaded', async () => {
    const { rulesInput } = await loadSampleData()
    await parse('20% off for Natura Casa brand, stackable with other offers')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Confirm new rule' })).getByRole('button', { name: 'Add rule' }))

    upload(rulesInput, 'rules.csv')
    await screen.findByText(/4 from file, 1 added/)
    expect(finalTotal()).toBe('Rs.5,026')
  })
})
