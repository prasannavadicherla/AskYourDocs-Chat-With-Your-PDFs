import { useState } from 'react';
import { getToken, setToken } from './api.js';
import Login from './Login.jsx';
import Chat from './Chat.jsx';

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return (
    <Chat
      onLogout={() => {
        setToken(null);
        setAuthed(false);
      }}
    />
  );
}
