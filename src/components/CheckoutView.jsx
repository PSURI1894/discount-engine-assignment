/**
 * CheckoutView.jsx
 *
 * The cart as a shopper sees it at checkout: per item, one final price (with
 * the original price struck through when discounted) and one offer label with
 * the saving — "one final price, one offer label, no surprises". No rule IDs or
 * engine statuses. The labels are the engine's own explanations, so this view
 * can never disagree with the merchant view.
 */

import { formatRupees as rs } from '../engine/format.js'
import CartSummary from './CartSummary.jsx'

const S = {
  wrap: { maxWidth: 640, margin: '0 auto', border: '1px solid #e2e2e8', borderRadius: 8, padding: '1rem 1.2rem', background: '#fff' },
  heading: { fontWeight: 700, fontSize: 15, color: '#131A48', marginBottom: '0.4rem' },
  item: { display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.7rem 0', borderBottom: '1px solid #f0f0f3' },
  product: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  meta: { fontSize: 11, color: '#888', marginTop: 1 },
  offer: { display: 'inline-block', marginTop: 5, fontSize: 12, color: '#1e5c2c', background: '#eaf6ed', borderRadius: 4, padding: '2px 7px' },
  noOffer: { marginTop: 5, fontSize: 12, color: '#888', fontStyle: 'italic' },
  prices: { textAlign: 'right', whiteSpace: 'nowrap' },
  was: { fontSize: 12, color: '#999', textDecoration: 'line-through' },
  now: { fontSize: 15, fontWeight: 700, color: '#131A48' },
}

export default function CheckoutView({ pricing, nudge }) {
  const count = pricing.items.length

  return (
    <div style={S.wrap} role="region" aria-label="Customer checkout view">
      <div style={S.heading}>Your cart ({count} item{count === 1 ? '' : 's'})</div>

      {pricing.items.map((item) => (
        <div key={item.itemId} style={S.item}>
          <div>
            <div style={S.product}>{item.product}</div>
            <div style={S.meta}>{item.brand} · {item.platform}</div>
            {item.totalDiscount > 0
              ? <div style={S.offer}>{item.reasoning} · You save {rs(item.totalDiscount)}</div>
              : <div style={S.noOffer}>{item.reasoning}</div>}
          </div>
          <div style={S.prices}>
            {item.totalDiscount > 0 && <div style={S.was}>{rs(item.basePrice)}</div>}
            <div style={S.now}>{rs(item.finalPrice)}</div>
          </div>
        </div>
      ))}

      <CartSummary pricing={pricing} nudge={nudge} variant="customer" />
    </div>
  )
}
