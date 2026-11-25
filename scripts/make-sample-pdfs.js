/**
 * Writes the sample cart PDFs to sample-data/.  Run: npm run make:pdfs
 */
import { writeFile } from 'node:fs/promises'
import { buildCartPdf, SAMPLE_PDFS } from './samplePdfs.js'

for (const [name, spec] of Object.entries(SAMPLE_PDFS)) {
  const path = new URL(`../sample-data/${name}`, import.meta.url)
  await writeFile(path, await buildCartPdf(spec))
  console.log(`wrote sample-data/${name}`)
}
