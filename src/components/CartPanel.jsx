/**
 * CartPanel.jsx — load the cart from cart.csv or a cart PDF, review a partly
 * readable PDF before it replaces the cart, and see the items loaded.
 */

import FileUploader from './FileUploader.jsx'
import DataTable from './DataTable.jsx'
import ErrorBanner from './ErrorBanner.jsx'
import PdfImportReview from './PdfImportReview.jsx'
import { Panel, ui, nowrap, plural } from './ui.jsx'
import { formatRupees as rs } from '../engine/format.js'

const COLUMNS = [
  { key: 'itemId', label: 'Item', render: nowrap },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rs(v) },
]

const S = {
  notice: { background: '#eef6f0', border: '1px solid #b9dcc3', borderRadius: 4, padding: '0.5rem 0.7rem', marginTop: '0.5rem', fontSize: 12, color: '#1e5c2c' },
}

/** `cart` is the useCart() state; `priceItems` prices a candidate cart with the active rules (for the review panel). */
export default function CartPanel({ cart, currentTotal, priceItems }) {
  const { items, errors, source, notice, pdfBusy, pdfReview } = cart

  return (
    <Panel title="Cart Items">
      <FileUploader
        label="cart.csv"
        description="Upload your cart CSV"
        onLoad={cart.loadCartCsv}
        hasData={source?.kind === 'csv'}
        fileName={source?.fileName}
      />
      <div style={{ height: '0.5rem' }} />
      <FileUploader
        label="cart.pdf"
        description="Or upload a cart PDF (Product, Brand, Platform, Base Price)"
        onLoad={cart.loadCartPdf}
        accept=".pdf,application/pdf"
        readAs="arrayBuffer"
        busy={pdfBusy}
        hasData={source?.kind === 'pdf'}
        fileName={source?.fileName}
      />
      <ErrorBanner errors={errors} />

      {pdfReview && (
        <PdfImportReview
          fileName={pdfReview.fileName}
          result={pdfReview.result}
          currentTotal={currentTotal}
          newTotal={priceItems(pdfReview.result.items).total}
          onReplace={cart.acceptPdfReview}
          onCancel={cart.cancelPdfReview}
        />
      )}

      {notice && (
        <div style={S.notice} role="status">
          {notice.text}
          {notice.details.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>
              {notice.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={ui.count}>{plural(items.length, 'item')} loaded</div>
          <DataTable columns={COLUMNS} rows={items} />
        </div>
      )}
    </Panel>
  )
}
