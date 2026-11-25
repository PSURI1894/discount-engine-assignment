/**
 * RuleInput.jsx
 *
 * Plain-English rule entry: text box → parser → confirmation (or a clear
 * explanation of why the rule can't be added). Confirmed rules are handed to
 * the parent through onAddRule; the engine itself is never called from here
 * except to preview the effect.
 */

import { useState } from 'react'
import { parseRuleFromText } from '../inputs/nlRuleInput.js'
import { previewRule } from '../engine/preview.js'
import RuleConfirmation from './RuleConfirmation.jsx'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
  'Give a discount for big orders',
]

const PROBLEM_TITLES = {
  unresolvable: 'Need a bit more detail',
  unsupported: "This rule can't be added",
  invalid: "The parsed rule didn't pass validation",
  error: 'Something went wrong',
}

const S = {
  form: { display: 'flex', gap: '0.6rem' },
  input: { flex: 1, padding: '0.55rem 0.7rem', border: '1px solid #CECECE', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' },
  button: { background: '#131A48', color: '#fff', border: 'none', borderRadius: 4, padding: '0.55rem 1.2rem', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  examples: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginTop: '0.55rem', fontSize: 11, color: '#888' },
  chip: { background: '#f3f3f6', border: '1px solid #e0e0e6', borderRadius: 20, padding: '2px 9px', fontSize: 11, color: '#131A48', cursor: 'pointer' },
  problem: { border: '1px solid #e57373', borderLeft: '3px solid #c0392b', background: '#fdf0f0', borderRadius: 4, padding: '0.6rem 0.8rem', marginTop: '0.8rem', fontSize: 12, color: '#5a1010' },
  problemTitle: { fontWeight: 700, marginBottom: 3, color: '#8a1a1a' },
  note: { fontSize: 11, color: '#888', marginTop: 4 },
}

function ParseProblem({ result }) {
  return (
    <div style={S.problem} role="alert">
      <div style={S.problemTitle}>{PROBLEM_TITLES[result.status] ?? PROBLEM_TITLES.error}</div>
      <div>{result.message}</div>
      {result.errors?.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      {result.parserNote && <div style={S.note}>{result.parserNote}</div>}
    </div>
  )
}

export default function RuleInput({ rules, cartItems, onAddRule }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const description = text.trim()
    if (!description || busy) return
    setBusy(true)
    setResult(null)
    setResult(await parseRuleFromText(description, { rules, cartItems }))
    setBusy(false)
  }

  function handleConfirm() {
    onAddRule(result.rule)
    setResult(null)
    setText('')
  }

  function chooseExample(example) {
    setText(example)
    setResult(null)
  }

  return (
    <div>
      <form style={S.form} onSubmit={handleSubmit}>
        <input
          style={S.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "Rs.100 flat discount on all Flipkart items"'
          aria-label="Describe a discount rule"
          maxLength={300}
        />
        <button type="submit" style={{ ...S.button, opacity: busy || !text.trim() ? 0.6 : 1 }} disabled={busy || !text.trim()}>
          {busy ? 'Reading…' : 'Parse rule'}
        </button>
      </form>

      <div style={S.examples}>
        Try:
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" style={S.chip} onClick={() => chooseExample(ex)}>{ex}</button>
        ))}
      </div>

      {result?.status === 'ok' && (
        <RuleConfirmation
          rule={result.rule}
          assumptions={result.assumptions}
          warnings={result.warnings}
          parser={result.parser}
          parserNote={result.parserNote}
          preview={previewRule(cartItems, rules, result.rule)}
          onConfirm={handleConfirm}
          onDiscard={() => setResult(null)}
        />
      )}
      {result && result.status !== 'ok' && <ParseProblem result={result} />}
    </div>
  )
}
