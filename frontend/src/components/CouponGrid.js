import React, { useState, useEffect } from 'react';

// Currency mapping by source/store
const getCurrencyForSource = (source) => {
  if (!source) return 'USD';
  const s = source.toLowerCase();
  if (s.includes('geekbuying unique')) return 'EUR';
  if (s.includes('geekbuying')) return 'USD';
  if (s.includes('bg unique') || s.includes('bg unique hun')) return ''; // use sheet value as-is
  if (s.includes('banggood') || s.includes('bg all')) return 'USD';
  if (s.includes('aliexpress') || s.includes('aliexpressapi')) return 'USD';
  return 'USD';
};

const formatDisplayPrice = (rawPrice, source) => {
  if (!rawPrice) return 'Lasd a linken';
  let str = String(rawPrice).trim();

  // Remove trailing "Ft" everywhere - we never want Ft
  str = str.replace(/\s*Ft\s*$/gi, '').trim();

  // If already has a currency symbol, just clean up and return
  if (/EUR|USD|\$|€|GBP|£/i.test(str)) {
    return str;
  }

  // Determine correct currency from source
  const currency = getCurrencyForSource(source);

  // If no currency mapped (BG Unique - use sheet value as-is)
  if (!currency) return str || 'Lasd a linken';

  return `${str} ${currency}`;
};


const formatDisplayDate = (rawDate) => {
  if (!rawDate) return '';
  let str = String(rawDate).trim();

  if (str.includes('Date(')) {
    const match = str.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (match) {
      const year = match[1];
      const month = String(parseInt(match[2], 10) + 1).padStart(2, '0');
      const day = String(match[3]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  return str;
};

const CouponGrid = ({ coupons = [], activeSheet, setActiveSheet, searchTerm, setSearchTerm, onSendToStudio, isAdmin }) => {
  const [copiedCode, setCopiedCode] = useState(null);
  const [visibleCount, setVisibleCount] = useState(36);

  const STORE_TABS = [
    { label: 'Összes', key: 'Összes' },
    { label: 'BANGGOOD', keys: ['BANGGOODAPI', 'BG ALL Coupons', 'Banggood'] },
    { label: 'BANGGOOD UNIQUE', keys: ['BG Unique', 'BG Unique HUN'] },
    { label: 'ALIEXPRESS', keys: ['ALIEXPRESSAPI', 'AliExpress ALL', 'AliExpress'] },
    { label: 'GEEKBUYING', keys: ['Geekbuying'] },
    { label: 'GEEKBUYING UNIQUE', keys: ['Geekbuying Unique'] }
  ];

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

    if (activeSheet === 'Összes') return matchesSearch;

    const selectedTabConfig = STORE_TABS.find(tab => tab.label === activeSheet);
    if (!selectedTabConfig) return matchesSearch;

    const matchesSheet = selectedTabConfig.keys.includes(coupon.source);
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
            className="search-input mac-input"
          />
          {searchTerm && (
            <span className="clear-icon" onClick={handleClearSearch}>
              &times;
            </span>
          )}
        </div>

        <div className="tabs-scroll-wrapper">
          <div className="tabs-container">
            {STORE_TABS.map(tab => (
              <button
                key={tab.label}
                className={`tab-pill ${tab.label === activeSheet ? 'active' : ''}`}
                onClick={() => setActiveSheet(tab.label)}
              >
                {tab.label}
              </button>
            ))}
          </div>
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

            const cleanPrice = formatDisplayPrice(coupon.price, coupon.source);
            const cleanDate = formatDisplayDate(coupon.endTime);

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
                      <span className="detail-price">{cleanPrice}</span>
                    </p>
                    {cleanDate && (
                      <p className="detail-row text-muted">
                        <span className="detail-label">Lejárat:</span>
                        <span>{cleanDate}</span>
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
                      {copiedCode === coupon.code ? 'Másolva!' : 'Kupon másolása'}
                    </button>

                    {isAdmin && (
                      <button 
                        onClick={() => onSendToStudio(coupon)} 
                        className="btn-card btn-studio"
                        title="Küldés a Deal Studio generátorba poszt készítéséhez"
                      >
                        Deal Studio
                      </button>
                    )}
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
        <div className="load-more-wrapper">
          <button 
            className="btn-mac btn-mac-secondary load-more-btn" 
            onClick={() => setVisibleCount(prev => prev + 48)}
          >
            További kuponok betöltése ({filteredCoupons.length - visibleCount} maradt)
          </button>
        </div>
      )}
    </div>
  );
};

export default CouponGrid;
