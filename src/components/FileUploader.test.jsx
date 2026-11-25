// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import FileUploader from './FileUploader.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderUploader = (onLoad = vi.fn()) => {
  render(<FileUploader label="cart.csv" description="Upload your cart CSV" onLoad={onLoad} hasData={false} />)
  return { onLoad, zone: screen.getByRole('button', { name: /cart\.csv/ }) }
}

describe('FileUploader', () => {
  it('can be opened from the keyboard', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { zone } = renderUploader()
    expect(zone.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(zone, { key: 'Enter' })
    fireEvent.keyDown(zone, { key: ' ' })
    fireEvent.keyDown(zone, { key: 'a' })
    expect(click).toHaveBeenCalledTimes(2)
  })

  it('reads a dropped file', async () => {
    const { zone, onLoad } = renderUploader()
    const file = new File(['item_id,product\n'], 'dropped.csv', { type: 'text/csv' })
    fireEvent.dragOver(zone)
    expect(screen.getByText('Drop to upload')).toBeTruthy()
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith('item_id,product\n', 'dropped.csv'))
  })
})
