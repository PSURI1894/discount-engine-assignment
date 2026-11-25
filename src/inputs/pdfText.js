/**
 * pdfText.js
 *
 * Reads the text of a PDF with pdf.js and groups it into lines, keeping each
 * piece's horizontal position so table columns can be recovered.
 *
 * pdf.js is loaded on demand, so people who never upload a PDF don't download it.
 * Tests pass in pdf.js's Node build instead (see pdfCartInput.test.js).
 */

export class PdfReadError extends Error {}

/** Loads pdf.js and its worker for the browser. */
export async function loadBrowserPdfJs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

// Pieces of text whose baselines are closer than this (in points) are on the same line.
const SAME_LINE_TOLERANCE = 2

/**
 * Returns the PDF's text as lines in reading order:
 *   [{ page, y, items: [{ str, x, width }] }]
 * Throws PdfReadError with a customer-readable message if the file can't be opened.
 */
export async function extractPdfLines(data, pdfjs) {
  const lib = pdfjs ?? (await loadBrowserPdfJs())

  let doc
  try {
    // Only text is extracted, so font data for rendering isn't needed; verbosity 0 hides those warnings.
    doc = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise
  } catch (err) {
    throw new PdfReadError(
      err?.name === 'PasswordException'
        ? 'This PDF is password-protected. Upload an unprotected copy.'
        : "This file couldn't be read as a PDF."
    )
  }

  const lines = []
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const { items } = await page.getTextContent()
      const pageLines = []

      for (const item of items) {
        if (typeof item.str !== 'string' || item.str.trim() === '') continue
        const x = item.transform[4]
        const y = item.transform[5]
        let line = pageLines.find((l) => Math.abs(l.y - y) < SAME_LINE_TOLERANCE)
        if (!line) {
          line = { page: pageNumber, y, items: [] }
          pageLines.push(line)
        }
        line.items.push({ str: item.str, x, width: item.width })
      }

      pageLines.sort((a, b) => b.y - a.y) // PDF y grows upwards: top of the page first
      for (const line of pageLines) line.items.sort((a, b) => a.x - b.x)
      lines.push(...pageLines)
    }
  } finally {
    await doc.destroy()
  }

  return lines
}
