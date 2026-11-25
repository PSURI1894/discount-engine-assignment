import { describe, it, expect, vi } from 'vitest'
import { interpretParserOutput, parseRuleFromText, knownNames, crossCheck } from './nlRuleInput.js'
import { handleParseRule } from '../../server/ruleParser/handler.js'
import { offlineParse } from '../../server/ruleParser/offlineParser.js'
import { priceCart } from '../engine/discountEngine.js'
import { SAMPLE_CART, SAMPLE_RULES } from '../test/fixtures.js'

const ctx = { rules: SAMPLE_RULES, cartItems: SAMPLE_CART }
const okReply = (rule, extra = {}) => ({ status: 'ok', rule, assumptions: [], missing: [], message: '', ...extra })
const flipkartFlat100 = { scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null }

describe('interpretParserOutput — valid replies', () => {
  it('validates the rule and gives it the next free ID', () => {
    const res = interpretParserOutput(okReply(flipkartFlat100), ctx)
    expect(res.status).toBe('ok')
    expect(res.rule).toEqual({ ruleId: 'RULE-05', ...flipkartFlat100 })
    expect(res.warnings).toEqual([])
  })

  it('reads a JSON string, including one wrapped in a code fence', () => {
    const text = '```json\n' + JSON.stringify(okReply(flipkartFlat100)) + '\n```'
    expect(interpretParserOutput(text, ctx).rule.appliesTo).toBe('Flipkart')
  })

  it('keeps the assumptions for the confirmation step', () => {
    const res = interpretParserOutput(okReply(flipkartFlat100, { assumptions: ['Stackability not mentioned'] }), ctx)
    expect(res.assumptions).toEqual(['Stackability not mentioned'])
  })

  it('treats minCartValue 0 on an item rule as "no minimum"', () => {
    expect(interpretParserOutput(okReply({ ...flipkartFlat100, minCartValue: 0 }), ctx).status).toBe('ok')
  })

  it('ignores fields the engine does not know about', () => {
    const res = interpretParserOutput(okReply({ ...flipkartFlat100, validUntil: 'Sunday' }), ctx)
    expect(res.rule).not.toHaveProperty('validUntil')
  })
})

describe('interpretParserOutput — warnings on the confirmation card', () => {
  it('warns when the rule matches nothing in the cart, and suggests the likely name', () => {
    const res = interpretParserOutput(okReply({ ...flipkartFlat100, appliesTo: 'Amazon' }), ctx)
    expect(res.warnings).toEqual([
      'No item in the current cart is sold on "Amazon", so this rule won\'t change any prices right now. Did you mean "Amazon India"?',
    ])
  })

  it('flags a percentage below 1 (0.15 instead of 15)', () => {
    const res = interpretParserOutput(okReply({ ...flipkartFlat100, type: 'percentage', value: 0.15 }), ctx)
    expect(res.warnings[0]).toMatch(/only 0.15% off. If you meant 15%/)
  })

  it('flags a duplicate of an active rule', () => {
    const res = interpretParserOutput(okReply({ scope: 'platform', appliesTo: 'amazon india', type: 'percentage', value: 15, stackable: false, minCartValue: null }), ctx)
    expect(res.warnings).toContain('This is the same as RULE-01, which is already active.')
  })
})

describe('interpretParserOutput — problems are surfaced, never thrown', () => {
  it('passes through "unresolvable" with its message and missing fields', () => {
    const res = interpretParserOutput({ status: 'unresolvable', rule: null, missing: ['value'], message: 'How much?' }, ctx)
    expect(res).toEqual({ status: 'unresolvable', missing: ['value'], message: 'How much?' })
  })

  it('writes a message if the parser gave none', () => {
    const res = interpretParserOutput({ status: 'unresolvable', missing: ['value', 'minCartValue'] }, ctx)
    expect(res.message).toMatch(/missing some details \(value, minCartValue\)/)
  })

  it('passes through "unsupported"', () => {
    expect(interpretParserOutput({ status: 'unsupported', message: 'No dates.' }, ctx)).toEqual({ status: 'unsupported', message: 'No dates.' })
  })

  it('rejects a rule that fails validation, listing why', () => {
    const res = interpretParserOutput(okReply({ ...flipkartFlat100, type: 'percentage', value: 150 }), ctx)
    expect(res.status).toBe('invalid')
    expect(res.errors).toEqual(['a percentage discount cannot exceed 100, got "150"'])
  })

  it('rejects a rule with missing fields', () => {
    const res = interpretParserOutput(okReply({ scope: 'brand', type: 'flat', value: 50 }), ctx)
    expect(res.status).toBe('invalid')
    expect(res.errors).toContain('a brand rule must say which brand it applies to')
    expect(res.errors).toContain('stackable must be true or false, got ""')
  })

  it.each([
    ['not JSON at all', 'Sure! Here is your rule: 10% off'],
    ['an array', '[1, 2]'],
    ['null', null],
    ['an unknown status', { status: 'maybe' }],
    ['"ok" without a rule', { status: 'ok' }],
  ])('reports an error for %s', (_, output) => {
    expect(interpretParserOutput(output, ctx).status).toBe('error')
  })
})

describe('crossCheck — the LLM\'s reading against the rule-based parser', () => {
  const known = { knownBrands: ['Natura Casa'], knownPlatforms: ['Flipkart', 'Amazon India'] }
  const rule = { ruleId: 'RULE-05', ...flipkartFlat100 }

  it('notes agreement', () => {
    const res = crossCheck(rule, offlineParse('Rs.100 flat discount on all Flipkart items', known))
    expect(res).toEqual({ warnings: [], note: 'A separate rule-based check read this description the same way.' })
  })

  it('names the fields that differ', () => {
    const res = crossCheck({ ...rule, stackable: true }, offlineParse('Rs.100 flat discount on all Flipkart items', known))
    expect(res.warnings).toEqual(['A separate rule-based reading disagrees on stackable (LLM: Yes, rule-based: No). Check this before adding.'])
  })

  it('warns when the rule-based parser sees a condition the engine cannot apply', () => {
    const res = crossCheck(rule, offlineParse('15% off Natura Casa on Flipkart only', known))
    expect(res.warnings[0]).toMatch(/^A rule-based check flagged this description: "An offer can apply to a brand or to a platform, not to both together/)
  })

  it('names condition words and unknown names the LLM\'s rule may have dropped', () => {
    const natura15 = { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 15, stackable: false, minCartValue: null }
    const res = crossCheck(natura15, offlineParse('15% off Natura Casa on Myntra only', known))
    expect(res.warnings).toEqual(['The description mentions "Myntra", "only", which the rule above may not reflect. Make sure it doesn\'t leave out a condition or a name.'])
    expect(res.note).toBeNull()
  })

  it('stays quiet when the rule-based parser cannot read the phrasing', () => {
    expect(crossCheck(rule, offlineParse('please knock a hundred rupees off anything sold through flipkart', known)))
      .toEqual({ warnings: [], note: null })
  })
})

describe('parseRuleFromText — catching an LLM that drops a condition', () => {
  it('flags the rule on the confirmation card', async () => {
    const text = '15% off Natura Casa on Flipkart only'
    // An LLM that ignores "on Flipkart only" and returns a brand-wide rule:
    const llmOutput = JSON.stringify(okReply({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 15, stackable: false, minCartValue: null }))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      parser: 'test-model', output: llmOutput, crossCheck: offlineParse(text, knownNames(SAMPLE_RULES, SAMPLE_CART)),
    })))

    const res = await parseRuleFromText(text, ctx, fetchImpl)
    expect(res.status).toBe('ok') // the user still decides…
    expect(res.warnings.some((w) => w.includes("doesn't leave out a condition"))).toBe(true) // …but is warned
    expect(res.checkNote).toBeNull()
  })

  it('adds no cross-check when the offline parser was the parser', async () => {
    const fetchImpl = async (_url, init) => {
      const result = await handleParseRule(JSON.parse(init.body), {})
      return new Response(JSON.stringify(result.json), { status: result.status })
    }
    const res = await parseRuleFromText('Rs.100 flat discount on all Flipkart items', ctx, fetchImpl)
    expect(res.checkNote).toBeNull()
  })
})

describe('knownNames', () => {
  it('collects brands and platforms from the cart and the rules', () => {
    expect(knownNames(SAMPLE_RULES, SAMPLE_CART)).toEqual({
      knownBrands: ['LivSpace Pro', 'Natura Casa', 'Nordic Basics'],
      knownPlatforms: ['Amazon India', 'Flipkart', 'Noon'],
    })
  })
})

describe('parseRuleFromText — network handling', () => {
  it('reports when the endpoint cannot be reached', async () => {
    const res = await parseRuleFromText('10% off Noon', ctx, vi.fn(async () => { throw new TypeError('offline') }))
    expect(res).toEqual({ status: 'error', message: "Couldn't reach the rule parser. Check your connection and try again." })
  })

  it('shows the server\'s error message', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Describe the rule you want to add.' }), { status: 400 }))
    expect((await parseRuleFromText(' ', ctx, fetchImpl)).message).toBe('Describe the rule you want to add.')
  })
})

// The whole path for the brief's examples: text → endpoint → offline parser →
// validation → engine. No network, no LLM, no cost.
describe('end to end with the offline parser — brief examples on the sample cart', () => {
  const fetchViaHandler = async (_url, init) => {
    const result = await handleParseRule(JSON.parse(init.body), {})
    return new Response(JSON.stringify(result.json), { status: result.status })
  }
  const totalWith = (rule) => priceCart(SAMPLE_CART, [...SAMPLE_RULES, rule]).total

  it('"20% off for Natura Casa brand, stackable…" → Rs.5,026', async () => {
    const res = await parseRuleFromText('20% off for Natura Casa brand, stackable with other offers', ctx, fetchViaHandler)
    expect(res.parser).toBe('offline')
    expect(res.rule).toMatchObject({ ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true })
    expect(totalWith(res.rule)).toBe(5026)
  })

  it('"Rs.100 flat discount on all Flipkart items" → Rs.5,258', async () => {
    const res = await parseRuleFromText('Rs.100 flat discount on all Flipkart items', ctx, fetchViaHandler)
    expect(res.rule).toMatchObject({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false })
    expect(totalWith(res.rule)).toBe(5258)
  })

  it('"10% off if cart value is more than Rs.5,000" → unchanged Rs.5,339 (ties RULE-04)', async () => {
    const res = await parseRuleFromText('10% off if cart value is more than Rs.5,000', ctx, fetchViaHandler)
    expect(res.rule).toMatchObject({ scope: 'cart', type: 'percentage', value: 10, minCartValue: 5000 })
    expect(totalWith(res.rule)).toBe(5339)
  })

  it('"Give a discount for big orders" → asks for the missing details', async () => {
    const res = await parseRuleFromText('Give a discount for big orders', ctx, fetchViaHandler)
    expect(res.status).toBe('unresolvable')
    expect(res.message).toMatch(/how much the discount is and the minimum cart value/)
  })
})
