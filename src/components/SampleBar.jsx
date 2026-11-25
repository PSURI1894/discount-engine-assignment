/**
 * SampleBar.jsx — load the sample rules and cart in one click, or download the
 * sample files to try the uploads (so the live site works without the repo).
 */

import { SAMPLE_FILES } from '../sampleData.js'

const S = {
  bar: { display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', fontSize: 12, color: '#555', marginBottom: '1rem' },
  button: { background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  link: { color: '#1a3e8c' },
}

export default function SampleBar({ onLoadSample }) {
  return (
    <div style={S.bar}>
      <button type="button" style={S.button} onClick={onLoadSample}>Load sample data</button>
      <span>
        or download the sample files to try the uploads:{' '}
        {SAMPLE_FILES.map((f, i) => (
          <span key={f.name}>
            {i > 0 && ' · '}
            <a href={f.url} download={f.name} style={S.link} title={f.note}>{f.name}</a>
          </span>
        ))}
      </span>
    </div>
  )
}
