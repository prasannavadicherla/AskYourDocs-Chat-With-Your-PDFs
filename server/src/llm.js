// Gemini chat completion over the REST streaming endpoint (Server-Sent Events).
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const SYSTEM = "You are a helpful assistant that answers questions about the user's uploaded documents.";

// Streams text deltas to onText. Returns the final token usage.
async function streamAnswer(messages, onText) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini failed: ${res.status} ${await res.text()}`);

  const usage = { input_tokens: 0, output_tokens: 0 };
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line) => {
    if (!line.startsWith('data: ')) return;
    const json = JSON.parse(line.slice(6));
    const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (text) onText(text);
    if (json.usageMetadata) {
      usage.input_tokens = json.usageMetadata.promptTokenCount || 0;
      usage.output_tokens = json.usageMetadata.candidatesTokenCount || 0;
    }
  };
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer);
  return usage;
}

module.exports = { streamAnswer };
