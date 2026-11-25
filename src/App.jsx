/**
 * App.jsx
 *
 * Wires input → state → engine → display:
 *   useRules / useCart hold what the inputs loaded (CSV, plain English, PDF);
 *   priceCart() derives the prices from them, so any change re-runs the engine;
 *   the panels display the result.
 */

import { useMemo } from 'react'
import SampleBar from './components/SampleBar.jsx'
import RulesPanel from './components/RulesPanel.jsx'
import CartPanel from './components/CartPanel.jsx'
import RuleInput from './components/RuleInput.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import { Panel, ui } from './components/ui.jsx'
import { useRules } from './state/useRules.js'
import { useCart } from './state/useCart.js'
import { priceCart } from './engine/discountEngine.js'
import { nextCartOffer } from './engine/preview.js'
import { SAMPLE_RULES_CSV, SAMPLE_CART_CSV } from './sampleData.js'

const S = {
  page: { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header: { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoAccent: { color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main: { maxWidth: 1180, margin: '0 auto', padding: '1.8rem 1.5rem' },
}

export default function App() {
  const rules = useRules()
  const cart = useCart()

  // Prices are derived, never stored: any change to the rules or the cart re-runs the engine.
  const pricing = useMemo(() => (cart.items.length > 0 ? priceCart(cart.items, rules.rules) : null), [cart.items, rules.rules])
  const nudge = useMemo(() => (pricing ? nextCartOffer(pricing, rules.rules) : null), [pricing, rules.rules])

  function loadSampleData() {
    rules.loadRulesCsv(SAMPLE_RULES_CSV, 'rules.csv (sample)')
    cart.loadCartCsv(SAMPLE_CART_CSV, 'cart.csv (sample)')
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.logo}>O<span style={S.logoAccent}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </header>

      <main style={S.main}>
        <SampleBar onLoadSample={loadSampleData} />

        <div className="upload-grid">
          <RulesPanel
            rules={rules.rules}
            fileRules={rules.fileRules}
            addedRules={rules.addedRules}
            addedIds={rules.addedIds}
            errors={rules.errors}
            fileName={rules.fileName}
            onLoad={rules.loadRulesCsv}
            onRemove={rules.removeRule}
          />
          <CartPanel
            cart={cart}
            currentTotal={pricing ? pricing.total : null}
            priceItems={(items) => priceCart(items, rules.rules)}
          />
        </div>

        <Panel title="Add a rule in plain English">
          <RuleInput rules={rules.rules} cartItems={cart.items} onAddRule={rules.addRule} />
        </Panel>

        {pricing ? (
          <ResultsPanel pricing={pricing} nudge={nudge} hasRules={rules.rules.length > 0} />
        ) : (
          <div style={{ ...ui.hint, textAlign: 'center', marginBottom: '1.2rem' }}>
            Load a cart to see prices. They update automatically whenever the rules or the cart change.
          </div>
        )}
      </main>
    </div>
  )
}
