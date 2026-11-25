# Opptra Discount Engine

[![CI](https://github.com/PSURI1894/discount-engine-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/PSURI1894/discount-engine-assignment/actions/workflows/ci.yml)

**Live demo:** https://YOUR-PROJECT.vercel.app  <!-- replace with the Vercel URL after deploying -->

A checkout pricing engine: for every cart item it applies the offer that saves the customer the
most, stacks stackable offers on top, applies cart-level offers to the total, and explains the
result in plain language. Rules can come from a CSV or be typed in plain English; carts can come
from a CSV or a PDF.

**In 30 seconds**
- The brief's expected results reproduce exactly (Rs.5,339). They were pinned in tests before any change.
- **Task 1:** the cart offer is its own line. The minimum is inclusive and checked on the discounted
  subtotal. Just below it, the shopper sees "Add Rs.563 more to get 10% off your cart".
- **Task 2:** plain English → LLM (or a free offline parser) → the same validator as CSV rows → a
  confirmation card with a price preview. Vague or unsupported rules are refused, never guessed, and
  LLM readings are cross-checked.
- **Task 3:** PDF carts are read in the browser. If some rows can't be read, the user reviews them
  before the cart is replaced.
- One validator and a pure engine: Tasks 2 and 3 didn't touch the calculator, and a new input mode
  wouldn't either.
- The full test suite runs in CI on every push, and the app was checked end to end in a real browser.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Everything works without an API key: plain-English rules fall back to a
built-in offline parser (see [LLM setup](#llm-setup) to use a real model). `npm test` runs the 202 tests.

## Try it in two minutes

1. Upload `sample-data/rules.csv` and `sample-data/cart.csv`. The brief's expected results appear
   straight away: Rs.5,932 → cart offer −Rs.593 → **Rs.5,339**. Switch to **Customer view** to see
   the same cart as a shopper would at checkout.
2. Under **Add a rule in plain English**, click an example, then **Parse rule**. Check the fields and
   the price preview, then **Add rule** or **Discard**.
3. Upload `sample-data/cart-small-order.pdf`. The cart is replaced and re-priced; at Rs.3,437 it is
   below the Rs.4,000 minimum, so the cart offer line disappears and the shopper is told
   "Add Rs.563 more to get 10% off your cart".
4. Upload `sample-data/cart-with-errors.pdf`. Two rows can't be read, so you're shown which and why
   before choosing to replace the cart.

| Plain-English rule (on the sample cart)                     | Result                                              |
|-------------------------------------------------------------|-----------------------------------------------------|
| "20% off for Natura Casa brand, stackable with other offers" | Brand · Natura Casa · 20% · stackable → **Rs.5,026** |
| "Rs.100 flat discount on all Flipkart items"                 | Platform · Flipkart · Rs.100 · not stackable → **Rs.5,258** |
| "10% off if cart value is more than Rs.5,000"                | Cart · 10% · min Rs.5,000 → **Rs.5,339**, unchanged: it ties RULE-04, and the preview says so |
| "Give a discount for big orders"                             | Not added: asks for the discount amount and the minimum cart value |

## What was built

- **Cart-level offers (Task 1).** `cart` rules with a `min_cart_value`. After item discounts, the sum
  of final item prices is checked against the minimum (inclusive); qualifying cart rules go through the
  same best-saving / stacking logic as item rules. The offer is its own line ("Cart offer: 10% off —
  Rs.593 saved") and does not appear below the minimum.
- **Plain-English rules (Task 2).** The description goes to `/api/parse-rule` (LLM, or the offline
  parser). The reply is validated by the same code that validates CSV rows, then shown on a
  confirmation card with the parsed fields, the assumptions made, warnings, and a preview of exactly
  which prices would change. Nothing is applied until **Add rule**.
- **PDF carts (Task 3).** Parsed in the browser with pdf.js. Columns are found from the header row's
  positions, so "Natura Casa" and "Amazon India" stay intact. The engine re-runs with the active rules.
- **Customer view.** The stakeholder asked for "one final price, one offer label, no surprises". A
  toggle shows the cart as a shopper sees it: each item's final price with the original struck through,
  one offer label with the saving, and no rule IDs. The labels are the engine's own explanations, so
  the merchant and customer views can never disagree.
- **A second opinion on the LLM.** When an LLM parses a rule, the rule-based parser reads the same text,
  and the confirmation card flags any disagreement, especially a condition the LLM may have dropped.
- **A measured parser.** `npm run eval:parser` scores the parser on 26 descriptions (see
  [Measuring the parser](#measuring-the-parser)).
- **Base engine fixes.** Discounts could push prices below zero (Rs.500 off a Rs.449 item gave −Rs.51);
  one bad CSV row discarded the whole file; `stackable=ture` silently became `false`; explanations
  didn't say which brand or platform an offer came from. All fixed, with tests.

## How it fits together

```
 inputs (adapters)                                   engine (pure)                    UI
 ─────────────────                                   ─────────────                    ──
 rules.csv ──────┐                                                                    
 plain English ──┼─► validateRule() ─────► DiscountRule[] ─┐
   (LLM / offline parser)                                  ├─► priceCart(cart, rules) ─► results,
 cart.csv ───────┼─► validateCartItem() ─► CartItem[] ─────┘        │                    explanations,
 cart.pdf ───────┘                                         previewRule() (what-if) ─► confirmation card
```

- `src/engine/` knows nothing about where rules or carts come from. Task 1 extended it; Tasks 2 and 3
  didn't touch it.
- `src/inputs/validate.js` is the single gate every input passes through. **A new input mode** (say,
  a Shopify import) is one adapter file that produces plain objects and calls `validateRule()` /
  `validateCartItem()`; the calculator doesn't change.
- `server/ruleParser/` holds the parser logic once; it is served by the Vercel function in `api/` and
  by the Vite dev server, so local and deployed behaviour match.

## Decisions and trade-offs

**Malformed PDF rows.** A fully readable PDF replaces the cart immediately. If some rows can't be
read, the user sees each skipped row with its reason and how the total would change, and chooses to
replace or keep the current cart. Replacing silently with a partial cart changes the total and can
switch the cart offer off: `cart-with-errors.pdf` drops from Rs.5,339 to Rs.2,924 and loses the
cart offer. Unreadable files (not a PDF, password-protected, scanned with no text, no header, missing
columns) leave the cart untouched with a specific message.

**Invalid LLM output.** The model's reply is never trusted. It must be JSON in the agreed shape and pass
`validateRule()`, or it is rejected with a clear message: "need more detail", "can't be added
because…", "failed validation: …" or "couldn't read the reply". Nothing crashes, and the typed text
is kept for editing. A reply can also be valid but *wrong*, which no schema check catches. So the
rule-based parser reads the same text, and the card shows any disagreement before the user confirms.

**Conditions the engine can't express.** "15% off Natura Casa *on Flipkart only*" can't be represented
(a rule targets a brand *or* a platform). Quietly dropping "on Flipkart" would give the discount to
Amazon shoppers too, so the rule is refused instead. Time limits, customer types, quantity deals, caps
and multiple rules in one sentence are refused for the same reason.

**Just below the threshold.** All money is whole rupees (each discount is rounded as it is applied),
so there are no floating-point near-misses: the subtotal the customer sees is the number compared.
The minimum is inclusive (Rs.4,000 qualifies, Rs.3,999 doesn't, both tested) and is checked against
discounted prices, not base prices. Below the minimum there is no offer line, as the brief asks, but a
separate hint says how far off the cart is ("Add Rs.563 more to get 10% off your cart"). It only
appears when reaching the minimum would actually increase the discount.

**Assumptions are shown, not hidden.** If stackability isn't mentioned the rule doesn't stack, and
"more than Rs.5,000" is treated as "Rs.5,000 or more" (the engine's ≥). Both appear on the
confirmation card. Names are matched to the cart ("amazon" → "Amazon India") with a note, and a rule
that matches nothing in the cart gets a warning with a suggestion.

**LLM cost and availability.** The server speaks the OpenAI-compatible API, so any provider works
(Gemini and Groq both have free tiers). If no key is set, or the model is down or rate-limited, the
offline parser answers instead and the card says so. The demo keeps working and costs nothing.

**Other calls:**
- Stackable percentages are applied before stackable flat amounts. That always favours the customer
  (10% then Rs.100 off saves more than the reverse) and means the result doesn't depend on rule order.
- Ties between non-stackable offers go to the rule listed first.
- The **Calculate** button is gone: prices recalculate whenever the rules or the cart change, which
  "re-run when a rule is added / a cart is loaded" needs anyway.
- Rules typed during a session survive uploading a new `rules.csv` and can be removed individually.
- Flat cart rules ("Rs.500 off orders over Rs.3,000") are supported as well as percentage ones.
- A flat offer larger than the price makes the item free and says "(limited to the item price)".

## Where I'd push back on the brief

- **"A backend is optional."** The brief allows doing Task 2 in the browser, but that would publish the
  LLM key in the JavaScript bundle. A single serverless function keeps it secret; it's the only
  server code.
- **The confirmation step.** I agree with it, but showing the fields alone doesn't tell a merchant what
  will happen. The preview ("ITEM-01: Rs.1,104 → Rs.883, total Rs.5,339 → Rs.5,026") does. It also
  explains when a rule changes nothing. The brief's third example is such a case on the sample cart:
  without the preview it would look like a bug.
- **The PDF format assumption.** A fixed table layout is fragile: real order PDFs vary. My next step
  would be to keep this deterministic parser as the first pass and, only for PDFs it can't read, ask an
  LLM to extract the table and show the result in the same review panel. An LLM can invent a price, so
  its output must never replace a cart unreviewed. Longer term, a structured export (CSV or API) from
  partners beats parsing PDFs at all.
- **"One final price, one offer label."** When offers stack, the customer does get two discounts. The
  explanation lists both ("Natura Casa offer: Rs.150 off + Flipkart offer: 10% off") because hiding one
  would be the kind of surprise the stakeholder wants to avoid.
- Small note: the evaluation section refers to the plain-English task as "Task 1" and the PDF task as
  "Task 2"; I've followed the build section's numbering (Tasks 2 and 3).

## Measuring the parser

`server/ruleParser/evalCases.js` holds 26 descriptions: the brief's examples, other phrasings, and
inputs that must be refused (vague requests, conditions the engine can't apply, a 150% discount, a
prompt-injection attempt). Each one is scored on what the user would actually be shown, after
validation. A *wrong rule* (one shown that doesn't match) is counted separately from a refusal,
because it's the worse failure.

```bash
npm run eval:parser    # uses the LLM in .env if set, otherwise the offline parser
```

| Parser  | Score | Wrong rules |
|---------|-------|-------------|
| Offline | 25/26 | 0 (it asks instead of guessing at number words like "a hundred rupees") |

A test pins the offline parser's key property: it may refuse, but it never returns a wrong rule.

## If this went to production

Things I'd raise with the team before rolling this out to real checkouts:

- **Refunds need the cart discount split across items.** If a customer returns one item from a
  Rs.5,339 order, finance needs to know how much of the Rs.593 cart discount belonged to it.
  I'd allocate it pro rata and store it per order line.
- **Currency per platform.** Noon sells in AED/SAR, not rupees. Prices and flat discounts need a
  currency, and a flat "Rs.150 off" rule must not apply to a Noon item as 150 dirhams.
- **Rounding agreed with finance.** The engine rounds each discount to whole rupees as it is applied.
  That's a policy decision, and it should match what invoices and settlement reports use.
- **An audit trail.** Store which rules priced each order, with their values at that moment, so
  support can answer "why did I pay this?" after a rule changes.
- **The conditions refused today** (validity dates, brand-on-platform offers, exclusions) are the
  likeliest next requests. They belong in the rule model and the validator first; the parser
  follows, and the calculator's core logic stays as it is.

## LLM setup

Optional. Copy `.env.example` to `.env` (locally) or add the same variables in Vercel → Settings →
Environment Variables:

| Variable       | Example                                                    |
|----------------|------------------------------------------------------------|
| `LLM_API_KEY`  | your provider's key; leave unset to use the offline parser |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` (Gemini) or `https://api.groq.com/openai/v1` (Groq) |
| `LLM_MODEL`    | a model available on your plan, e.g. `gemini-2.5-flash`    |

## Deploying (Vercel)

1. Import the repository in Vercel. The Vite framework preset is detected automatically
   (build `npm run build`, output `dist`).
2. Optionally add the LLM variables above.
3. Deploy. `api/parse-rule.js` becomes the `/api/parse-rule` serverless function automatically.

## Testing

`npm test` runs 202 tests, also in CI on every push:
- **Engine:** the brief's expected results, cart-offer boundaries, ties, stacking order, the
  never-below-zero cap, the explanation text after rules change, and the "add Rs.X more" hint.
- **Inputs:** CSV edge cases; the plain-English adapter against valid, invalid, vague, unsupported and
  unreadable parser replies, plus the LLM cross-check; PDF parsing against real PDFs through pdf.js.
- **Server:** the endpoint with and without a key, JSON-mode retry, the fallback on errors and
  rate limits, and the parser evaluation set.
- **UI flows** (jsdom + Testing Library): confirm, discard, vague input, removing a rule, a new rules
  file, PDF replace, PDF review with keep / replace, and the customer view.

The app was also checked end to end in a real browser (headless Edge): the sample files, adding and
removing a rule, every sample PDF, and the customer view.

## Project structure

```
api/parse-rule.js          Vercel function → server/ruleParser/handler.js
server/ruleParser/         prompt, OpenAI-compatible client, offline parser, handler, evaluation set
src/engine/                discountEngine.js (pure pricing), preview.js (what-if: rule preview,
                           next cart offer), format.js
src/inputs/                validate.js (the single gate), csvInput.js, nlRuleInput.js,
                           pdfCartInput.js + pdfText.js, ruleIds.js
src/components/            FileUploader, DataTable, CartSummary, CheckoutView, RuleInput,
                           RuleConfirmation, PdfImportReview, ErrorBanner
sample-data/               rules.csv, cart.csv, cart.pdf, cart-small-order.pdf, cart-with-errors.pdf
scripts/                   sample PDF generator (npm run make:pdfs), parser evaluation (npm run eval:parser)
.github/workflows/ci.yml   tests and build on every push
```

## Data formats

**rules.csv**

| Column         | Type                      | Example      |
|----------------|---------------------------|--------------|
| rule_id        | string                    | RULE-01      |
| scope          | brand \| platform \| cart | platform     |
| applies_to     | string (empty for cart)   | Amazon India |
| type           | percentage \| flat        | percentage   |
| value          | number                    | 15           |
| stackable      | true \| false             | false        |
| min_cart_value | number (cart rules only)  | 4000         |

`min_cart_value` is optional, so rule files without that column still load.

**cart.csv:** `item_id, product, brand, platform, base_price` (e.g. `ITEM-01, Cushion Cover, Natura Casa, Amazon India, 1299`).

**Cart PDF:** a table with the headings Product, Brand, Platform, Base Price and one item per line.
Title lines above it (e.g. "Order #OP-9921") are allowed. Prices may be written `Rs.1,299`, `₹1,299`
or `1299`. Item IDs are assigned in row order.

## Expected results for the sample data

| Item    | Base     | Final        | Offer applied (as the customer sees it)                          | Status           |
|---------|----------|--------------|-------------------------------------------------------------------|------------------|
| ITEM-01 | Rs.1,299 | Rs.1,104     | Amazon India offer: 15% off (better than Natura Casa Rs.150 off)  | Max discount     |
| ITEM-02 | Rs.849   | Rs.629       | Natura Casa offer: Rs.150 off + Flipkart offer: 10% off           | Stacked          |
| ITEM-03 | Rs.599   | Rs.509       | Amazon India offer: 15% off                                       | Discount applied |
| ITEM-04 | Rs.2,499 | Rs.2,499     | No offers available for LivSpace Pro products on Noon             | No offer         |
| ITEM-05 | Rs.449   | Rs.382       | Amazon India offer: 15% off                                       | Discount applied |
| ITEM-06 | Rs.899   | Rs.809       | Flipkart offer: 10% off                                           | Discount applied |
|         |          | **Rs.5,932** | Cart total before offer                                           |                  |
|         |          | **−Rs.593**  | Cart offer: 10% off (RULE-04, cart total ≥ Rs.4,000)              | Cart offer       |
|         |          | **Rs.5,339** | Final cart total                                                  |                  |
