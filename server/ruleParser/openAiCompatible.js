/**
 * openAiCompatible.js
 *
 * Minimal client for any OpenAI-compatible chat-completions API. Google Gemini,
 * Groq, OpenRouter, OpenAI and others all expose this format, so switching
 * provider only means changing LLM_BASE_URL, LLM_MODEL and LLM_API_KEY.
 *
 * Returns the model's raw text. The caller never trusts it: the client parses
 * and validates it before anything reaches the engine.
 */

export async function callOpenAiCompatible({ baseUrl, apiKey, model, system, user, timeoutMs = 8000, fetchImpl = fetch }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  const send = (jsonMode) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

  let res = await send(true)
  // Not every provider/model supports JSON mode; the prompt alone still asks for JSON.
  if (res.status === 400) res = await send(false)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new Error('empty response')
  return content
}
