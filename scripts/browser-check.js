/**
 * End-to-end check in a real browser, driven over the Chrome DevTools Protocol
 * with no extra dependencies (needs Node 22+ and a local Chrome, Edge or Chromium).
 *
 *   npm run dev            # in one terminal
 *   npm run check:browser  # in another
 *
 * Environment: BASE_URL (default http://localhost:5173), BROWSER (path to the
 * browser executable, if it isn't found automatically), SCREENSHOTS_DIR (save
 * screenshots there). Exits with code 1 if any check fails.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const SAMPLES = fileURLToPath(new URL('../sample-data/', import.meta.url))
const SHOTS = process.env.SCREENSHOTS_DIR
const PORT = 9300 + Math.floor(Math.random() * 500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER
  const candidates = {
    win32: [
      `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  }[process.platform] ?? []
  return candidates.find((p) => existsSync(p))
}

const browserPath = findBrowser()
if (!browserPath) {
  console.error('No Chrome, Edge or Chromium found. Set BROWSER to the browser executable.')
  process.exit(1)
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'discount-check-'))}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
], { stdio: 'ignore' })

const results = []
const consoleErrors = []
const record = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

let ws
try {
  let wsUrl
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch { /* browser still starting */ }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) throw new Error('could not connect to the browser over DevTools')

  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let nextId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg); pending.delete(msg.id) }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception')
  }
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const js = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  const waitFor = async (expression, timeout = 15000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) if (await js(expression)) return true
    return false
  }
  const has = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`
  const total = () => js(`(() => { const el = [...document.querySelectorAll('span')].find(s => /^(Final cart total|Cart total|You pay)$/.test(s.textContent)); return el && el.nextElementSibling.textContent })()`)
  const click = (text) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); b && b.click(); return !!b })()`)
  const upload = async (label, file) => {
    const { root } = await send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `input[aria-label="${label}"]` })
    await send('DOM.setFileInputFiles', { nodeId, files: [join(SAMPLES, file)] })
  }
  const screenshot = async (name) => {
    if (!SHOTS) return
    const { contentSize } = await send('Page.getLayoutMetrics')
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(contentSize.width), height: Math.ceil(contentSize.height), scale: 1 } })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(shot.data, 'base64'))
  }

  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE })
  record(`app loads (${BASE})`, await waitFor(has('Discount Rules')))

  await upload('Upload rules.csv', 'rules.csv')
  await upload('Upload cart.csv', 'cart.csv')
  await waitFor(has('Final cart total'))
  record('sample CSVs → Rs.5,339 with the cart offer line', (await total()) === 'Rs.5,339' && (await js(has('Cart offer: 10% off — Rs.593 saved'))), `total: ${await total()}`)
  record('ITEM-04 explains why it has no offer', await js(has('No offers available for LivSpace Pro products on Noon')))
  await screenshot('1-results')

  await click('Customer view')
  record('customer view: one price and one label per item, You pay Rs.5,339', await waitFor(has('Your cart (6 items)')) && (await js(has('You save Rs.195'))) && (await total()) === 'Rs.5,339')
  await click('Merchant view')

  await click('20% off for Natura Casa brand, stackable with other offers')
  await click('Parse rule')
  record('plain-English rule → confirmation card', await waitFor(has('Check this rule before adding it')))
  record('the card previews the total change', await js(has('Final cart total: Rs.5,339 → Rs.5,026')))
  await screenshot('2-confirmation')
  await click('Add rule')
  await waitFor(`!${has('Check this rule before adding it')}`)
  record('confirmed rule re-prices the cart → Rs.5,026', (await total()) === 'Rs.5,026', `total: ${await total()}`)
  record('every table fits its panel', await js(`[...document.querySelectorAll('table')].every(t => t.parentElement.scrollWidth <= t.parentElement.clientWidth + 1)`))
  await js(`document.querySelector('button[aria-label="Remove RULE-05"]').click()`)
  await sleep(200)
  record('removing the rule restores Rs.5,339', (await total()) === 'Rs.5,339', `total: ${await total()}`)

  await click('Give a discount for big orders')
  await click('Parse rule')
  record('a vague rule asks for more detail', await waitFor(has('Need a bit more detail')))

  await upload('Upload cart.pdf', 'cart-small-order.pdf')
  record('PDF read in the browser', await waitFor(has('Loaded 3 items from cart-small-order.pdf')))
  record('new cart re-priced, below the minimum → Rs.3,437, no cart offer', (await total()) === 'Rs.3,437' && !(await js(has('Cart offer:'))), `total: ${await total()}`)
  await click('Customer view')
  record('"Add Rs.563 more" hint for the shopper', await waitFor(has('Add Rs.563 more to get 10% off your cart.')))
  await click('Merchant view')

  await upload('Upload cart.pdf', 'cart-with-errors.pdf')
  record('partly readable PDF → review panel', await waitFor(has('Read 4 of 6 item rows from cart-with-errors.pdf')))
  await screenshot('3-pdf-review')
  await click('Replace cart with 4 items')
  await sleep(200)
  record('replacing with the readable rows → Rs.2,924', (await total()) === 'Rs.2,924', `total: ${await total()}`)

  await upload('Upload cart.pdf', 'cart.pdf')
  await waitFor(has('Loaded 6 items from cart.pdf'))
  record("the brief's sample PDF → Rs.5,339", (await total()) === 'Rs.5,339', `total: ${await total()}`)

  await send('Page.navigate', { url: BASE })
  await waitFor(has('Load sample data'))
  await click('Load sample data')
  record('"Load sample data" → Rs.5,339', (await waitFor(has('Final cart total'))) && (await total()) === 'Rs.5,339')
  const pdfHref = await js(`document.querySelector('a[download="cart.pdf"]')?.href`)
  const pdfStart = await js(`fetch(${JSON.stringify(pdfHref ?? '')}).then(r => r.arrayBuffer()).then(b => new TextDecoder().decode(new Uint8Array(b).slice(0, 5)))`)
  record('sample files can be downloaded', (await js(`document.querySelectorAll('a[download]').length`)) === 5 && pdfStart === '%PDF-')

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(300)
  record('no horizontal page scroll at phone width (390px)', await js('document.documentElement.scrollWidth <= window.innerWidth'))

  record('no errors in the browser console', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  record('browser run', false, err.message)
} finally {
  try { ws?.close() } catch { /* already closed */ }
  browser.kill()
  const failed = results.filter((pass) => !pass).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exitCode = failed ? 1 : 0
}
