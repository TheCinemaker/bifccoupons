import React, { useState } from 'react';

const AdminModal = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>ADMINISZTRÁTORI BELÉPÉS</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="admin-form">
          <p className="admin-instruction">Kérjük adja meg a 4 jegyű adminisztrátori PIN kódot a Deal Studio és szerkesztői funkciók eléréséhez.</p>

          <div className="pin-input-group">
            <input 
              type="password"
              maxLength="4"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="0000"
              className="pin-input"
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
