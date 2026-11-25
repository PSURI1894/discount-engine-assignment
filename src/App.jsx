/**
 * App.jsx
 *
 * Top-level component. Holds the active rules and cart; prices are derived
 * from them, so any change to either re-runs the engine automatically.
 * Wires together input adapters → engine → display.
 */

import { useMemo, useState } from 'react'
import FileUploader from './components/FileUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import CartSummary from './components/CartSummary.jsx'
import RuleInput from './components/RuleInput.jsx'
import PdfImportReview from './components/PdfImportReview.jsx'
import { parseRulesCSV, parseCartCSV } from './inputs/csvInput.js'
import { readPdfCart } from './inputs/pdfCartInput.js'
import { nextRuleId, renumberAddedRules } from './inputs/ruleIds.js'
import { priceCart } from './engine/discountEngine.js'
import { formatRupees as rs, formatRuleValue } from './engine/format.js'

// ── Column definitions ───────────────────────────────────────────

const capitalise = (v) => v.charAt(0).toUpperCase() + v.slice(1)
const nowrap = (v) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>

const RULES_COLUMNS = [
  { key: 'ruleId',       label: 'Rule ID',    render: nowrap },
  { key: 'scope',        label: 'Scope',      render: capitalise },
  { key: 'appliesTo',    label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
  { key: 'value',        label: 'Value',      render: (v, row) => formatRuleValue(row) },
  { key: 'minCartValue', label: 'Condition',  render: (v) => (v ? `Cart total ≥ ${rs(v)}` : '—') },
  { key: 'stackable',    label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item', render: nowrap },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rs(v) },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item', render: nowrap },
  { key: 'product',   label: 'Product' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => rs(v) },
  { key: 'finalPrice',label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        {rs(v)}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 600 }}>{rs(v)}</span>
      ) : (
        <span style={{ color: '#888' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v, row) => (
      <span style={{ color: row.status === 'none' ? '#888' : '#131A48', fontStyle: row.status === 'none' ? 'italic' : 'normal' }}>
        {v}
      </span>
    ),
  },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
]

const STATUS_BADGES = {
  best:    { text: 'Max discount',     color: '#7a4a00', bg: '#fff1d6' },
  stacked: { text: 'Stacked',          color: '#1a3e8c', bg: '#e3ecff' },
  applied: { text: 'Discount applied', color: '#1e5c2c', bg: '#e3f5e8' },
  none:    { text: 'No offer',         color: '#666',    bg: '#eeeeee' },
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.none
  return <span style={{ ...S.tag(badge.color, badge.bg), whiteSpace: 'nowrap' }}>{badge.text}</span>
}

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 1180, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  hint:    { fontSize: 12, color: '#888', marginBottom: '0.6rem' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#c0392b', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' },
  addedTag: { fontSize: 10, color: '#888', marginTop: 2 },
  notice:  { background: '#eef6f0', border: '1px solid #b9dcc3', borderRadius: 4, padding: '0.5rem 0.7rem', marginTop: '0.5rem', fontSize: 12, color: '#1e5c2c' },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
  }),
}

// ── PDF import messages ──────────────────────────────────────────

const describeSkipped = (s) => `Row ${s.row} skipped (“${s.text}”): ${s.reason}`

function pdfNotice(fileName, { items, skipped, ignoredLines, orderRef }) {
  const order = orderRef ? ` (order #${orderRef})` : ''
  return {
    text: `Loaded ${items.length} item${items.length === 1 ? '' : 's'} from ${fileName}${order}.`,
    details: [
      ...skipped.map(describeSkipped),
      ...(ignoredLines.length > 0 ? [`Ignored (not items): ${ignoredLines.join('; ')}`] : []),
    ],
  }
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  // Rules come from two places: the uploaded file, and rules added in plain
  // English during the session. A new rules file replaces only the former.
  const [fileRules, setFileRules]   = useState([])
  const [addedRules, setAddedRules] = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartSource, setCartSource] = useState(null) // { kind: 'csv' | 'pdf', fileName }
  const [cartNotice, setCartNotice] = useState(null) // what the last PDF import did
  const [pdfBusy, setPdfBusy]       = useState(false)
  const [pdfReview, setPdfReview]   = useState(null) // { fileName, result } awaiting a decision

  const rules = useMemo(() => [...fileRules, ...addedRules], [fileRules, addedRules])
  const addedIds = useMemo(() => new Set(addedRules.map((r) => r.ruleId)), [addedRules])

  // Prices are derived state: re-computed whenever the rules or the cart change.
  const results = useMemo(
    () => (cartItems.length > 0 ? priceCart(cartItems, rules) : null),
    [cartItems, rules]
  )

  // ── Handlers ──
  // A file that yields nothing usable never wipes out what is already loaded.

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    if (data.length === 0) {
      setRulesErr(fileRules.length > 0 ? [...errors, 'Nothing was loaded from this file, so the previous rules are still active.'] : errors)
      return
    }
    setFileRules(data)
    setAddedRules((prev) => renumberAddedRules(data, prev))
    setRulesErr(errors)
    setRulesFileName(fileName)
  }

  function handleAddRule(rule) {
    // The ID was chosen when the rule was parsed; re-check in case rules changed since.
    const clashes = rules.some((r) => r.ruleId === rule.ruleId)
    setAddedRules((prev) => [...prev, clashes ? { ...rule, ruleId: nextRuleId(rules) } : rule])
  }

  function handleRemoveRule(ruleId) {
    setAddedRules((prev) => prev.filter((r) => r.ruleId !== ruleId))
  }

  // Rules added in plain English are marked under their ID, with a remove link.
  const rulesColumns = RULES_COLUMNS.map((col) =>
    col.key !== 'ruleId'
      ? col
      : {
          ...col,
          render: (id) =>
            addedIds.has(id) ? (
              <span style={{ whiteSpace: 'nowrap' }}>
                {id}
                <div style={S.addedTag}>
                  added ·{' '}
                  <button type="button" style={S.linkBtn} onClick={() => handleRemoveRule(id)} aria-label={`Remove ${id}`}>
                    remove
                  </button>
                </div>
              </span>
            ) : (
              nowrap(id)
            ),
        }
  )

  const keptCartNote = () =>
    cartItems.length > 0 ? ['Nothing was loaded from this file, so the previous cart is unchanged.'] : []

  function replaceCart(items, source, { errors = [], notice = null } = {}) {
    setCartItems(items)
    setCartSource(source)
    setCartErrors(errors)
    setCartNotice(notice)
    setPdfReview(null)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setPdfReview(null)
    if (data.length === 0) {
      setCartErrors([...errors, ...keptCartNote()])
      return
    }
    replaceCart(data, { kind: 'csv', fileName }, { errors })
  }

  // A fully readable PDF replaces the cart at once; a partly readable one is
  // shown for review first; an unreadable one leaves the cart as it was.
  async function handleCartPdf(buffer, fileName) {
    setPdfBusy(true)
    setPdfReview(null)
    const result = await readPdfCart(buffer)
    setPdfBusy(false)

    if (result.fileError) {
      setCartErrors([`${fileName}: ${result.fileError}`, ...result.skipped.map(describeSkipped), ...keptCartNote()])
      return
    }
    if (result.skipped.length > 0) {
      setPdfReview({ fileName, result })
      return
    }
    replaceCart(result.items, { kind: 'pdf', fileName }, { notice: pdfNotice(fileName, result) })
  }

  function acceptPdfReview() {
    const { fileName, result } = pdfReview
    replaceCart(result.items, { kind: 'pdf', fileName }, { notice: pdfNotice(fileName, result) })
  }

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>

        {/* Upload row */}
        <div className="upload-grid">
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <FileUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={fileRules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} active rule{rules.length > 1 ? 's' : ''}
                  {addedRules.length > 0 && ` (${fileRules.length} from file, ${addedRules.length} added)`}
                </div>
                <DataTable columns={rulesColumns} rows={rules} />
              </div>
            )}
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <FileUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartSource?.kind === 'csv'}
              fileName={cartSource?.fileName}
            />
            <div style={{ height: '0.5rem' }} />
            <FileUploader
              label="cart.pdf"
              description="Or upload a cart PDF (Product, Brand, Platform, Base Price)"
              onLoad={handleCartPdf}
              accept=".pdf,application/pdf"
              readAs="arrayBuffer"
              busy={pdfBusy}
              hasData={cartSource?.kind === 'pdf'}
              fileName={cartSource?.fileName}
            />
            <ErrorBanner errors={cartErrors} />
            {pdfReview && (
              <PdfImportReview
                fileName={pdfReview.fileName}
                result={pdfReview.result}
                currentTotal={results ? results.total : null}
                newTotal={priceCart(pdfReview.result.items, rules).total}
                onReplace={acceptPdfReview}
                onCancel={() => setPdfReview(null)}
              />
            )}
            {cartNotice && (
              <div style={S.notice} role="status">
                {cartNotice.text}
                {cartNotice.details.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>
                    {cartNotice.details.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Plain-English rule input */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Add a rule in plain English</div>
          <RuleInput rules={rules} cartItems={cartItems} onAddRule={handleAddRule} />
        </div>

        {/* Results — recalculated automatically */}
        {results ? (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            {rules.length === 0 && (
              <div style={S.hint}>No discount rules loaded yet — showing base prices.</div>
            )}
            <DataTable columns={RESULTS_COLUMNS} rows={results.items} />
            <CartSummary pricing={results} />
          </div>
        ) : (
          <div style={{ ...S.hint, textAlign: 'center', marginBottom: '1.2rem' }}>
            Load a cart to see prices. They update automatically whenever the rules or the cart change.
          </div>
        )}

      </div>
    </div>
  )
}
