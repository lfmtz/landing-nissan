import { useEffect, useRef } from 'react';
import { large } from './api.js';
import Icon from './Icon.jsx';

export default function Lightbox({ items, index, onIndex, onClose, onDelete, onToast }) {
  const item = items[index];
  const touch = useRef(null);

  const go = (d) => {
    const n = index + d;
    if (n >= 0 && n < items.length) onIndex(n);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.url);
      onToast('URL copiada');
    } catch {
      window.prompt('Copia la URL:', item.url);
    }
  }

  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Vista de imagen">
      <div className="lb-top">
        <span className="lb-count">{index + 1} / {items.length}</span>
        <button className="icon-btn light" onClick={onClose} aria-label="Cerrar">
          <Icon name="x" />
        </button>
      </div>

      <div
        className="lb-stage"
        onClick={onClose}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        {index > 0 && (
          <button className="lb-nav left" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Anterior">
            <Icon name="chevronLeft" size={26} />
          </button>
        )}
        <img key={item.id} src={large(item.url)} alt="" onClick={(e) => e.stopPropagation()} />
        {index < items.length - 1 && (
          <button className="lb-nav right" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Siguiente">
            <Icon name="chevronRight" size={26} />
          </button>
        )}
      </div>

      <div className="lb-bar">
        <div className="lb-info">
          {item.width && item.height ? `${item.width}×${item.height}` : ''}
          {item.format ? ` · ${item.format.toUpperCase()}` : ''}
        </div>
        <div className="lb-actions">
          <button className="btn light" onClick={copy}><Icon name="copy" size={16} /> URL</button>
          <a className="btn light" href={item.url} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> Abrir
          </a>
          <button className="btn danger" onClick={() => onDelete(item)}>
            <Icon name="trash" size={16} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
