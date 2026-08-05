import React, { useState, useEffect } from 'react';

const AdminModal = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Ablak bezárásakor ne maradjon bent a korábbi hibaüzenet
  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === '0169') {
      setError('');
      setPin('');
      onSuccess();
    } else {
      setError('Hibás PIN kód. Próbáld újra!');
      setPin('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="admin-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Adminisztrátori belépés</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Bezárás">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-form">
          <p className="admin-instruction">
            Add meg a 4 jegyű PIN kódot a Deal Studio és a szerkesztői funkciók eléréséhez.
          </p>

          <div className="pin-input-group">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength="4"
              value={pin}
              onChange={e => {
                setPin(e.target.value.replace(/\D/g, ''));
                if (error) setError('');
              }}
              placeholder="••••"
              className={`pin-input ${error ? 'has-error' : ''}`}
              aria-label="PIN kód"
              autoFocus
            />
          </div>

          {error && <div className="admin-error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-mac btn-mac-secondary" onClick={onClose}>
              Mégse
            </button>
            <button type="submit" className="btn-mac btn-mac-primary">
              Belépés
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminModal;
