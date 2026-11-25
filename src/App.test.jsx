import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from './App.jsx'

describe('App', () => {
  it('renders the empty state without crashing', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Discount Rules')
    expect(html).toContain('Cart Items')
    expect(html).toContain('Load a cart to see prices')
  })
})
