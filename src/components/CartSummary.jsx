/**
 * CartSummary.jsx
 *
 * The totals block under the cart: subtotal, any cart-level offer as its own
 * line, and the final amount. The cart-offer line only appears when a cart
 * rule's minimum is met. Below a minimum, a separate hint (not an offer line)
 * says how far off the cart is.
 *
 * variant "merchant" shows rule IDs for checking the engine; "customer" uses
 * checkout wording a shopper would see.
 */

import { formatRupees as rs } from '../engine/format.js'

const S = {
  wrap: { marginTop: '0.75rem', borderTop: '2px solid #131A48', paddingTop: '0.5rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '0.35rem 0' },
  label: { fontSize: 13, color: '#131A48' },
  value: { fontSize: 13, color: '#131A48', fontWeight: 600, whiteSpace: 'nowrap' },
  offerRow: { background: '#fff8e6', borderRadius: 4, padding: '0.45rem 0.6rem', margin: '0.2rem 0' },
  offerLabel: { fontSize: 13, color: '#7a4a00', fontWeight: 700 },
  offerNote: { fontSize: 11, color: '#7a4a00', marginTop: 2 },
  offerValue: { fontSize: 13, color: '#1e5c2c', fontWeight: 700, whiteSpace: 'nowrap' },
  // Uses the padding shorthand like S.row: mixing it with paddingTop breaks when the offer line toggles.
  finalRow: { borderTop: '1px solid #CECECE', marginTop: '0.35rem', padding: '0.55rem 0 0.35rem' },
  finalLabel: { fontSize: 14, color: '#131A48', fontWeight: 700 },
  finalValue: { fontSize: 18, color: '#131A48', fontWeight: 700, whiteSpace: 'nowrap' },
  savings: { textAlign: 'right', fontSize: 12, color: '#1e5c2c', fontWeight: 600 },
  nudge: { marginTop: '0.5rem', padding: '0.45rem 0.6rem', borderRadius: 4, background: '#f0f4ff', color: '#1a3e8c', fontSize: 12 },
}

const WORDING = {
  merchant: {
    beforeOffer: 'Cart total before offer',
    total: (hasOffer) => (hasOffer ? 'Final cart total' : 'Cart total'),
    offerNote: (line, subtotal) => `Your cart total of ${rs(subtotal)} meets the ${rs(line.minCartValue)} minimum (${line.ruleId})`,
    nudge: (n) => `No cart offer yet: the cart is ${rs(n.shortfall)} short of ${n.ruleId} (${n.offer} at ${rs(n.minCartValue)} or more).`,
  },
  customer: {
    beforeOffer: 'Items total',
    total: () => 'You pay',
    offerNote: (line) => `For carts of ${rs(line.minCartValue)} or more`,
    nudge: (n) => `Add ${rs(n.shortfall)} more to get ${n.offer} your cart.`,
  },
}

export default function CartSummary({ pricing, nudge = null, variant = 'merchant' }) {
  const { subtotal, cartOffer, total, totalSavings } = pricing
  const w = WORDING[variant] ?? WORDING.merchant

  return (
    <div style={S.wrap}>
      {cartOffer && (
        <>
          <div style={S.row}>
            <span style={S.label}>{w.beforeOffer}</span>
            <span style={S.value}>{rs(subtotal)}</span>
          </div>
          {cartOffer.lines.map((line) => (
            <div key={line.ruleId} style={{ ...S.row, ...S.offerRow }}>
              <div>
                <div style={S.offerLabel}>{line.label} — {rs(line.amount)} saved</div>
                <div style={S.offerNote}>{w.offerNote(line, subtotal)}</div>
              </div>
              <span style={S.offerValue}>−{rs(line.amount)}</span>
            </div>
          ))}
        </>
      )}

      <div style={{ ...S.row, ...(cartOffer ? S.finalRow : {}) }}>
        <span style={S.finalLabel}>{w.total(Boolean(cartOffer))}</span>
        <span style={S.finalValue}>{rs(total)}</span>
      </div>

      {totalSavings > 0 && <div style={S.savings}>You save {rs(totalSavings)} on this order</div>}
      {nudge && <div style={S.nudge} role="note">{w.nudge(nudge)}</div>}
    </div>
  )
}
