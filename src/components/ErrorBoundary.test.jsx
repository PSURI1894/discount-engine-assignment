// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Broken() {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('shows a message with a reload button instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // React logs the caught error
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong/)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('renders its children when nothing goes wrong', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeTruthy()
  })
})
