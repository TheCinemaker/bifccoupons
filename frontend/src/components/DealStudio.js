import React, { useState, useEffect, useRef } from 'react';

const STORE_FILTERS = [
  { label: 'Osszes', key: 'Osszes' },
  { label: 'BANGGOOD', keys: ['BANGGOODAPI', 'BG ALL Coupons', 'Banggood'] },
  { label: 'BG UNIQUE', keys: ['BG Unique', 'BG Unique HUN'] },
  { label: 'ALIEXPRESS', keys: ['ALIEXPRESSAPI', 'AliExpress ALL', 'AliExpress'] },
  { label: 'GEEKBUYING', keys: ['Geekbuying'] },
  { label: 'GB UNIQUE', keys: ['Geekbuying Unique'] },
];

// Currency mapping by source/store
const formatStudioPrice = (rawPrice, source) => {
  if (rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === '') {
    return 'Lásd a linken';
  }
  let str = String(rawPrice).trim().replace(/\s*Ft\s*$/gi, '').trim();

  // If already has currency symbol/code (EUR, USD, $, €, GBP, £), return cleaned
  if (/EUR|USD|\$|€|GBP|£/i.test(str)) {
    return str;
  }

  // Handle numbers with comma decimals like "398,00" or "727,935491"
  let numStr = str.replace(',', '.');
  let num = parseFloat(numStr);
  if (!isNaN(num)) {
    str = (num % 1 === 0) ? String(Math.round(num)) : num.toFixed(2);
    return `${str} USD`;
  }

  return str;
};

const DealStudio = ({ initialDeal, availableCoupons = [] }) => {
  const [deal, setDeal] = useState({
    name: '',
    price: '',
    code: '',
    link: '',
    image: '',
    warehouse: '',
    source: ''
  });

  const [storeFilter, setStoreFilter] = useState('Osszes');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(20);

  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [fullPostText, setFullPostText] = useState('');
  const [copyPostSuccess, setCopyPostSuccess] = useState(false);
  const [copyCommentSuccess, setCopyCommentSuccess] = useState(false);
  const [copyFullPostSuccess, setCopyFullPostSuccess] = useState(false);
  const [copyImageSuccess, setCopyImageSuccess] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    if (initialDeal && initialDeal.name) {
      setDeal({
        name: initialDeal.name || '',
        price: initialDeal.price || '',
        code: initialDeal.code || '',
        link: initialDeal.link || '',
        image: initialDeal.image || '',
        warehouse: initialDeal.warehouse || '',
        source: initialDeal.source || ''
      });
    }
  }, [initialDeal]);

  // Reset picker page when filter or search changes
  useEffect(() => {
    setPickerPage(20);
  }, [storeFilter, pickerSearch]);

  // Filter available coupons by store + search
  const filteredCoupons = availableCoupons.filter(c => {
    // Store filter
    if (storeFilter !== 'Osszes') {
      const filterDef = STORE_FILTERS.find(f => f.label === storeFilter);
      if (filterDef && filterDef.keys && !filterDef.keys.includes(c.source)) {
        return false;
      }
    }
    // Text search
    if (pickerSearch) {
      const q = pickerSearch.toLowerCase();
      const nameMatch = c.name && c.name.toLowerCase().includes(q);
      const codeMatch = c.code && c.code.toLowerCase().includes(q);
      if (!nameMatch && !codeMatch) return false;
    }
    return true;
  });

  const visibleCoupons = filteredCoupons.slice(0, pickerPage);

  const selectProduct = (coupon) => {
    setDeal({
      name: coupon.name || '',
      price: coupon.price || '',
      code: coupon.code || '',
      link: coupon.link || '',
      image: coupon.image || '',
      warehouse: coupon.warehouse || '',
      source: coupon.source || ''
    });
    // Scroll to the editor area
    const editor = document.getElementById('studio-editor');
    if (editor) editor.scrollIntoView({ behavior: 'smooth' });
  };

  // Generate post text, first comment, and full complete post
  useEffect(() => {
    const formattedPrice = formatStudioPrice(deal.price, deal.source);
    const formattedCode = deal.code ? deal.code : 'Automatikus kedvezmény';
    const formattedWarehouse = deal.warehouse ? deal.warehouse : 'EU Raktár';

    const postBody = `AKCIÓS AJÁNLAT!
Termék: ${deal.name || ''}
Akciós Ár: ${formattedPrice}
Kuponkód: ${formattedCode}
Raktár: ${formattedWarehouse}

A vásárlási linket az első kommentben találod!
#kinabolveddmeg #akció #kupon #${(deal.source || 'akció').toLowerCase().replace(/\s+/g, '')}`;

    const commentBody = `Vásárlási link a kuponos árhoz:
${deal.link || ''}`;

    const fullBody = `AKCIÓS AJÁNLAT!
Termék: ${deal.name || ''}
Akciós Ár: ${formattedPrice}
Kuponkód: ${formattedCode}
Raktár: ${formattedWarehouse}
Vásárlási link: ${deal.link || ''}

#kinabolveddmeg #akció #kupon #${(deal.source || 'akció').toLowerCase().replace(/\s+/g, '')}`;

    setPostText(postBody);
    setCommentText(commentBody);
    setFullPostText(fullBody);
  }, [deal]);

  // Canvas image generator
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 800;
    const H = 800;
    canvas.width = W;
    canvas.height = H;

    // Dark background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    const imageUrl = deal.image ? deal.image.replace('http://', 'https://') : '';

    const drawOverlay = () => {
      // Bottom dark gradient
      const botGrad = ctx.createLinearGradient(0, H - 260, 0, H);
      botGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      botGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.7)');
      botGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, H - 260, W, 260);

      // Top dark gradient
      const topGrad = ctx.createLinearGradient(0, 0, 0, 130);
      topGrad.addColorStop(0, 'rgba(15, 23, 42, 0.85)');
      topGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, W, 130);

      // --- Top badges ---
      // Warehouse badge top-left
      if (deal.warehouse) {
        const whText = `Raktar: ${deal.warehouse}`;
        ctx.font = 'bold 16px -apple-system, sans-serif';
        const whW = ctx.measureText(whText).width + 32;
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(20, 20, whW, 38, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(whText, 20 + whW / 2, 45);
      }

      // Source badge top-right
      if (deal.source) {
        ctx.font = 'bold 16px -apple-system, sans-serif';
        const srcW = ctx.measureText(deal.source).width + 32;
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.roundRect(W - srcW - 20, 20, srcW, 38, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(deal.source, W - 20 - srcW / 2, 45);
      }

      // --- Bottom price area ---
      const priceText = formatStudioPrice(deal.price, deal.source);
      const hasPrice = deal.price && String(deal.price).trim();

      if (hasPrice || deal.code) {
        // Dark panel background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(20, H - 140, W - 40, 120, 14);
        ctx.fill();
        ctx.stroke();

        // Price label + value (left side)
        if (priceText) {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
          ctx.font = '600 14px -apple-system, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('AKCIOS AR', 40, H - 108);

          ctx.fillStyle = '#00f0ff';
          ctx.font = '800 32px -apple-system, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(priceText, 40, H - 72);
        }

        // Coupon code (right side)
        if (deal.code) {
          ctx.font = '800 20px -apple-system, sans-serif';
          const codeW = ctx.measureText(deal.code).width + 40;
          const codeBoxW = Math.max(codeW, 140);
          const codeX = W - 40 - codeBoxW;

          // Code box background
          ctx.fillStyle = '#ffb703';
          ctx.beginPath();
          ctx.roundRect(codeX, H - 118, codeBoxW, 56, 10);
          ctx.fill();

          // Code label
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.font = '700 11px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('KUPONKOD', codeX + codeBoxW / 2, H - 98);

          // Code value
          ctx.fillStyle = '#0f172a';
          ctx.font = '800 20px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(deal.code, codeX + codeBoxW / 2, H - 74);
        }

        // Product name at the very bottom
        if (deal.name) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.font = '500 13px -apple-system, sans-serif';
          ctx.textAlign = 'left';
          const truncName = deal.name.length > 75 ? deal.name.substring(0, 75) + '...' : deal.name;
          ctx.fillText(truncName, 40, H - 32);
        }
      }
    };

    // Load image WITHOUT crossOrigin to avoid CORS blocking from CDNs
    const img = new Image();
    // Do NOT set img.crossOrigin - this lets the image load from any CDN
    // Trade-off: canvas becomes "tainted" so clipboard copy won't work,
    // but download and visual display both work fine
    img.src = imageUrl;

    img.onload = () => {
      const scale = Math.max(W / img.width, H / img.height);
      const x = (W / 2) - (img.width / 2) * scale;
      const y = (H / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      drawOverlay();
    };

    img.onerror = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(deal.name || 'Termekkep nem elerheto', W / 2, H / 2);
      drawOverlay();
    };
  }, [deal]);

  const handleCopyPost = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(postText);
    }
    setCopyPostSuccess(true);
    setTimeout(() => setCopyPostSuccess(false), 2000);
  };

  const handleCopyComment = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(commentText);
    }
    setCopyCommentSuccess(true);
    setTimeout(() => setCopyCommentSuccess(false), 2000);
  };

  const handleCopyFullPost = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullPostText);
    }
    setCopyFullPostSuccess(true);
    setTimeout(() => setCopyFullPostSuccess(false), 2000);
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `fb-poszt-${(deal.code || 'termek').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert('A kep letoltese nem sikerult (CORS). Hasznalja a jobb klikk -> Kep mentese opciot.');
    }
  };

  const handleCopyImageToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error('No blob'));
          }, 'image/png');
        } catch (e) {
          reject(e);
        }
      });
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new window.ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopyImageSuccess(true);
        setTimeout(() => setCopyImageSuccess(false), 2000);
      } else {
        handleDownloadImage();
      }
    } catch (err) {
      // Canvas is tainted from cross-origin image, fallback to download
      handleDownloadImage();
    }
  };

  return (
    <div className="deal-studio-container">
      <div className="studio-header">
        <h2>Facebook poszt &amp; komment generáló</h2>
        <p>Válassz terméket boltonként szűrve, majd másold ki a posztszöveget, az első kommentet és a képet.</p>
      </div>

      {/* Product Picker with Store Filter Tabs */}
      {availableCoupons.length > 0 && (
        <div className="studio-picker-section">
          <h3>Termék kiválasztása ({filteredCoupons.length} db)</h3>

          {/* Store filter pills */}
          <div className="tabs-scroll-wrapper mt-12">
            <div className="tabs-container">
              {STORE_FILTERS.map(f => (
                <button
                  key={f.label}
                  type="button"
                  className={`tab-pill ${f.label === storeFilter ? 'active' : ''}`}
                  onClick={() => setStoreFilter(f.label)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search within filtered */}
          <div className="search-wrapper mt-12">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Keresés terméknévre vagy kuponkódra…"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className="mac-input"
            />
            {pickerSearch && (
              <button type="button" className="clear-icon" onClick={() => setPickerSearch('')} aria-label="Törlés">
                &times;
              </button>
            )}
          </div>

          {/* Product list */}
          <div className="studio-product-list">
            {visibleCoupons.map((c, idx) => {
              const thumbUrl = c.image ? c.image.replace('http://', 'https://') : '';
              const isSelected = deal.name === c.name && deal.code === c.code && deal.source === c.source;
              return (
                <div
                  key={idx}
                  className={`studio-product-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectProduct(c)}
                >
                  <div className="product-item-thumb">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={c.name}
                        referrerPolicy="no-referrer"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="product-item-no-img">--</div>
                    )}
                  </div>
                  <div className="product-item-info">
                    <span className="product-item-name">{c.name ? c.name.substring(0, 65) : 'Nevtelen'}</span>
                    <div className="product-item-meta">
                      <span className="product-item-source">{c.source}</span>
                      {c.code && <span className="product-item-code">{c.code}</span>}
                      {c.price && <span className="product-item-price">{c.price}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleCoupons.length === 0 && (
              <div className="studio-empty">Nincs találat a megadott szűrőkkel.</div>
            )}
          </div>

          {pickerPage < filteredCoupons.length && (
            <button
              type="button"
              className="btn-mac btn-mac-secondary w-full mt-12"
              onClick={() => setPickerPage(p => p + 20)}
            >
              További termékek betöltése ({filteredCoupons.length - pickerPage} maradt)
            </button>
          )}
        </div>
      )}

      {/* Editor + Image Generator */}
      <div className="studio-layout" id="studio-editor">
        {/* Left column: Text editor */}
        <div className="studio-panel">
          <h3>FB poszt &amp; első komment adatai</h3>

          <div className="form-group">
            <label className="form-label">Termék neve</label>
            <input
              type="text"
              className="mac-input"
              value={deal.name || ''}
              onChange={e => setDeal({...deal, name: e.target.value})}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kuponos ár</label>
              <input
                type="text"
                className="mac-input"
                value={deal.price || ''}
                onChange={e => setDeal({...deal, price: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Kuponkód</label>
              <input
                type="text"
                className="mac-input"
                value={deal.code || ''}
                onChange={e => setDeal({...deal, code: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Raktár</label>
              <input
                type="text"
                className="mac-input"
                value={deal.warehouse || ''}
                onChange={e => setDeal({...deal, warehouse: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bolt</label>
              <input
                type="text"
                className="mac-input"
                value={deal.source || ''}
                onChange={e => setDeal({...deal, source: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vásárlási link (első kommentbe)</label>
            <input
              type="text"
              className="mac-input"
              value={deal.link || ''}
              onChange={e => setDeal({...deal, link: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kép URL (az A oszlopból automatikusan)</label>
            <input
              type="text"
              className="mac-input"
              value={deal.image || ''}
              onChange={e => setDeal({...deal, image: e.target.value})}
            />
          </div>

          {/* Post text area */}
          <div className="form-group mt-16">
            <label className="form-label">Fő Facebook posztszöveg (a kép mellé)</label>
            <textarea
              className="mac-input"
              value={postText}
              readOnly
              rows={6}
            />
            <button
              type="button"
              className={`btn-mac w-full mt-12 ${copyPostSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyPost}
            >
              {copyPostSuccess ? 'Posztszöveg másolva' : 'Fő posztszöveg másolása'}
            </button>
          </div>

          {/* First comment area */}
          <div className="form-group mt-16">
            <label className="form-label">Első komment (közvetlen vásárlási link)</label>
            <textarea
              className="mac-input"
              value={commentText}
              readOnly
              rows={3}
            />
            <button
              type="button"
              className={`btn-mac w-full mt-12 ${copyCommentSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyComment}
            >
              {copyCommentSuccess ? 'Komment másolva' : 'Első komment másolása'}
            </button>
          </div>

          {/* Full complete post area */}
          <div className="form-group mt-16">
            <label className="form-label">Teljes poszt + link egyben (ha kommentbe vagy posztba teszed)</label>
            <textarea
              className="mac-input"
              value={fullPostText}
              readOnly
              rows={8}
            />
            <button
              type="button"
              className={`btn-mac w-full mt-12 ${copyFullPostSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyFullPost}
            >
              {copyFullPostSuccess ? 'Teljes poszt másolva' : 'Teljes poszt másolása egyben'}
            </button>
          </div>
        </div>

        {/* Right column: Image generator */}
        <div className="studio-panel">
          <h3>Posztolható termékkép</h3>
          <p className="studio-hint">
            A kép automatikusan az A oszlopból (image) töltődik be. Töltsd le vagy másold a vágólapra.
          </p>

          <div className="canvas-preview-container mt-12">
            <canvas ref={canvasRef} />
          </div>

          <div className="stack-8 mt-16">
            <button
              type="button"
              className={`btn-mac ${copyImageSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyImageToClipboard}
            >
              {copyImageSuccess ? 'Kép a vágólapon' : 'Kép másolása vágólapra'}
            </button>

            <button
              type="button"
              className="btn-mac btn-mac-secondary"
              onClick={handleDownloadImage}
            >
              Kép letöltése HD PNG-ben
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealStudio;
