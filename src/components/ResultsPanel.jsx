/**
 * ResultsPanel.jsx — the priced cart, in two views:
 *   Merchant view — every item with its offer, saving and status, for checking the engine.
 *   Customer view — the checkout a shopper sees (CheckoutView).
 */

import { useState } from 'react'
import DataTable from './DataTable.jsx'
import CartSummary from './CartSummary.jsx'
import CheckoutView from './CheckoutView.jsx'
import { Panel, ui, nowrap } from './ui.jsx'
import { formatRupees as rs } from '../engine/format.js'

const STATUS_BADGES = {
  best: { text: 'Max discount', color: '#7a4a00', bg: '#fff1d6' },
  stacked: { text: 'Stacked', color: '#1a3e8c', bg: '#e3ecff' },
  applied: { text: 'Discount applied', color: '#1e5c2c', bg: '#e3f5e8' },
  none: { text: 'No offer', color: '#666', bg: '#eeeeee' },
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.none
  return <span style={ui.tag(badge.color, badge.bg)}>{badge.text}</span>
}

const COLUMNS = [
  { key: 'itemId', label: 'Item', render: nowrap },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rs(v) },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>{rs(v)}</span>,
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) => (v > 0 ? <span style={{ color: '#1e5c2c', fontWeight: 600 }}>{rs(v)}</span> : <span style={{ color: '#888' }}>—</span>),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v, row) => (
      <span style={{ color: row.status === 'none' ? '#888' : '#131A48', fontStyle: row.status === 'none' ? 'italic' : 'normal' }}>{v}</span>
    ),
  },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
]

const S = {
  toggle: { display: 'inline-flex', border: '1px solid #131A48', borderRadius: 4, overflow: 'hidden' },
  on: { background: '#131A48', color: '#fff', border: 'none', padding: '0.35rem 0.8rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  off: { background: '#fff', color: '#131A48', border: 'none', padding: '0.35rem 0.8rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}

const VIEWS = [['merchant', 'Merchant view'], ['customer', 'Customer view']]

export default function ResultsPanel({ pricing, nudge, hasRules }) {
  const [view, setView] = useState('merchant')

  const toggle = (
    <div role="group" aria-label="Choose view" style={S.toggle}>
      {VIEWS.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} style={view === key ? S.on : S.off}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <Panel title="Cart Summary" actions={toggle}>
      {!hasRules && <div style={ui.hint}>No discount rules loaded yet — showing base prices.</div>}
      {view === 'customer' ? (
        <CheckoutView pricing={pricing} nudge={nudge} />
      ) : (
        <>
          <DataTable columns={COLUMNS} rows={pricing.items} />
          <CartSummary pricing={pricing} nudge={nudge} />
        </>
      )}
    </Panel>
  )
}
