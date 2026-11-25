import { describe, it, expect, vi } from 'vitest'
import { handleParseRule, MAX_DESCRIPTION_LENGTH, DEFAULT_BASE_URL } from './handler.js'

const body = { text: 'Rs.100 flat discount on all Flipkart items', knownBrands: ['Natura Casa'], knownPlatforms: ['Flipkart'] }
const env = { LLM_API_KEY: 'test-key', LLM_MODEL: 'test-model' }
const silent = { error: () => {} }

const llmReply = (content, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { 'Content-Type': 'application/json' } })

describe('handleParseRule — request checks', () => {
  it('rejects an empty description', async () => {
    const res = await handleParseRule({ text: '   ' }, {})
    expect(res.status).toBe(400)
  })

  it('rejects an overly long description', async () => {
    const res = await handleParseRule({ text: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }, {})
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/under 300 characters/)
  })
})

describe('handleParseRule — without an LLM key', () => {
  it('uses the offline parser and says so', async () => {
    const res = await handleParseRule(body, {})
    expect(res.status).toBe(200)
    expect(res.json.parser).toBe('offline')
    expect(res.json.parserNote).toMatch(/No LLM is configured/)
    expect(res.json.output.rule.appliesTo).toBe('Flipkart')
  })
})

describe('handleParseRule — with an LLM key', () => {
  it('sends the prompt to the configured endpoint and returns the raw reply', async () => {
    const fetchImpl = vi.fn(async () => llmReply('{"status":"ok"}'))
    const res = await handleParseRule(body, env, { fetchImpl })

    expect(res.json).toEqual({ parser: 'test-model', output: '{"status":"ok"}' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${DEFAULT_BASE_URL}/chat/completions`)
    expect(init.headers.Authorization).toBe('Bearer test-key')
    const sent = JSON.parse(init.body)
    expect(sent.model).toBe('test-model')
    expect(sent.response_format).toEqual({ type: 'json_object' })
    expect(sent.messages[1].content).toContain('Known platforms: Flipkart')
    expect(sent.messages[1].content).toContain('Rs.100 flat discount on all Flipkart items')
  })

  it('retries without JSON mode when the provider rejects it', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(llmReply('{"status":"ok"}'))
    const res = await handleParseRule(body, env, { fetchImpl })
    expect(res.json.output).toBe('{"status":"ok"}')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined()
  })

  it('falls back to the offline parser, labelled, when the LLM is rate limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 429 }))
    const res = await handleParseRule(body, env, { fetchImpl, log: silent })
    expect(res.json.parser).toBe('offline')
    expect(res.json.parserNote).toBe('The LLM (test-model) was unavailable (HTTP 429), so the built-in offline parser was used.')
    expect(res.json.output.rule.appliesTo).toBe('Flipkart')
  })

  it('falls back when the LLM returns no content', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    const res = await handleParseRule(body, env, { fetchImpl, log: silent })
    expect(res.json.parser).toBe('offline')
    expect(res.json.parserNote).toMatch(/empty response/)
  })

  it('falls back when the network fails', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    const res = await handleParseRule(body, env, { fetchImpl, log: silent })
    expect(res.json.parser).toBe('offline')
    expect(res.json.parserNote).toMatch(/fetch failed/)
  })
})
