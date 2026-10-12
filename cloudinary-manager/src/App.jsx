import { useEffect, useState } from 'react';
import { getToken, clearToken } from './api.js';
import Login from './Login.jsx';
import Manager from './Manager.jsx';

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());

  useEffect(() => {
    const onExpire = () => setAuthed(false);
    window.addEventListener('cm:unauthorized', onExpire);
    return () => window.removeEventListener('cm:unauthorized', onExpire);
  }, []);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <Manager
      onLogout={() => {
        clearToken();
        setAuthed(false);
      }}
    />
  );
}
