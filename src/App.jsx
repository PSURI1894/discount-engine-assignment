/**
 * App.jsx
 *
 * Top-level component. Holds the active rules and cart; prices are derived
 * from them, so any change to either re-runs the engine automatically.
 * Wires together input adapters → engine → display.
 */

import { useMemo, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import CartSummary from './components/CartSummary.jsx'
import { parseRulesCSV, parseCartCSV } from './inputs/csvInput.js'
import { priceCart } from './engine/discountEngine.js'
import { formatRupees as rs, formatRuleValue } from './engine/format.js'

// ── Column definitions ───────────────────────────────────────────

const capitalise = (v) => v.charAt(0).toUpperCase() + v.slice(1)

const RULES_COLUMNS = [
  { key: 'ruleId',       label: 'Rule ID' },
  { key: 'scope',        label: 'Scope',      render: capitalise },
  { key: 'appliesTo',    label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
  { key: 'type',         label: 'Type',       render: capitalise },
  { key: 'value',        label: 'Value',      render: (v, row) => formatRuleValue(row) },
  { key: 'minCartValue', label: 'Condition',  render: (v) => (v ? `Cart total ≥ ${rs(v)}` : '—') },
  { key: 'stackable',    label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rs(v) },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
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
  main:    { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  hint:    { fontSize: 12, color: '#888', marginBottom: '0.6rem' },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
  }),
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName]   = useState('')

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
      setRulesErr(rules.length > 0 ? [...errors, 'Nothing was loaded from this file, so the previous rules are still active.'] : errors)
      return
    }
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    if (data.length === 0) {
      setCartErrors(cartItems.length > 0 ? [...errors, 'Nothing was loaded from this file, so the previous cart is unchanged.'] : errors)
      return
    }
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
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
        <div style={S.grid2}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0}
              fileName={cartFileName}
            />
            <ErrorBanner errors={cartErrors} />
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
