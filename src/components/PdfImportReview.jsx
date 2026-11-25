/**
 * PdfImportReview.jsx
 *
 * Shown when a cart PDF was only partly readable. Replacing the cart with a
 * partial cart silently would change the total — and can switch a cart offer
 * on or off — so the user sees exactly what was skipped and decides.
 * A fully readable PDF replaces the cart straight away without this step.
 */

import { formatRupees as rs } from '../engine/format.js'

const S = {
  card: { border: '1px solid #f0c27a', background: '#fffaf0', borderRadius: 6, padding: '0.8rem 0.9rem', marginTop: '0.75rem', fontSize: 12, color: '#131A48' },
  title: { fontWeight: 700, fontSize: 13, marginBottom: '0.4rem' },
  list: { margin: '0.3rem 0', paddingLeft: '1.1rem' },
  muted: { color: '#7a6a50' },
  actions: { display: 'flex', gap: '0.6rem', marginTop: '0.7rem', flexWrap: 'wrap' },
  replace: { background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  keep: { background: '#fff', color: '#131A48', border: '1px solid #CECECE', borderRadius: 4, padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}

export default function PdfImportReview({ fileName, result, currentTotal, newTotal, onReplace, onCancel }) {
  const { items, skipped, ignoredLines, ignoredColumns = [], orderRef } = result
  const rowCount = items.length + skipped.length

  return (
    <div style={S.card} role="region" aria-label="Review cart PDF">
      <div style={S.title}>
        Read {items.length} of {rowCount} item rows from {fileName}{orderRef ? ` (order #${orderRef})` : ''}
      </div>

      <div>These rows couldn't be read and would not be in the cart:</div>
      <ul style={S.list}>
        {skipped.map((s) => (
          <li key={s.row}>Row {s.row} — “{s.text}”: {s.reason}</li>
        ))}
      </ul>

      {ignoredLines.length > 0 && (
        <div style={S.muted}>Ignored (not items): {ignoredLines.join('; ')}</div>
      )}
      {ignoredColumns.length > 0 && (
        <div style={S.muted}>Ignored column{ignoredColumns.length === 1 ? '' : 's'}: {ignoredColumns.join(', ')}</div>
      )}

      <div style={{ marginTop: '0.4rem' }}>
        {currentTotal === null
          ? <>Cart total with the {items.length} readable items: <strong>{rs(newTotal)}</strong></>
          : <>Cart total would change: {rs(currentTotal)} → <strong>{rs(newTotal)}</strong></>}
      </div>

      <div style={S.actions}>
        <button type="button" style={S.replace} onClick={onReplace}>
          Replace cart with {items.length} item{items.length === 1 ? '' : 's'}
        </button>
        <button type="button" style={S.keep} onClick={onCancel}>Keep current cart</button>
      </div>
    </div>
  )
}
