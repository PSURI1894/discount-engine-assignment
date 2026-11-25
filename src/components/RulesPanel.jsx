/**
 * RulesPanel.jsx — upload rules.csv and see every active rule. Rules added in
 * plain English are marked under their ID, with a link to remove them.
 */

import FileUploader from './FileUploader.jsx'
import DataTable from './DataTable.jsx'
import ErrorBanner from './ErrorBanner.jsx'
import { Panel, ui, capitalise, nowrap, plural } from './ui.jsx'
import { formatRupees as rs, formatRuleValue } from '../engine/format.js'

const S = {
  added: { fontSize: 10, color: '#888', marginTop: 2 },
  removeLink: { background: 'none', border: 'none', padding: 0, color: '#c0392b', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' },
}

function columns(addedIds, onRemove) {
  const ruleId = (id) =>
    addedIds.has(id) ? (
      <span style={{ whiteSpace: 'nowrap' }}>
        {id}
        <div style={S.added}>
          added ·{' '}
          <button type="button" style={S.removeLink} onClick={() => onRemove(id)} aria-label={`Remove ${id}`}>remove</button>
        </div>
      </span>
    ) : (
      nowrap(id)
    )

  return [
    { key: 'ruleId', label: 'Rule ID', render: ruleId },
    { key: 'scope', label: 'Scope', render: capitalise },
    { key: 'appliesTo', label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
    { key: 'value', label: 'Value', render: (v, row) => formatRuleValue(row) },
    { key: 'minCartValue', label: 'Condition', render: (v) => (v ? `Cart total ≥ ${rs(v)}` : '—') },
    { key: 'stackable', label: 'Stackable', render: (v) => (v ? 'Yes' : 'No') },
  ]
}

export default function RulesPanel({ rules, fileRules, addedRules, addedIds, errors, fileName, onLoad, onRemove }) {
  return (
    <Panel title="Discount Rules">
      <FileUploader
        label="rules.csv"
        description="Upload your discount rules CSV"
        onLoad={onLoad}
        hasData={fileRules.length > 0}
        fileName={fileName}
      />
      <ErrorBanner errors={errors} />
      {rules.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={ui.count}>
            {plural(rules.length, 'active rule')}
            {addedRules.length > 0 && ` (${fileRules.length} from file, ${addedRules.length} added)`}
          </div>
          <DataTable columns={columns(addedIds, onRemove)} rows={rules} />
        </div>
      )}
    </Panel>
  )
}
