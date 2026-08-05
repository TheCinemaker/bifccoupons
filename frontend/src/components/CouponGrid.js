import React, { useState, useEffect } from 'react';

const CouponGrid = ({ coupons = [], activeSheet, setActiveSheet, searchTerm, setSearchTerm, onSendToStudio }) => {
  const [copiedCode, setCopiedCode] = useState(null);
  const [visibleCount, setVisibleCount] = useState(36);

  const sheets = ['Összes', 'BG Unique', 'BG Unique HUN', 'BANGGOODAPI', 'ALIEXPRESSAPI', 'Geekbuying', 'Geekbuying Unique'];

  useEffect(() => {
    setVisibleCount(36);
  }, [activeSheet, searchTerm]);

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = searchTerm
      ? (coupon.name && coupon.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (coupon.code && coupon.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (coupon.warehouse && coupon.warehouse.toLowerCase().includes(searchTerm.toLowerCase()))
      : true;

    const matchesSheet = activeSheet === 'Összes' ? true : coupon.source === activeSheet;

    return matchesSearch && matchesSheet;
  });

  const visibleCoupons = filteredCoupons.slice(0, visibleCount);

  return (
    <div className="coupon-grid-section">
      <div className="grid-controls">
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Keresés terméknévre, kuponkódra vagy raktárra..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <span className="clear-icon" onClick={handleClearSearch}>
              &times;
            </span>
          )}
        </div>

        <div className="tabs">
          {sheets.map(sheet => (
            <button
              key={sheet}
              className={`tab ${sheet === activeSheet ? 'active' : ''}`}
              onClick={() => setActiveSheet(sheet)}
            >
              {sheet}
            </button>
          ))}
        </div>
      </div>

      <div className="results-info">
        <span>Megjelenítve: <strong>{visibleCoupons.length} / {filteredCoupons.length} db kupon</strong></span>
        {activeSheet !== 'Összes' && <span className="active-filter-badge">Szűrő: {activeSheet}</span>}
      </div>

      <div className="coupons-grid">
        {visibleCoupons.length > 0 ? (
          visibleCoupons.map((coupon, index) => {
            const secureImageUrl = coupon.image
              ? coupon.image.replace('http://', 'https://')
              : 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=400&q=80';

            return (
              <div key={index} className="coupon-card">
                <div className="card-image-wrapper">
                  <img 
                    src={secureImageUrl} 
                    alt={coupon.name} 
                    className="coupon-image" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=400&q=80';
                    }}
                  />
                  {coupon.source && <span className="badge-source">{coupon.source}</span>}
                  {coupon.warehouse && <span className="badge-warehouse">Raktár: {coupon.warehouse}</span>}
                </div>

                <div className="coupon-info">
                  <h4 className="coupon-title">{coupon.name || 'Akciós Termék'}</h4>

                  <div className="coupon-details">
                    <p className="detail-row">
                      <span className="detail-label">Kuponkód:</span>
                      <span className="detail-code">{coupon.code || 'Automatikus kedvezmény'}</span>
                    </p>
                    <p className="detail-row">
                      <span className="detail-label">Akciós Ár:</span>
                      <span className="detail-price">{coupon.price ? `${coupon.price} Ft` : 'Lásd a linken'}</span>
                    </p>
                    {coupon.endTime && (
                      <p className="detail-row text-muted">
                        <span className="detail-label">Lejárat:</span>
                        <span>{coupon.endTime}</span>
                      </p>
                    )}
                  </div>

                  <div className="card-actions">
                    {coupon.link && (
                      <a 
                        href={coupon.link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn-card btn-view"
                      >
                        Irány a bolt
                      </a>
                    )}

                    <button 
                      onClick={() => handleCopyCode(coupon.code)} 
                      className={`btn-card btn-copy ${copiedCode === coupon.code ? 'copied' : ''}`}
                    >
                      {copiedCode === coupon.code ? '[OK] Másolva!' : 'Kupon másolása'}
                    </button>

                    <button 
                      onClick={() => onSendToStudio(coupon)} 
                      className="btn-card btn-studio"
                      title="Küldés a Deal Studio generátorba poszt és kép készítéséhez"
                    >
                      Deal Studio
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-coupons">
            <p>Nincs találat a megadott keresési feltételekre.</p>
          </div>
        )}
      </div>

      {visibleCount < filteredCoupons.length && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button 
            className="btn-action btn-secondary" 
            onClick={() => setVisibleCount(prev => prev + 48)}
            style={{ padding: '0.85rem 2rem' }}
          >
            További kuponok betöltése ({filteredCoupons.length - visibleCount} maradt)
          </button>
        </div>
      )}
    </div>
  );
};

export default CouponGrid;
