/**
 * RuleConfirmation.jsx
 *
 * The confirmation step for a parsed rule: the fields in plain language, what
 * the parser assumed, any warnings, and a preview of what the rule would do to
 * the current cart. Nothing is added until the user clicks "Add rule".
 */

import { formatRupees as rs, formatRuleValue } from '../engine/format.js'

const S = {
  card: { border: '1px solid #131A48', borderRadius: 6, padding: '0.9rem 1rem', marginTop: '0.8rem', background: '#fbfbfe' },
  title: { fontWeight: 700, fontSize: 13, color: '#131A48', marginBottom: '0.6rem' },
  fields: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.7rem' },
  fieldLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  fieldValue: { fontSize: 13, color: '#131A48', fontWeight: 700, marginTop: 2 },
  block: { fontSize: 12, color: '#131A48', margin: '0.5rem 0' },
  blockTitle: { fontWeight: 700, marginBottom: 3 },
  list: { margin: 0, paddingLeft: '1.1rem' },
  warning: { background: '#fff4e0', border: '1px solid #f0c27a', borderRadius: 4, padding: '0.45rem 0.6rem', fontSize: 12, color: '#7a4a00', margin: '0.5rem 0' },
  preview: { background: '#f0f4ff', borderRadius: 4, padding: '0.5rem 0.7rem', fontSize: 12, color: '#131A48', margin: '0.5rem 0' },
  parser: { fontSize: 11, color: '#888', marginTop: '0.4rem' },
  actions: { display: 'flex', gap: '0.6rem', marginTop: '0.8rem' },
  confirm: { background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4, padding: '0.5rem 1.2rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  discard: { background: '#fff', color: '#131A48', border: '1px solid #CECECE', borderRadius: 4, padding: '0.5rem 1.2rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}

const capitalise = (v) => v.charAt(0).toUpperCase() + v.slice(1)

function Field({ label, value }) {
  return (
    <div>
      <div style={S.fieldLabel}>{label}</div>
      <div style={S.fieldValue}>{value}</div>
    </div>
  )
}

function Preview({ preview }) {
  if (!preview) {
    return <div style={S.preview}>Load a cart to preview the effect on prices.</div>
  }
  if (!preview.changed) {
    return <div style={S.preview}><strong>No change to the current cart.</strong> {preview.reason}</div>
  }
  return (
    <div style={S.preview}>
      <div style={S.blockTitle}>Effect on the current cart</div>
      <ul style={S.list}>
        {preview.itemChanges.map((c) => (
          <li key={c.itemId}>{c.itemId} {c.product}: {rs(c.from)} → <strong>{rs(c.to)}</strong></li>
        ))}
        {preview.cartOfferChange && (
          <li>Cart offer: −{rs(preview.cartOfferChange.from)} → <strong>−{rs(preview.cartOfferChange.to)}</strong></li>
        )}
        {preview.totalChange && (
          <li>Final cart total: {rs(preview.totalChange.from)} → <strong>{rs(preview.totalChange.to)}</strong></li>
        )}
      </ul>
    </div>
  )
}

export default function RuleConfirmation({ rule, assumptions, warnings, parser, parserNote, preview, onConfirm, onDiscard }) {
  const isCart = rule.scope === 'cart'

  return (
    <div style={S.card} role="region" aria-label="Confirm new rule">
      <div style={S.title}>Check this rule before adding it ({rule.ruleId})</div>

      <div style={S.fields}>
        <Field label="Scope" value={capitalise(rule.scope)} />
        <Field label="Applies to" value={isCart ? 'Entire cart' : rule.appliesTo} />
        <Field label="Type" value={capitalise(rule.type)} />
        <Field label="Value" value={formatRuleValue(rule)} />
        {isCart && <Field label="Min cart value" value={`${rs(rule.minCartValue)} or more`} />}
        <Field label="Stackable" value={rule.stackable ? 'Yes' : 'No'} />
      </div>

      {assumptions.length > 0 && (
        <div style={S.block}>
          <div style={S.blockTitle}>Assumed (not stated in your description)</div>
          <ul style={S.list}>{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {warnings.map((w) => <div key={w} style={S.warning}>⚠ {w}</div>)}

      <Preview preview={preview} />

      <div style={S.parser}>
        Parsed by {parser === 'offline' ? 'the built-in offline parser' : parser}.{parserNote ? ` ${parserNote}` : ''}
      </div>

      <div style={S.actions}>
        <button type="button" style={S.confirm} onClick={onConfirm}>Add rule</button>
        <button type="button" style={S.discard} onClick={onDiscard}>Discard</button>
      </div>
    </div>
  )
}
