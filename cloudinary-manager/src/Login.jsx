import { useState } from 'react';
import { api, setToken } from './api.js';
import Icon from './Icon.jsx';

export default function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const { token } = await api.login(password);
      setToken(token);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <Icon name="camera" size={30} />
        </div>
        <h1>Fotos Cloudinary</h1>
        <p className="muted">Ingresa la contraseña para administrar tus cuentas.</p>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
