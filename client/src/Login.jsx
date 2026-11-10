import { useState } from 'react';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { token } = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Doc Chat</h1>
        <p className="muted">Ask questions about your PDF and TXT files.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
      </form>
    </div>
  );
}
