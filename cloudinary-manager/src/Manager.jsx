import { useCallback, useEffect, useRef, useState } from 'react';
import { api, lsGet, lsSet, thumb, prepareImage, uploadToCloudinary } from './api.js';
import Icon from './Icon.jsx';
import Lightbox from './Lightbox.jsx';

const fmtBytes = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Manager({ onLogout }) {
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState(() => lsGet('cm_account'));
  const [path, setPath] = useState('');
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [viewer, setViewer] = useState(null); // índice abierto en el lightbox
  const [folderDialog, setFolderDialog] = useState(false);
  const [queue, setQueue] = useState([]);
  const [toast, setToast] = useState('');

  const camRef = useRef(null);
  const galRef = useRef(null);
  const reqId = useRef(0);
  const jobId = useRef(0);
  const live = useRef({ accountId, path });
  live.current = { accountId, path };

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2600);
  }, []);

  /* ------------------------------ cuentas ------------------------------ */
  useEffect(() => {
    api
      .accounts()
      .then(({ accounts }) => {
        setAccounts(accounts);
        setAccountId((cur) => (accounts.some((a) => a.id === cur) ? cur : accounts[0]?.id ?? null));
      })
      .catch((e) => {
        setAccounts([]);
        setError(e.message);
      });
  }, []);

  useEffect(() => {
    if (accountId) lsSet('cm_account', accountId);
  }, [accountId]);

  /* -------------------------- carga de contenido -------------------------- */
  const load = useCallback(async () => {
    if (!accountId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const [f, r] = await Promise.all([
        api.folders(accountId, path),
        path ? api.resources(accountId, path) : Promise.resolve({ resources: [], nextCursor: null }),
      ]);
      if (id !== reqId.current) return;
      setFolders(f.folders);
      setItems(r.resources);
      setCursor(r.nextCursor);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [accountId, path]);

  useEffect(() => {
    setSelected(new Set());
    setSelectMode(false);
    setViewer(null);
    load();
  }, [load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.resources(accountId, path, cursor);
      setItems((cur) => [...cur, ...r.resources]);
      setCursor(r.nextCursor);
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchAccount(id) {
    if (id === accountId) return;
    setFolders([]);
    setItems([]);
    setPath('');
    setAccountId(id);
  }

  /* ------------------------------ folders ------------------------------ */
  async function createFolder(name) {
    const full = [path, name.trim()].filter(Boolean).join('/');
    await api.createFolder(accountId, full);
    setFolderDialog(false);
    setPath(full);
    showToast('Folder creado');
  }

  /* ------------------------------- subida ------------------------------- */
  const patchJob = (id, patch) => setQueue((q) => q.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  async function runJob(job, target) {
    try {
      patchJob(job.id, { status: 'prep' });
      const blob = await prepareImage(job.file);
      patchJob(job.id, { status: 'up', progress: 0 });
      const sig = await api.signUpload(target.accountId, target.path);
      const name = job.file.name || 'foto.jpg';
      const res = await uploadToCloudinary(sig, blob, name, (p) => patchJob(job.id, { progress: p }));
      patchJob(job.id, { status: 'done', progress: 100 });
      const cur = live.current;
      if (cur.accountId === target.accountId && cur.path === target.path) setItems((it) => [res, ...it]);
      setTimeout(() => setQueue((q) => q.filter((j) => j.id !== job.id)), 3500);
    } catch (e) {
      patchJob(job.id, { status: 'error', error: e.message });
    }
  }

  async function handleFiles(fileList, input) {
    const files = [...fileList];
    if (input) input.value = ''; // permite volver a elegir el mismo archivo
    if (!files.length || !path) return;
    const target = { accountId, path };
    const jobs = files.map((file) => ({
      id: ++jobId.current,
      name: file.name || 'foto.jpg',
      file,
      status: 'wait',
      progress: 0,
    }));
    setQueue((q) => [...q, ...jobs]);
    let i = 0;
    const worker = async () => {
      while (i < jobs.length) await runJob(jobs[i++], target);
    };
    await Promise.all([worker(), worker()]);
  }

  /* ------------------------ selección y eliminación ------------------------ */
  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function removeIds(ids) {
    if (!ids.length) return;
    const msg = ids.length === 1 ? '¿Eliminar esta imagen de Cloudinary? No se puede deshacer.' : `¿Eliminar ${ids.length} imágenes de Cloudinary? No se puede deshacer.`;
    if (!window.confirm(msg)) return;
    try {
      await api.remove(accountId, ids);
      setItems((cur) => cur.filter((i) => !ids.includes(i.id)));
      setSelected(new Set());
      setSelectMode(false);
      setViewer(null);
      showToast(ids.length === 1 ? 'Imagen eliminada' : `${ids.length} imágenes eliminadas`);
    } catch (e) {
      showToast(e.message);
    }
  }

  /* -------------------------------- vista -------------------------------- */
  const crumbs = path ? path.split('/') : [];
  const account = accounts?.find((a) => a.id === accountId);
  const canUpload = !!path;

  if (accounts && accounts.length === 0 && !error) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Sin cuentas configuradas</h1>
          <p className="muted">
            Agrega CLOUD_1_NAME, CLOUD_1_KEY y CLOUD_1_SECRET en las variables de entorno.
          </p>
          <button className="btn block" onClick={onLogout}>Salir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <span className="brand-logo"><Icon name="camera" size={18} /></span>
            Fotos
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={load} title="Recargar" aria-label="Recargar" disabled={loading}>
              <Icon name="refresh" />
            </button>
            <button className="icon-btn" onClick={onLogout} title="Salir" aria-label="Salir">
              <Icon name="logout" />
            </button>
          </div>
        </div>
        <nav className="accounts" aria-label="Cuentas">
          {(accounts || []).map((a) => (
            <button
              key={a.id}
              className={`acc ${a.id === accountId ? 'on' : ''}`}
              onClick={() => switchAccount(a.id)}
              aria-pressed={a.id === accountId}
            >
              {a.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="layout">
        <aside className="side">
          <div className="crumbs" aria-label="Ruta">
            <button className={!path ? 'crumb on' : 'crumb'} onClick={() => setPath('')}>
              {account?.label || 'Inicio'}
            </button>
            {crumbs.map((c, i) => {
              const to = crumbs.slice(0, i + 1).join('/');
              return (
                <span key={to} className="crumb-wrap">
                  <span className="sep">/</span>
                  <button className={to === path ? 'crumb on' : 'crumb'} onClick={() => setPath(to)}>
                    {c}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="side-head">
            <h2>{path ? 'Subfolders' : 'Folders'}</h2>
            <button className="btn small" onClick={() => setFolderDialog(true)}>
              <Icon name="folderPlus" size={16} /> Nuevo
            </button>
          </div>

          <ul className="folders">
            {folders.map((f) => (
              <li key={f.path}>
                <button className="folder" onClick={() => setPath(f.path)}>
                  <Icon name="folder" size={18} />
                  <span>{f.name}</span>
                </button>
              </li>
            ))}
            {!loading && folders.length === 0 && (
              <li className="muted small-note">{path ? 'Sin subfolders' : 'Aún no hay folders'}</li>
            )}
          </ul>
        </aside>

        <section className="content">
          <div className="toolbar">
            <div className="title">
              <h2>{path ? crumbs[crumbs.length - 1] : 'Elige un folder'}</h2>
              {path && !loading && (
                <span className="muted">
                  {items.length}
                  {cursor ? '+' : ''} {items.length === 1 ? 'imagen' : 'imágenes'}
                </span>
              )}
            </div>

            {path && items.length > 0 && (
              <div className="sel-tools">
                {selectMode ? (
                  <>
                    <button className="btn danger" disabled={!selected.size} onClick={() => removeIds([...selected])}>
                      <Icon name="trash" size={16} /> Eliminar ({selected.size})
                    </button>
                    <button className="btn" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setSelectMode(true)}>
                    <Icon name="select" size={16} /> Seleccionar
                  </button>
                )}
              </div>
            )}

            <div className="actions">
              <button className="btn primary big" disabled={!canUpload} onClick={() => camRef.current?.click()}>
                <Icon name="camera" /> Tomar foto
              </button>
              <button className="btn big" disabled={!canUpload} onClick={() => galRef.current?.click()}>
                <Icon name="image" /> Galería
              </button>
            </div>
          </div>

          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => handleFiles(e.target.files, e.target)}
          />
          <input
            ref={galRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files, e.target)}
          />

          {error && (
            <div className="alert" role="alert">
              {error} <button className="link" onClick={load}>Reintentar</button>
            </div>
          )}

          {!path && !loading && !error && (
            <div className="empty">
              <Icon name="folder" size={40} />
              <p>Abre un folder para ver y subir fotos, o crea uno nuevo.</p>
            </div>
          )}

          {path && !loading && !error && items.length === 0 && (
            <div className="empty">
              <Icon name="image" size={40} />
              <p>Este folder no tiene imágenes todavía.</p>
              <p className="muted">Usa “Tomar foto” o “Galería” para subir.</p>
            </div>
          )}

          {loading && <div className="empty muted">Cargando…</div>}

          {path && items.length > 0 && (
            <>
              <div className="grid">
                {items.map((it, idx) => (
                  <button
                    key={it.id}
                    className={`tile ${selected.has(it.id) ? 'sel' : ''}`}
                    onClick={() => (selectMode ? toggle(it.id) : setViewer(idx))}
                    aria-label={`Imagen ${idx + 1}`}
                  >
                    <img src={thumb(it.url)} alt="" loading="lazy" />
                    {selectMode && (
                      <span className="check">{selected.has(it.id) && <Icon name="check" size={16} />}</span>
                    )}
                    <span className="meta">{fmtBytes(it.bytes || 0)}</span>
                  </button>
                ))}
              </div>
              {cursor && (
                <div className="more">
                  <button className="btn" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {queue.length > 0 && (
        <div className="queue" role="status" aria-live="polite">
          {queue.map((j) => (
            <div key={j.id} className={`job ${j.status}`}>
              <div className="job-top">
                <span className="job-name">{j.name}</span>
                <span className="job-state">
                  {j.status === 'wait' && 'En espera'}
                  {j.status === 'prep' && 'Preparando…'}
                  {j.status === 'up' && `${j.progress}%`}
                  {j.status === 'done' && 'Listo ✓'}
                  {j.status === 'error' && 'Error'}
                </span>
                {j.status === 'error' && (
                  <button className="icon-btn tiny" aria-label="Descartar" onClick={() => setQueue((q) => q.filter((x) => x.id !== j.id))}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              {j.status === 'error' ? (
                <div className="job-err">{j.error}</div>
              ) : (
                <div className="bar"><i style={{ width: `${j.status === 'done' ? 100 : j.progress}%` }} /></div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewer != null && items[viewer] && (
        <Lightbox
          items={items}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          onDelete={(it) => removeIds([it.id])}
          onToast={showToast}
        />
      )}

      {folderDialog && (
        <FolderDialog parent={path} onCancel={() => setFolderDialog(false)} onCreate={createFolder} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function FolderDialog({ parent, onCancel, onCreate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const invalid = /[\\/&,?%#<>]/.test(name) || name.trim() === '.' || name.trim() === '..';

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || invalid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(name);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onCancel}>
      <form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h3>Nuevo folder</h3>
        <p className="muted">{parent ? `Dentro de: ${parent}` : 'En la raíz de la cuenta'}</p>
        <label className="field">
          <span>Nombre</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Jeep Compass 2026" />
        </label>
        {invalid && <div className="alert">No uses / \ &amp; , ? % # &lt; &gt; en el nombre.</div>}
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" disabled={!name.trim() || invalid || busy}>
            {busy ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}
