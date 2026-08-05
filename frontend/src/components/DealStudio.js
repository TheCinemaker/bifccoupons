import React, { useState, useEffect, useRef } from 'react';

const STORE_FILTERS = [
  { label: 'Osszes', key: 'Osszes' },
  { label: 'BANGGOOD', keys: ['BANGGOODAPI', 'BG ALL Coupons', 'Banggood'] },
  { label: 'BG UNIQUE', keys: ['BG Unique', 'BG Unique HUN'] },
  { label: 'ALIEXPRESS', keys: ['ALIEXPRESSAPI', 'AliExpress ALL', 'AliExpress'] },
  { label: 'GEEKBUYING', keys: ['Geekbuying'] },
  { label: 'GB UNIQUE', keys: ['Geekbuying Unique'] },
];

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
  const [copyPostSuccess, setCopyPostSuccess] = useState(false);
  const [copyCommentSuccess, setCopyCommentSuccess] = useState(false);
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

  // Generate post text and first comment
  useEffect(() => {
    const formattedPrice = deal.price ? (deal.price.includes('Ft') || deal.price.includes('$') || deal.price.includes('EUR') ? deal.price : `${deal.price} Ft`) : 'Akcios ar';
    const formattedCode = deal.code ? deal.code : 'Automatikus kedvezmeny';
    const formattedWarehouse = deal.warehouse ? deal.warehouse : 'EU Raktar';

    const postBody = `AKCIOS AJANLAT!
Termek: ${deal.name || ''}
Akcios Ar: ${formattedPrice}
Kuponkod: ${formattedCode}
Raktar: ${formattedWarehouse}

A vasarlasi linket az elso kommentben talalod!
#kinabolveddmeg #akcio #kupon #${(deal.source || 'akcio').toLowerCase().replace(/\s+/g, '')}`;

    const commentBody = `Vasarlasi link a kuponos arhoz:
${deal.link || ''}`;

    setPostText(postBody);
    setCommentText(commentBody);
  }, [deal]);

  // Canvas image generator
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = 800;
    const height = 800;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    const imageUrl = deal.image ? deal.image.replace('http://', 'https://') : '';
    img.src = imageUrl;

    const drawCanvasOverlay = () => {
      // Bottom gradient
      const bottomGradient = ctx.createLinearGradient(0, height - 200, 0, height);
      bottomGradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
      bottomGradient.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, height - 200, width, 200);

      // Top gradient
      const topGradient = ctx.createLinearGradient(0, 0, 0, 120);
      topGradient.addColorStop(0, 'rgba(15, 23, 42, 0.8)');
      topGradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, width, 120);

      // Warehouse badge top-left
      if (deal.warehouse) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(25, 25, 220, 44, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Raktar: ${deal.warehouse}`, 135, 53);
      }

      // Source badge top-right
      if (deal.source) {
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.roundRect(width - 200, 25, 175, 44, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(deal.source, width - 112, 53);
      }

      // Price bar bottom
      const priceText = deal.price ? (deal.price.includes('Ft') || deal.price.includes('$') || deal.price.includes('EUR') ? deal.price : `${deal.price} Ft`) : '';
      if (priceText) {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(25, height - 120, width - 50, 95, 14);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#00f0ff';
        ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Kuponos Ar: ${priceText}`, 45, height - 60);

        if (deal.code) {
          ctx.fillStyle = '#ffb703';
          ctx.beginPath();
          ctx.roundRect(width - 300, height - 105, 260, 65, 12);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.font = '800 14px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('KUPONKOD:', width - 170, height - 75);
          ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(deal.code, width - 170, height - 48);
        }
      }
    };

    img.onload = () => {
      const scale = Math.max(width / img.width, height / img.height);
      const x = (width / 2) - (img.width / 2) * scale;
      const y = (height / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      drawCanvasOverlay();
    };

    img.onerror = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(deal.name || 'Termekkep', width / 2, height / 2);
      drawCanvasOverlay();
    };
  }, [deal]);

  const handleCopyPost = () => {
    navigator.clipboard.writeText(postText);
    setCopyPostSuccess(true);
    setTimeout(() => setCopyPostSuccess(false), 2000);
  };

  const handleCopyComment = () => {
    navigator.clipboard.writeText(commentText);
    setCopyCommentSuccess(true);
    setTimeout(() => setCopyCommentSuccess(false), 2000);
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `fb-poszt-${(deal.code || 'termek').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopyImageToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          const item = new window.ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setCopyImageSuccess(true);
          setTimeout(() => setCopyImageSuccess(false), 2000);
        } else {
          handleDownloadImage();
        }
      });
    } catch (err) {
      handleDownloadImage();
    }
  };

  return (
    <div className="deal-studio-container">
      <div className="studio-header">
        <h2>Facebook Poszt & Komment Generalo Studio</h2>
        <p>Valassz terméket boltonkent szurve, majd masold ki a posztszoveget, az elso kommentet es a kepet!</p>
      </div>

      {/* Product Picker with Store Filter Tabs */}
      {availableCoupons.length > 0 && (
        <div className="studio-picker-section">
          <h3>Termek kivalasztasa ({filteredCoupons.length} db)</h3>

          {/* Store filter pills */}
          <div className="tabs-scroll-wrapper" style={{marginTop: '0.75rem'}}>
            <div className="tabs-container">
              {STORE_FILTERS.map(f => (
                <button
                  key={f.label}
                  className={`tab-pill ${f.label === storeFilter ? 'active' : ''}`}
                  onClick={() => setStoreFilter(f.label)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search within filtered */}
          <div className="search-wrapper" style={{marginTop: '0.75rem'}}>
            <input
              type="text"
              placeholder="Kereses termeknevre vagy kuponkodra..."
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className="mac-input"
            />
            {pickerSearch && (
              <span className="clear-icon" onClick={() => setPickerSearch('')}>x</span>
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
              <div style={{padding: '1.5rem', textAlign: 'center', color: 'var(--mac-text-muted)'}}>
                Nincs talalat a megadott szurokkel.
              </div>
            )}
          </div>

          {pickerPage < filteredCoupons.length && (
            <button
              className="btn-mac btn-mac-secondary"
              style={{width: '100%', marginTop: '0.75rem'}}
              onClick={() => setPickerPage(p => p + 20)}
            >
              Tovabbiak betoltese ({filteredCoupons.length - pickerPage} maradt)
            </button>
          )}
        </div>
      )}

      {/* Editor + Image Generator */}
      <div className="studio-layout" id="studio-editor">
        {/* Left column: Text editor */}
        <div className="studio-panel">
          <h3>FB Poszt & Elso Komment Adatok</h3>

          <div className="form-group">
            <label className="form-label">Termek Neve:</label>
            <input
              type="text"
              className="mac-input"
              value={deal.name || ''}
              onChange={e => setDeal({...deal, name: e.target.value})}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kuponos Ar:</label>
              <input
                type="text"
                className="mac-input"
                value={deal.price || ''}
                onChange={e => setDeal({...deal, price: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Kuponkod:</label>
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
              <label className="form-label">Raktar:</label>
              <input
                type="text"
                className="mac-input"
                value={deal.warehouse || ''}
                onChange={e => setDeal({...deal, warehouse: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bolt:</label>
              <input
                type="text"
                className="mac-input"
                value={deal.source || ''}
                onChange={e => setDeal({...deal, source: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vasarlasi Link (Elso kommentbe):</label>
            <input
              type="text"
              className="mac-input"
              value={deal.link || ''}
              onChange={e => setDeal({...deal, link: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kep URL (A oszlopbol automatikusan):</label>
            <input
              type="text"
              className="mac-input"
              value={deal.image || ''}
              onChange={e => setDeal({...deal, image: e.target.value})}
            />
          </div>

          {/* Post text area */}
          <div className="form-group" style={{marginTop: '1.25rem'}}>
            <label className="form-label">Fo Facebook Posztszoveg (Kep melle):</label>
            <textarea
              className="mac-input"
              value={postText}
              readOnly
              rows={6}
              style={{resize: 'none'}}
            />
            <button
              className={`btn-mac ${copyPostSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyPost}
              style={{width: '100%', marginTop: '0.5rem'}}
            >
              {copyPostSuccess ? '[OK] Fo Posztszoveg Masolva!' : 'Fo Posztszoveg Masolasa'}
            </button>
          </div>

          {/* First comment area */}
          <div className="form-group" style={{marginTop: '1.25rem'}}>
            <label className="form-label">Elso Komment Szovege (Kozvetlen Vasarlasi Link):</label>
            <textarea
              className="mac-input"
              value={commentText}
              readOnly
              rows={3}
              style={{resize: 'none'}}
            />
            <button
              className={`btn-mac ${copyCommentSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyComment}
              style={{width: '100%', marginTop: '0.5rem'}}
            >
              {copyCommentSuccess ? '[OK] Elso Komment Masolva!' : 'Elso Komment Masolasa'}
            </button>
          </div>
        </div>

        {/* Right column: Image generator */}
        <div className="studio-panel">
          <h3>Posztolhato Termekkep</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--mac-text-muted)'}}>
            A kep automatikusan az A oszlopbol (image) toltodik be. Toltsd le vagy masold!
          </p>

          <div className="canvas-preview-container" style={{marginTop: '1rem'}}>
            <canvas ref={canvasRef} />
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem'}}>
            <button
              className={`btn-mac ${copyImageSuccess ? 'btn-mac-primary' : 'btn-mac-secondary'}`}
              onClick={handleCopyImageToClipboard}
            >
              {copyImageSuccess ? '[OK] Kep Masolva Vagolapra!' : 'Kep Masolasa Vagolapra'}
            </button>

            <button
              className="btn-mac btn-mac-secondary"
              onClick={handleDownloadImage}
            >
              Kep Letoltese HD PNG-ben
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealStudio;
