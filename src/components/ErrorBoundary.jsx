/**
 * ErrorBoundary.jsx
 *
 * Last line of defence: if a render ever throws, show a message with a reload
 * button instead of a blank page.
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unexpected error while rendering', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ maxWidth: 560, margin: '4rem auto', padding: '1.2rem 1.4rem', fontFamily: 'Arial, sans-serif', border: '1px solid #e57373', borderRadius: 6, background: '#fdf0f0', color: '#5a1010' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Something went wrong.</div>
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          The page hit an unexpected error. Reloading starts a fresh session (rules and carts aren't saved).
        </div>
        <button type="button" onClick={() => window.location.reload()} style={{ background: '#131A48', color: '#fff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem', cursor: 'pointer' }}>
          Reload
        </button>
      </div>
    )
  }
}
