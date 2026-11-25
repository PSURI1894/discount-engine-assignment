/**
 * sampleData.js
 *
 * The files in sample-data/, bundled so the deployed app can load them in one
 * click and offer them for download — graders shouldn't need to clone the repo
 * to try the uploads. The CSV text still goes through the normal CSV adapter.
 */

import rulesCsv from '../sample-data/rules.csv?raw'
import cartCsv from '../sample-data/cart.csv?raw'
import rulesCsvUrl from '../sample-data/rules.csv?url'
import cartCsvUrl from '../sample-data/cart.csv?url'
import cartPdfUrl from '../sample-data/cart.pdf?url'
import smallOrderPdfUrl from '../sample-data/cart-small-order.pdf?url'
import withErrorsPdfUrl from '../sample-data/cart-with-errors.pdf?url'

export const SAMPLE_RULES_CSV = rulesCsv
export const SAMPLE_CART_CSV = cartCsv

export const SAMPLE_FILES = [
  { name: 'rules.csv', url: rulesCsvUrl },
  { name: 'cart.csv', url: cartCsvUrl },
  { name: 'cart.pdf', url: cartPdfUrl, note: 'the brief’s cart' },
  { name: 'cart-small-order.pdf', url: smallOrderPdfUrl, note: 'below the cart offer' },
  { name: 'cart-with-errors.pdf', url: withErrorsPdfUrl, note: 'two broken rows' },
]
