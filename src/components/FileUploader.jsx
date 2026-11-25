/**
 * FileUploader.jsx
 *
 * Renders a file upload area for a single file: click it, press Enter/Space
 * when it has focus, or drop a file on it.
 * Calls onLoad(content, fileName) — content is text by default, or an
 * ArrayBuffer when readAs="arrayBuffer" (e.g. PDFs).
 */

import { useRef, useState } from 'react'

export default function FileUploader({ label, description, onLoad, hasData, fileName, accept = '.csv', readAs = 'text', busy = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function readFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => onLoad(evt.target.result, file.name)
    if (readAs === 'arrayBuffer') reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
  }

  function handleFile(e) {
    readFile(e.target.files[0])
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    readFile(e.dataTransfer?.files?.[0])
  }

  const active = hasData || dragging

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        border: `2px dashed ${dragging ? '#FF5800' : hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: dragging ? '#fff6ef' : hasData ? '#f0faf2' : '#fafafa',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleFile}
        aria-label={`Upload ${label}`}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">{hasData ? '✅' : '📄'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {dragging ? 'Drop to upload' : hasData ? fileName : description}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: active ? '#1e5c2c' : '#FF5800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {busy ? 'Reading…' : hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
