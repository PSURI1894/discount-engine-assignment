/**
 * ui.jsx — shared styles and tiny render helpers used by the panels.
 */

export const ui = {
  panel: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  panelTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  hint: { fontSize: 12, color: '#888', marginBottom: '0.6rem' },
  count: { fontSize: 11, color: '#888', marginBottom: 4 },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
    background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
  }),
}

export const capitalise = (v) => v.charAt(0).toUpperCase() + v.slice(1)
export const nowrap = (v) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Panel({ title, actions, children }) {
  return (
    <section style={ui.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={ui.panelTitle}>{title}</div>
        {actions}
      </div>
      {children}
    </section>
  )
}
