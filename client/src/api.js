const BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    setToken(null);
    window.location.reload();
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// POSTs a question and calls handlers for each SSE event as it arrives.
export async function streamMessage(chatId, content, { onSources, onDelta, onDone, onError }) {
  const res = await fetch(`${BASE}/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return onError(data.error || 'Request failed');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const match = /^event: (\w+)\ndata: (.*)$/s.exec(block);
      if (!match) continue;
      const data = JSON.parse(match[2]);
      if (match[1] === 'sources') onSources(data);
      else if (match[1] === 'delta') onDelta(data);
      else if (match[1] === 'done') onDone(data);
      else if (match[1] === 'error') onError(data);
    }
  }
}
