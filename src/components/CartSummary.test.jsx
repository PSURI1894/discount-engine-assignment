import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CartSummary from './CartSummary.jsx'
import { priceCart } from '../engine/discountEngine.js'
import { SAMPLE_CART, SAMPLE_RULES, RULE_04, item } from '../test/fixtures.js'

const render = (pricing) => renderToStaticMarkup(<CartSummary pricing={pricing} />)

describe('CartSummary', () => {
  it('shows the cart offer as its own line and the final total when the minimum is met', () => {
    const html = render(priceCart(SAMPLE_CART, SAMPLE_RULES))
    expect(html).toContain('Cart total before offer')
    expect(html).toContain('Rs.5,932')
    expect(html).toContain('Cart offer: 10% off — Rs.593 saved')
    expect(html).toContain('Final cart total')
    expect(html).toContain('Rs.5,339')
  })

  it('shows no cart offer line when the cart is below the minimum', () => {
    const html = render(priceCart([item({ basePrice: 3999 })], [RULE_04]))
    expect(html).not.toContain('Cart offer')
    expect(html).not.toContain('before offer')
    expect(html).toContain('Cart total')
    expect(html).toContain('Rs.3,999')
  })

  it('adds a separate hint — not an offer line — when the cart is just below a minimum', () => {
    const nudge = { ruleId: 'RULE-04', shortfall: 1, minCartValue: 4000, offer: '10% off' }
    const pricing = priceCart([item({ basePrice: 3999 })], [RULE_04])
    expect(renderToStaticMarkup(<CartSummary pricing={pricing} nudge={nudge} />))
      .toContain('No cart offer yet: the cart is Rs.1 short of RULE-04 (10% off at Rs.4,000 or more, counted after item offers).')
    expect(renderToStaticMarkup(<CartSummary pricing={pricing} nudge={nudge} variant="customer" />))
      .toContain('Rs.1 away from 10% off your cart. It applies from Rs.4,000, counted after item offers.') // "You're" is HTML-escaped
  })

  it('uses checkout wording without rule IDs in the customer variant', () => {
    const html = renderToStaticMarkup(<CartSummary pricing={priceCart(SAMPLE_CART, SAMPLE_RULES)} variant="customer" />)
    expect(html).toContain('Items total')
    expect(html).toContain('You pay')
    expect(html).toContain('For carts of Rs.4,000 or more')
    expect(html).not.toContain('RULE-04')
  })
})
