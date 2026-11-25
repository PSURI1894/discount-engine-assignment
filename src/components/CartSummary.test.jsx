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
})
