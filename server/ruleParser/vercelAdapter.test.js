import { describe, it, expect, afterEach } from 'vitest'
// Lives outside api/: Vercel turns every file in api/ into a serverless function.
import handler from '../../api/parse-rule.js'

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (data) => { res.body = data; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

const savedKey = process.env.LLM_API_KEY
afterEach(() => {
  if (savedKey === undefined) delete process.env.LLM_API_KEY
  else process.env.LLM_API_KEY = savedKey
})

describe('api/parse-rule (Vercel adapter)', () => {
  it('only accepts POST', async () => {
    const res = fakeRes()
    await handler({ method: 'GET' }, res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('accepts a parsed or string JSON body and returns the handler result', async () => {
    delete process.env.LLM_API_KEY
    for (const body of [{ text: '10% off Noon items' }, JSON.stringify({ text: '10% off Noon items' })]) {
      const res = fakeRes()
      await handler({ method: 'POST', body }, res)
      expect(res.statusCode).toBe(200)
      expect(res.body.parser).toBe('offline')
    }
  })

  it('rejects a body that is not JSON', async () => {
    const res = fakeRes()
    await handler({ method: 'POST', body: 'not json' }, res)
    expect(res.statusCode).toBe(400)
  })
})
