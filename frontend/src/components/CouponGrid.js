import React, { useState, useEffect } from 'react';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=600&q=80';

/* Az árat számra + pénznemre bontjuk, hogy tipográfiailag elválhassanak. */
const parseDisplayPrice = (rawPrice) => {
  if (rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === '') {
    return { value: 'Lásd a linken', currency: '', soft: true };
  }

  const str = String(rawPrice).trim().replace(/\s*Ft\s*$/gi, '').trim();

  // Már tartalmaz pénznemet: leválasztjuk a jelölést a számról
  if (/EUR|USD|\$|€|GBP|£/i.test(str)) {
    const match = str.match(/^([^A-Za-z$€£]*)\s*(EUR|USD|GBP|\$|€|£)?\s*(.*)$/i);
    if (match && match[1] && match[1].trim()) {
      const tail = [match[2], match[3]].filter(Boolean).join(' ').trim();
      return { value: match[1].trim(), currency: tail, soft: false };
    }
    return { value: str, currency: '', soft: false };
  }

  const num = parseFloat(str.replace(',', '.'));
  if (!isNaN(num)) {
    const value = (num % 1 === 0) ? String(Math.round(num)) : num.toFixed(2);
    return { value: value, currency: 'USD', soft: false };
  }

  return { value: str, currency: '', soft: false };
};

const formatDisplayDate = (rawDate) => {
  if (!rawDate) return '';
  const str = String(rawDate).trim();

  if (str.indexOf('Date(') !== -1) {
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

/* Hátralévő napok a lejáratig — csak ha értelmes ISO dátumot kaptunk. */
const daysUntil = (isoDate) => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const target = new Date(`${isoDate}T23:59:59`);
  if (isNaN(target.getTime())) return null;
  const diff = target.getTime() - Date.now();
  if (diff < 0) return -1;
  return Math.floor(diff / 86400000);
};

const IconSearch = () => (
  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="sk sk-image" />
    <div className="sk-body">
      <div className="sk sk-line w-90" />
      <div className="sk sk-line w-60" />
      <div className="sk sk-line w-40" />
      <div className="sk sk-btn" />
    </div>
  </div>
);

const CouponGrid = ({
  coupons = [],
  loading = false,
  activeSheet,
  setActiveSheet,
  searchTerm,
  setSearchTerm,
  onSendToStudio,
  isAdmin
}) => {
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

  const handleCopyCode = (code) => {
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code);
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const matchesSearch = (coupon) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (coupon.name && coupon.name.toLowerCase().indexOf(q) !== -1) ||
      (coupon.code && coupon.code.toLowerCase().indexOf(q) !== -1) ||
      (coupon.warehouse && coupon.warehouse.toLowerCase().indexOf(q) !== -1)
    );
  };

  const countForTab = (tab) => {
    if (tab.label === 'Összes') return coupons.length;
    return coupons.filter(c => tab.keys.indexOf(c.source) !== -1).length;
  };

  const filteredCoupons = coupons.filter(coupon => {
    if (!matchesSearch(coupon)) return false;
    if (activeSheet === 'Összes') return true;

    const selectedTabConfig = STORE_TABS.find(tab => tab.label === activeSheet);
    if (!selectedTabConfig || !selectedTabConfig.keys) return true;

    return selectedTabConfig.keys.indexOf(coupon.source) !== -1;
  });

  const visibleCoupons = filteredCoupons.slice(0, visibleCount);

  return (
    <div className="coupon-grid-section">
      <div className="grid-toolbar">
        <div className="toolbar-row">
          <div className="search-wrapper">
            <IconSearch />
            <input
              type="search"
              placeholder="Keresés terméknévre, kuponkódra vagy raktárra…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input mac-input"
              aria-label="Keresés a kuponok között"
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-icon"
                onClick={() => setSearchTerm('')}
                aria-label="Keresés törlése"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        <div className="tabs-scroll-wrapper">
          <div className="tabs-container">
            {STORE_TABS.map(tab => {
              const count = countForTab(tab);
              return (
                <button
                  key={tab.label}
                  type="button"
                  className={`tab-pill ${tab.label === activeSheet ? 'active' : ''}`}
                  onClick={() => setActiveSheet(tab.label)}
                >
                  {tab.label}
                  {count > 0 && <span className="pill-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="results-info">
        <span>
          Megjelenítve <strong>{visibleCoupons.length}</strong> / <strong>{filteredCoupons.length}</strong> kupon
        </span>
        {activeSheet !== 'Összes' && (
          <span className="active-filter-badge">Szűrő: {activeSheet}</span>
        )}
      </div>

      <div className="coupons-grid">
        {loading && coupons.length === 0 &&
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}

        {!loading && visibleCoupons.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <h4>Nincs találat</h4>
            <p>
              {searchTerm
                ? `A(z) „${searchTerm}” keresésre nincs egyező kupon ebben a szűrőben.`
                : 'Ebben a boltban jelenleg nincs elérhető kupon.'}
            </p>
            {searchTerm && (
              <button
                type="button"
                className="btn-mac btn-mac-secondary mt-12"
                onClick={() => setSearchTerm('')}
              >
                Keresés törlése
              </button>
            )}
          </div>
        )}

        {visibleCoupons.map((coupon, index) => {
          const secureImageUrl = coupon.image
            ? coupon.image.replace('http://', 'https://')
            : FALLBACK_IMAGE;

          const price = parseDisplayPrice(coupon.price);
          const cleanDate = formatDisplayDate(coupon.endTime);
          const remaining = daysUntil(cleanDate);
          const isCopied = copiedCode === coupon.code && !!coupon.code;

          return (
            <article
              key={`${coupon.source}-${index}`}
              className="coupon-card"
              style={{ animationDelay: `${Math.min(index, 11) * 28}ms` }}
            >
              <div className="card-image-wrapper">
                <img
                  src={secureImageUrl}
                  alt={coupon.name}
                  className="coupon-image"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = FALLBACK_IMAGE;
                  }}
                />

                {coupon.source && <span className="badge-source">{coupon.source}</span>}

                {remaining !== null && remaining >= 0 && remaining <= 7 && (
                  <span className={`badge-expiry ${remaining <= 1 ? 'urgent' : ''}`}>
                    {remaining === 0 ? 'Ma jár le' : `${remaining} nap`}
                  </span>
                )}

                {coupon.warehouse && (
                  <span className="badge-warehouse">
                    <i className="dot" />
                    {coupon.warehouse}
                  </span>
                )}
              </div>

              <div className="coupon-info">
                <h4 className="coupon-title">{coupon.name || 'Akciós termék'}</h4>

                <div className="price-rail">
                  <div className="price-block">
                    <span className="price-label">Akciós ár</span>
                    <span className={`price-value ${price.soft ? 'is-soft' : ''}`}>
                      {price.value}
                      {price.currency && <span className="cur">{price.currency}</span>}
                    </span>
                  </div>

                  {coupon.code ? (
                    <button
                      type="button"
                      className={`code-chip ${isCopied ? 'is-copied' : ''}`}
                      onClick={() => handleCopyCode(coupon.code)}
                      title="Kattints a kuponkód másolásához"
                    >
                      {isCopied ? <IconCheck /> : <IconCopy />}
                      <span className="code-text">{isCopied ? 'Másolva' : coupon.code}</span>
                    </button>
                  ) : (
                    <span className="code-chip is-auto">Automatikus kedvezmény</span>
                  )}
                </div>

                <div className={`card-actions ${isAdmin ? 'has-studio' : ''}`}>
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

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onSendToStudio(coupon)}
                      className="btn-card btn-studio"
                      title="Küldés a Deal Studio generátorba"
                    >
                      Studio
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {visibleCount < filteredCoupons.length && (
        <div className="load-more-wrapper">
          <button
            type="button"
            className="btn-mac btn-mac-secondary load-more-btn"
            onClick={() => setVisibleCount(prev => prev + 48)}
          >
            További kuponok betöltése · még {filteredCoupons.length - visibleCount} db
          </button>
        </div>
      )}
    </div>
  );
};

export default CouponGrid;
