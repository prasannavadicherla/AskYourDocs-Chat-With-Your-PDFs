import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, streamMessage } from './api.js';

export default function Chat({ onLogout }) {
  const [chats, setChats] = useState([]);
  const [docs, setDocs] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    api('/chats').then(setChats).catch((e) => setError(e.message));
    api('/documents').then(setDocs).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openChat(id) {
    setChatId(id);
    setMessages(await api(`/chats/${id}/messages`));
  }

  function newChat() {
    setChatId(null);
    setMessages([]);
  }

  async function deleteChat(id) {
    await api(`/chats/${id}`, { method: 'DELETE' });
    setChats((c) => c.filter((x) => x.id !== id));
    if (id === chatId) newChat();
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const doc = await api('/documents', { method: 'POST', form });
      setDocs((d) => [doc, ...d]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      fileInput.current.value = '';
    }
  }

  async function deleteDoc(id) {
    await api(`/documents/${id}`, { method: 'DELETE' });
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  // Update the last (assistant) message in place while it streams
  const patchLast = (fn) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);

  async function send(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    setError('');

    let id = chatId;
    if (!id) {
      const chat = await api('/chats', { method: 'POST', body: { title: content.slice(0, 60) } });
      id = chat.id;
      setChatId(id);
      setChats((c) => [chat, ...c]);
    }
    setMessages((m) => [...m, { role: 'user', content }, { role: 'assistant', content: '', sources: [] }]);

    await streamMessage(id, content, {
      onSources: (sources) => patchLast((msg) => ({ ...msg, sources })),
      onDelta: (text) => patchLast((msg) => ({ ...msg, content: msg.content + text })),
      onDone: (meta) => patchLast((msg) => ({ ...msg, meta })),
      onError: (err) => setError(err),
    }).catch((err) => setError(err.message));
    setBusy(false);
  }

  return (
    <div className="layout">
      <aside>
        <button onClick={newChat}>+ New chat</button>
        <h3>Chats</h3>
        <ul>
          {chats.map((c) => (
            <li key={c.id} className={c.id === chatId ? 'active' : ''}>
              <span onClick={() => openChat(c.id)}>{c.title}</span>
              <button className="x" onClick={() => deleteChat(c.id)} aria-label="Delete chat">×</button>
            </li>
          ))}
        </ul>
        <h3>Documents</h3>
        <input ref={fileInput} type="file" accept=".pdf,.txt" onChange={upload} hidden />
        <button onClick={() => fileInput.current.click()} disabled={uploading}>
          {uploading ? 'Processing…' : 'Upload PDF or TXT'}
        </button>
        <ul>
          {docs.map((d) => (
            <li key={d.id}>
              <span title={`${d.chunks} chunks`}>{d.filename}</span>
              <button className="x" onClick={() => deleteDoc(d.id)} aria-label="Delete document">×</button>
            </li>
          ))}
        </ul>
        <button className="link" onClick={onLogout}>Log out</button>
      </aside>

      <main>
        <div className="messages">
          {!messages.length && <p className="muted center">Upload a document, then ask a question about it.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <ReactMarkdown>{m.content || '…'}</ReactMarkdown> : <p>{m.content}</p>}
              {m.sources?.length > 0 && (
                <div className="sources">
                  {m.sources.map((s) => (
                    <span key={s.id}>[{s.id}] {s.filename} ({s.score})</span>
                  ))}
                </div>
              )}
              {m.meta && (
                <div className="meta">
                  {m.meta.latency_ms} ms · {m.meta.usage.input_tokens} in / {m.meta.usage.output_tokens} out tokens
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {error && <p className="error">{error}</p>}
        <form className="composer" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your documents" />
          <button type="submit" disabled={busy}>{busy ? '…' : 'Send'}</button>
        </form>
      </main>
    </div>
  );
}
