# Opptra Discount Engine

[![CI](https://github.com/PSURI1894/discount-engine-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/PSURI1894/discount-engine-assignment/actions/workflows/ci.yml)

**Live demo:** _add the Vercel URL here after deploying_

A checkout pricing engine. For every cart item it applies the offer that saves the customer the most,
stacks stackable offers on top, applies cart-level offers to the total, and explains the result in
plain language. Rules come from a CSV or are typed in plain English; carts come from a CSV or a PDF.

**In 30 seconds**
- The brief's expected results reproduce exactly (Rs.5,339). They were pinned in tests before any
  change was made.
- **Task 1:** the cart offer is its own line, checked against the subtotal after item discounts. The
  minimum is inclusive, and below it there is no offer line.
- **Task 2:** plain English → LLM → the same validator as CSV rows → a confirmation card with a price
  preview. Nothing is applied until the user confirms, and vague or unsupported rules get a specific
  message.
- **Task 3:** PDF carts are read in the browser. If some rows can't be read, the user reviews them
  before the cart is replaced.
- Inputs are adapters around one validator, so the calculator never needs to know where rules or carts
  came from.
- What goes beyond the brief, and why, is listed under [Scope](#scope).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Load sample data**. No API key is needed: without one,
plain-English rules are read by a built-in rule-based parser ([LLM setup](#llm-setup)).

## Try it in two minutes

1. Click **Load sample data**, or upload `rules.csv` and `cart.csv`; the app offers every sample file
   for download. The brief's expected results appear straight away:

   | Item | Base | Final | Explanation shown | Status |
   |---|---|---|---|---|
   | ITEM-01 | Rs.1,299 | Rs.1,104 | Amazon India offer: 15% off (better than Natura Casa Rs.150 off) | Max discount |
   | ITEM-02 | Rs.849 | Rs.629 | Natura Casa offer: Rs.150 off + Flipkart offer: 10% off | Stacked |
   | ITEM-03 | Rs.599 | Rs.509 | Amazon India offer: 15% off | Discount applied |
   | ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available for LivSpace Pro products on Noon | No offer |
   | ITEM-05 | Rs.449 | Rs.382 | Amazon India offer: 15% off | Discount applied |
   | ITEM-06 | Rs.899 | Rs.809 | Flipkart offer: 10% off | Discount applied |
   | | | **Rs.5,932** | Cart total before offer | |
   | | | **−Rs.593** | Cart offer: 10% off (RULE-04, cart total ≥ Rs.4,000) | |
   | | | **Rs.5,339** | Final cart total | |

2. Under **Add a rule in plain English**, click an example, then **Parse rule**. Check the fields, the
   assumptions and the price preview, then **Discard** it. (**Add rule** re-prices the cart, and the
   numbers below assume you didn't.) Each example on its own, against the four sample rules:

   | Description | Parsed as | Total |
   |---|---|---|
   | "20% off for Natura Casa brand, stackable with other offers" | Brand · Natura Casa · 20% · stackable | **Rs.5,026** |
   | "Rs.100 flat discount on all Flipkart items" | Platform · Flipkart · Rs.100 · not stackable | **Rs.5,258** |
   | "10% off if cart value is more than Rs.5,000" | Cart · 10% · min Rs.5,000 | **Rs.5,339** (ties RULE-04; the preview says so) |
   | "Give a discount for big orders" | not added; asks for the amount and the minimum | — |

3. Upload `cart-small-order.pdf`: a different cart, re-priced with the active rules. At Rs.3,437 it is
   below the Rs.4,000 minimum, so there is no cart offer line.
4. Upload `cart-with-errors.pdf`: the brief's cart with two broken rows. You're shown which rows and
   why, and how the total would change, before choosing to replace the cart.

## Scope

**Core: what the brief asks for.** The base engine (plus the bugs fixed in it), Task 1, Task 2 with
validation and a confirmation step, Task 3 with a review step for partly readable PDFs, and the
deployment.

**Extras, and why each exists.** Each is separate from the core and can be ignored when reviewing it.
- **Rule-based parser** (`server/ruleParser/offlineParser.js`). The app had to work with no paid LLM
  calls, so this reads plain-English rules when no key is set or the LLM is unavailable. It is
  deliberately narrow: it refuses anything it can't fully account for. It also gives a second opinion
  on the LLM's reading.
- **Customer view.** The stakeholder's "one final price, one offer label" ask, shown as a shopper
  would see it: only the offers they get, with no rule IDs.
- **"You're Rs.563 away" hint.** The brief asks what happens just below the threshold. The answer is
  no offer line, plus this separate hint.
- **Regression tests, an evaluation set, CI and a browser-check script.** These keep the above from
  breaking when something changes.
- **One-click sample data.** The live site can be tried without cloning the repo.

## How it fits together

```
 inputs (adapters)                                   engine (pure)                    UI
 ─────────────────                                   ─────────────                    ──
 rules.csv ──────┐
 plain English ──┼─► validateRule() ─────► DiscountRule[] ─┐
   (LLM / rule-based parser)                               ├─► priceCart(cart, rules) ─► results,
 cart.csv ───────┼─► validateCartItem() ─► CartItem[] ─────┘        │                    explanations,
 cart.pdf ───────┘                                         previewRule() (what-if) ─► confirmation card
```

- **The calculator doesn't know where its input came from.** Task 1 extended it (`discountEngine.js`).
  Task 2 only added a read-only what-if helper beside it (`preview.js`), and Task 3 didn't touch
  `src/engine/`.
- **`src/inputs/validate.js` is the single gate.** A new input mode (say, a Shopify import) is one
  adapter that produces plain objects and calls `validateRule()` / `validateCartItem()`.
- **State and display are separate.** `src/state/useRules.js` and `useCart.js` hold what the inputs
  loaded; `App.jsx` derives prices with `priceCart()` and passes them to the panels.
- **The parser logic lives once in `server/ruleParser/`.** It is served by the Vercel function in
  `api/` and by the Vite dev server, so local and deployed behaviour match.

## Decisions and trade-offs

- **Malformed PDF rows → review before replacing.** A fully readable PDF replaces the cart at once. A
  partial one doesn't, because it silently changes the total: the brief's cart costs Rs.5,339, but its
  four readable rows come to Rs.2,924 and lose the cart offer. Unreadable files (not a PDF,
  password-protected, scanned, no header, missing columns) leave the cart untouched with a specific
  message. Extra columns (Category, MRP beside Price) are ignored and listed, so they can't leak into a
  price. A Qty other than 1 is skipped with a reason, because the engine prices one unit per line.
- **The LLM's reply is never trusted.** It must be JSON in the agreed shape and pass `validateRule()`,
  or the user gets a specific message ("Need a bit more detail", "This rule can't be added", "The
  parsed rule didn't pass validation", "Something went wrong"). Nothing crashes, and the typed text is
  kept. A reply can also be valid but *wrong*, which no schema catches. So the rule-based parser reads
  the same text. The card flags any field the two disagree on, and warns about words like "only",
  "except" or names the app doesn't know when the rule-based parser can't account for them.
- **Conditions the engine can't express are refused, not dropped.** "15% off Natura Casa *on Flipkart
  only*" can't be represented, and dropping "on Flipkart" would give the discount to Amazon shoppers
  too. The same goes for time limits, customer types, payment methods, quantities, exclusions,
  maximums and several rules in one sentence. The LLM is told to refuse these. The rule-based parser
  only accepts a description when it can account for every word. The validator rejects a cart rule
  limited to a brand rather than widening it to the whole cart.
- **Just below the threshold.** All money is whole rupees (each discount is rounded as it is applied),
  so the subtotal the customer sees is exactly the number compared. The minimum is inclusive
  (Rs.4,000 qualifies, Rs.3,999 doesn't). Below it there is no offer line, as the brief asks, and a
  separate hint says how far off the cart is. The hint says "counted after item offers", because
  adding an item that is itself discounted counts for less than its price.
- **Assumptions are shown, not hidden.** Unmentioned stackability means "doesn't stack", and "more
  than Rs.5,000" means "Rs.5,000 or more" (the engine's ≥); both are listed on the card. Names are
  matched to the cart ("amazon" → "Amazon India") with a note. A rule that matches nothing in the cart
  gets a warning, with a suggestion when a similar name exists.
- **LLM cost and availability.** The server speaks the OpenAI-compatible API, so any provider works
  (Gemini and Groq have free tiers). With no key, or if the model is down or rate-limited, the
  rule-based parser answers and the card says which parser was used.
- **Smaller calls:** prices recalculate whenever rules or the cart change, so the Calculate button is
  gone. Rules typed in a session survive a new `rules.csv` and can be removed individually. Flat cart
  rules are supported.

**Pricing policy I'd confirm with the business.** Each of these changes what customers pay, so it
belongs to finance and the merchant, not just engineering:
- **Order of stackable offers.** When several stackable offers apply, percentages go before flat
  amounts. That follows the brief's "biggest saving" rule and makes the result independent of rule
  order, but it gives away slightly more than the reverse (10% then Rs.100 off on Rs.1,000 = Rs.800;
  the other way = Rs.810).
- **Rounding.** Each discount is rounded to whole rupees as it is applied, and base prices are rounded
  to whole rupees on input (Rs.849.50 → Rs.850).
- **Ties** go to the rule listed first, and the explanation says "same saving as".
- **An offer larger than the price** makes the item free, and says "(limited to the item price)".

## Where I'd push back on the brief

- **"A backend is optional."** Doing Task 2 in the browser would publish the LLM key in the JavaScript
  bundle. One serverless function keeps it secret; it's the only server code.
- **The confirmation step.** I agree with it, but the fields alone don't tell a merchant what will
  happen. The preview does ("ITEM-01 Cushion Cover: Rs.1,104 → Rs.883 … Final cart total: Rs.5,339 →
  Rs.5,026"), and it also explains when a rule changes nothing. The brief's third example is such a
  case: without the preview it would look like a bug.
- **The PDF format assumption.** Real order PDFs vary. Next I'd keep this deterministic parser as the
  first pass and, only for PDFs it can't read, ask an LLM to extract the table into the same review
  panel. An LLM can invent a price, so its output must never replace a cart unreviewed. Longer term, a
  structured export from partners beats parsing PDFs.
- **"One final price, one offer label."** When offers stack, the customer does get two discounts. The
  label lists both, because hiding one is the kind of surprise the stakeholder wants to avoid.
- The evaluation section calls the plain-English task "Task 1" and the PDF task "Task 2"; I've followed
  the build section's numbering (Tasks 2 and 3).

---

## Reference

### Commands

| Command | What it does |
|---|---|
| `npm test` | 286 unit, server and UI-flow tests (also run in CI) |
| `npm run eval:parser` | scores the parser on the evaluation set: the LLM if a key is set (retrying rate limits), otherwise the rule-based parser; prints a README row. Add a URL to score a deployment instead, so the key stays in Vercel |
| `npm run check:llm` | checks that the LLM in `.env` answers correctly, and explains what's wrong if not; add a URL to check a deployment |
| `npm run check:browser` | with the app running, drives a local Chrome/Edge through the main flows (20 checks); set `BASE_URL` to check a deployment |
| `npm run make:pdfs` | regenerates the sample PDFs |

### Testing and measurement

- **Engine:** the brief's expected results, cart-offer boundaries, ties, stacking order, the
  never-below-zero cap, and explanations after rules or carts change.
- **Inputs:** CSV edge cases; the plain-English adapter against valid, invalid, vague, unsupported and
  unreadable replies, plus the cross-check; PDF parsing against real PDFs through pdf.js.
- **Server:** the endpoint with and without a key, JSON-mode retry, and fallbacks on errors and rate
  limits.
- **UI flows** (jsdom + Testing Library): confirm, discard, vague input, removing a rule, new rules and
  carts, PDF replace and review, slow-PDF races, sample data, and the customer view.

**The parser evaluation set** (`server/ruleParser/evalCases.js`) has 49 descriptions: the brief's
examples, other phrasings, inputs that must be refused, and the review's adversarial cases. A *wrong
rule* (shown, but not matching) is counted separately from a refusal, because it's the worse failure.
I wrote these cases and fixed the rule-based parser against them. Its score therefore shows coverage,
not accuracy on unseen text:

| Parser | Score | Wrong rules |
|---|---|---|
| Rule-based | 48/49 | 0 (it asks instead of guessing at number words like "a hundred rupees") |

On 25 further phrasings written after those fixes, it returned no wrong rules. The number that
matters is the LLM's: run `npm run eval:parser` with a key. It retries rate limits, leaves out any case
the LLM never answered (rather than scoring the fallback's answer), and prints the row for this table.

### Review findings

**Bugs in the base engine**, each fixed with a test:
- a discount could push a price below zero (Rs.500 off a Rs.449 item gave −Rs.51);
- one bad CSV row discarded the whole file;
- `stackable=ture` silently became `false`;
- explanations didn't name the brand or platform an offer came from.

**An adversarial review.** Before submitting, the code went through an automated AI review that was
instructed to break the app rather than approve it. Every finding was reproduced, fixed and turned into
a test:
- The rule-based parser returned wrong rules for plausible text: "can’t be combined" was read as
  stackable, "1 lakh" became Rs.1, "at least 3 products" became a Rs.3 minimum, and "except Flipkart"
  became *only* Flipkart. The fix was structural, since a keyword patch would leave the next phrasing
  broken: refuse unless every word is accounted for.
- An extra PDF column could change prices: a Qty column turned Rs.1,299 into Rs.12,992. Every header
  cell is now a column; unknown ones are ignored and listed.
- A cart rule naming a brand was silently widened to the whole cart. It's now rejected.
- A rule preview could crash the page (an error boundary now also guards against blank pages), and a
  slow PDF could overwrite a newer cart. Both fixed.

A second, grader-style review found two problems in the extras, both fixed:
- the checkout showed the merchant's "(better than …)" comparison;
- the threshold hint said "Add Rs.563 more", which a discounted item wouldn't achieve.

**Known limitation:** `/api/parse-rule` is unauthenticated, so anyone can spend the LLM quota. When it
runs out, the app falls back to the rule-based parser rather than failing. A real deployment would add
rate limiting.

### If this went to production

- **Refunds need the cart discount split across items.** Returning one item from a Rs.5,339 order
  needs to know how much of the Rs.593 cart discount it carried. I'd allocate it pro rata and store it
  per order line.
- **Currency per platform.** Noon sells in AED/SAR, not rupees. A flat "Rs.150 off" rule must not
  apply to a Noon item as 150 dirhams.
- **An audit trail** of which rules priced each order, with their values at the time, so support can
  answer "why did I pay this?" after a rule changes.
- **The conditions refused today** (validity dates, brand-on-platform offers, exclusions) are the
  likeliest next requests. They belong in the rule model and the validator first.

### LLM setup

Optional. Copy `.env.example` to `.env` (locally), or add the same variables in Vercel → Settings →
Environment Variables:

| Variable | Example |
|---|---|
| `LLM_API_KEY` | your provider's key; leave unset to use the rule-based parser |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` (Gemini) or `https://api.groq.com/openai/v1` (Groq) |
| `LLM_MODEL` | a model available on your plan, e.g. `gemini-2.5-flash` |

Then run `npm run check:llm`. It sends one rule to the model and either confirms the model read it
correctly or says what's wrong: a rejected key, a rate limit, or an unknown model (it then lists the
models your key can use).

### Deploying (Vercel)

1. Import the repository in Vercel. The Vite preset is detected (build `npm run build`, output
   `dist`).
2. Optionally add the LLM variables above.
3. Deploy. `api/parse-rule.js` becomes the `/api/parse-rule` serverless function. Tests live outside
   `api/`, so they aren't deployed as functions.
4. Check the deployment:

   ```bash
   npm run check:llm -- https://your-app.vercel.app             # is the live site using the LLM?
   npm run eval:parser -- https://your-app.vercel.app           # score the live LLM on the evaluation set
   BASE_URL=https://your-app.vercel.app npm run check:browser   # the whole app, in a real browser
   ```

   (On Windows PowerShell, use `$env:BASE_URL="https://your-app.vercel.app"; npm run check:browser`.)

### Project structure

```
api/parse-rule.js          Vercel function → server/ruleParser/handler.js
server/ruleParser/         prompt, OpenAI-compatible client, rule-based parser, handler, evaluation set
src/engine/                discountEngine.js (pure pricing), preview.js (what-if: rule preview,
                           next cart offer), format.js
src/inputs/                validate.js (the single gate), csvInput.js, nlRuleInput.js, crossCheck.js,
                           pdfCartInput.js + pdfText.js, ruleIds.js
src/state/                 useRules.js (file + plain-English rules), useCart.js (CSV/PDF cart loading)
src/App.jsx                wires state → priceCart() → panels
src/components/            RulesPanel, CartPanel, ResultsPanel (+ CartSummary, CheckoutView),
                           RuleInput + RuleConfirmation, PdfImportReview, FileUploader, SampleBar,
                           DataTable, ErrorBanner, ErrorBoundary, ui.jsx (shared styles)
src/sampleData.js          bundles sample-data/ for "Load sample data" and the download links
sample-data/               rules.csv, cart.csv, cart.pdf, cart-small-order.pdf, cart-with-errors.pdf
scripts/                   make-sample-pdfs, eval-parser, browser-check
.github/workflows/ci.yml   tests and build on every push
```

### Data formats

**rules.csv**

| Column | Type | Example |
|---|---|---|
| rule_id | string | RULE-01 |
| scope | brand \| platform \| cart | platform |
| applies_to | string (empty for cart) | Amazon India |
| type | percentage \| flat | percentage |
| value | number | 15 |
| stackable | true \| false | false |
| min_cart_value | number (cart rules only; optional column) | 4000 |

**cart.csv:** `item_id, product, brand, platform, base_price`, e.g. `ITEM-01, Cushion Cover, Natura
Casa, Amazon India, 1299`. Prices are rounded to whole rupees.

**Cart PDF:** a table with the headings Product, Brand, Platform and Base Price (or Price), one item
per line. Title lines above it ("Order #OP-9921") are allowed, as are extra columns, which are
ignored. Prices may be written `Rs.1,299`, `₹1,299`, `Rs.849/-` or `1299`. Item IDs are assigned in
row order.
