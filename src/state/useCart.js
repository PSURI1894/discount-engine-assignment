/**
 * useCart.js
 *
 * The current cart and how it gets replaced:
 *   - cart.csv: replaces the cart if any row is usable (bad rows are reported).
 *   - cart PDF: a fully readable PDF replaces the cart at once; a partly
 *     readable one waits for the user to review it; an unreadable one leaves the
 *     cart as it was.
 * A file that yields nothing usable never wipes out the current cart, and a
 * slow PDF never overwrites a cart that was loaded after it.
 */

import { useRef, useState } from 'react'
import { parseCartCSV } from '../inputs/csvInput.js'
import { readPdfCart } from '../inputs/pdfCartInput.js'

const describeSkipped = (s) => `Row ${s.row} skipped (“${s.text}”): ${s.reason}`

/** What a PDF import did, for the notice under the uploaders. */
function pdfNotice(fileName, { items, skipped, ignoredLines, ignoredColumns = [], orderRef }) {
  const order = orderRef ? ` (order #${orderRef})` : ''
  return {
    text: `Loaded ${items.length} item${items.length === 1 ? '' : 's'} from ${fileName}${order}.`,
    details: [
      ...skipped.map(describeSkipped),
      ...(ignoredLines.length > 0 ? [`Ignored (not items): ${ignoredLines.join('; ')}`] : []),
      ...(ignoredColumns.length > 0 ? [`Ignored column${ignoredColumns.length === 1 ? '' : 's'}: ${ignoredColumns.join(', ')}`] : []),
    ],
  }
}

export function useCart() {
  const [items, setItems] = useState([])
  const [errors, setErrors] = useState([])
  const [source, setSource] = useState(null) // { kind: 'csv' | 'pdf', fileName }
  const [notice, setNotice] = useState(null) // what the last PDF import did
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfReview, setPdfReview] = useState(null) // { fileName, result } awaiting a decision
  const latestLoad = useRef(0) // increments on every cart upload; older PDF results are ignored

  const keptCartNote = () => (items.length > 0 ? ['Nothing was loaded from this file, so the previous cart is unchanged.'] : [])

  function replaceCart(newItems, newSource, { errors: rowErrors = [], notice: newNotice = null } = {}) {
    setItems(newItems)
    setSource(newSource)
    setErrors(rowErrors)
    setNotice(newNotice)
    setPdfReview(null)
  }

  function loadCartCsv(csvText, fileName) {
    latestLoad.current += 1 // any PDF still being read is now out of date
    setPdfBusy(false)
    setPdfReview(null)
    const { data, errors: rowErrors } = parseCartCSV(csvText)
    if (data.length === 0) {
      setErrors([...rowErrors, ...keptCartNote()])
      return
    }
    replaceCart(data, { kind: 'csv', fileName }, { errors: rowErrors })
  }

  async function loadCartPdf(buffer, fileName) {
    const loadId = ++latestLoad.current
    setPdfBusy(true)
    setPdfReview(null)
    const result = await readPdfCart(buffer)
    if (loadId !== latestLoad.current) return // another cart was loaded while this PDF was being read
    setPdfBusy(false)

    if (result.fileError) {
      setErrors([`${fileName}: ${result.fileError}`, ...result.skipped.map(describeSkipped), ...keptCartNote()])
      return
    }
    if (result.skipped.length > 0) {
      setPdfReview({ fileName, result })
      return
    }
    replaceCart(result.items, { kind: 'pdf', fileName }, { notice: pdfNotice(fileName, result) })
  }

  function acceptPdfReview() {
    const { fileName, result } = pdfReview
    replaceCart(result.items, { kind: 'pdf', fileName }, { notice: pdfNotice(fileName, result) })
  }

  const cancelPdfReview = () => setPdfReview(null)

  return { items, errors, source, notice, pdfBusy, pdfReview, loadCartCsv, loadCartPdf, acceptPdfReview, cancelPdfReview }
}
