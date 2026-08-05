/* eslint-disable jsx-a11y/accessible-emoji */
import React, { useState, useEffect, useRef } from 'react';

const PostTemplates = {
  CASUAL_HYPE: `🔥 BOMBISZTIKUS AKCIÓ! {{title}} 🔥

Magyarországon az Árukereső szerint: {{arukeresoPrice}} 😱
Nálunk KUPONNAL csak: {{newPrice}}! 
💰 TISZTA SPÓROLÁS: {{savingHuf}} (-{{discountPercent}}% olcsóbb mint itthon!)

🎟️ Kuponkód: {{couponCode}}
🏬 Bolt: {{storeName}} | {{warehouseName}}

👉 RENDELD MEG ITT KUPONOS ÁRON ➡️ {{affiliateUrl}}

#kinabolveddmeg #akció #kupon #arukereso #{{categorySlug}}`,

  URGENT_LIMITED: `⚡ VILLÁMAKCIÓ - LIMITÁLT DARABSZÁM! ⚡
{{title}}

🇪🇺 {{warehouseName}} - Nincs vám, nincs extra ÁFA!

🛒 Magyar bolti ár (Árukereső): {{arukeresoPrice}}
📉 KÍNÁBÓL VEDD MEG KUPONOS ÁR: {{newPrice}}
🔥 MEGSPÓROLSZ: {{savingHuf}}-ot!

🔑 Kuponkód: {{couponCode}}

👇 Kattints a vásárláshoz a kuponos árért 👇
🔗 {{affiliateUrl}}`,

  REVIEW_STYLE: `📌 KÍNÁBÓL VEDD MEG TESZT & ÁR-ÖSSZEHASONLÍTÁS 📌

Miért fizetnél többet itthon? A(z) {{title}} itthon az Árukeresőn {{arukeresoPrice}}!

✨ Mi a helyzet nálunk?
- Rendelés közvetlenül a gyártótól / hivatalos boltból
- {{warehouseName}} szállítás
- Tisztán megmarad a zsebedben: {{savingHuf}}!

🏷️ Kuponkód: {{couponCode}}
🔥 Akciós Ár: {{newPrice}}

🛒 Vásárlási link ➡️ {{affiliateUrl}}`
};

export function generatePostText(deal, templateKey = 'CASUAL_HYPE') {
  let template = PostTemplates[templateKey] || PostTemplates.CASUAL_HYPE;

  const categorySlug = (deal.categories || deal.source || 'akció').toLowerCase().replace(/\s+/g, '');
  
  const discountPriceNum = parseFloat(deal.price) || 0;
  const originalPriceNum = parseFloat(deal.originalPrice) || (discountPriceNum ? discountPriceNum * 1.4 : 0);
  const arukeresoPriceNum = parseFloat(deal.arukeresoPrice) || (originalPriceNum ? originalPriceNum * 1.25 : discountPriceNum * 1.5);
  
  const isUsd = typeof deal.price === 'string' && (deal.price.includes('$') || !deal.price.includes('Ft'));
  const currencySuffix = isUsd ? ' USD' : ' Ft';

  const newPriceFormatted = discountPriceNum > 0 ? `${discountPriceNum.toLocaleString('hu-HU')}${currencySuffix}` : (deal.price || 'Akciós Ár');
  const arukeresoPriceFormatted = arukeresoPriceNum > 0 ? `${Math.round(arukeresoPriceNum).toLocaleString('hu-HU')}${currencySuffix}` : '35 000 Ft';

  const savingHufNum = arukeresoPriceNum > discountPriceNum ? (arukeresoPriceNum - discountPriceNum) : 0;
  const savingHufFormatted = savingHufNum > 0 ? `${Math.round(savingHufNum).toLocaleString('hu-HU')}${currencySuffix}` : 'Több ezer Ft';
  
  const discountPercentCalculated = arukeresoPriceNum > 0 && discountPriceNum > 0
    ? Math.round(((arukeresoPriceNum - discountPriceNum) / arukeresoPriceNum) * 100)
    : 35;

  const warehouse = deal.warehouse ? `📦 Raktár: ${deal.warehouse}` : '🇪🇺 EU Raktár';

  return template
    .replace(/{{title}}/g, deal.name || deal.title || '')
    .replace(/{{newPrice}}/g, newPriceFormatted)
    .replace(/{{oldPrice}}/g, `${originalPriceNum.toLocaleString('hu-HU')}${currencySuffix}`)
    .replace(/{{arukeresoPrice}}/g, arukeresoPriceFormatted)
    .replace(/{{savingHuf}}/g, savingHufFormatted)
    .replace(/{{couponCode}}/g, deal.code || 'Nincs kuponkód (automatikus ár)')
    .replace(/{{storeName}}/g, deal.source || 'Banggood')
    .replace(/{{warehouseName}}/g, warehouse)
    .replace(/{{affiliateUrl}}/g, deal.link || '')
    .replace(/{{discountPercent}}/g, discountPercentCalculated)
    .replace(/{{categorySlug}}/g, categorySlug);
}

const DealStudio = ({ initialDeal, availableCoupons = [], onSelectDeal }) => {
  const [deal, setDeal] = useState({
    name: 'Xiaomi Mi Smart Air Fryer 3.5L Okos Sütő',
    price: '18990',
    originalPrice: '28990',
    arukeresoPrice: '34990',
    code: 'BGXIAOMI35',
    link: 'https://www.banggood.com/custlink/353490',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=600&q=80',
    warehouse: 'CZ Raktár (Csehország)',
    source: 'Banggood',
    discount: '45%'
  });

  const [selectedTemplate, setSelectedTemplate] = useState('CASUAL_HYPE');
  const [generatedPostText, setGeneratedPostText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSearchingArukereso, setIsSearchingArukereso] = useState(false);
  const [arukeresoSearchUrl, setArukeresoSearchUrl] = useState('');

  const canvasRef = useRef(null);

  useEffect(() => {
    if (initialDeal && initialDeal.name) {
      const defaultArukereso = initialDeal.arukeresoPrice || (parseFloat(initialDeal.price) ? Math.round(parseFloat(initialDeal.price) * 1.5).toString() : '34990');
      setDeal(prev => ({
        ...prev,
        ...initialDeal,
        arukeresoPrice: defaultArukereso
      }));
      setArukeresoSearchUrl(`https://www.arukereso.hu/CategorySearch.php?st=${encodeURIComponent(initialDeal.name)}`);
    }
  }, [initialDeal]);

  // Posztszöveg újragenerálása
  useEffect(() => {
    const text = generatePostText(deal, selectedTemplate);
    setGeneratedPostText(text);
  }, [deal, selectedTemplate]);

  // Automatikus Árukereső keresés API hívás
  const handleAutoFetchArukereso = async () => {
    if (!deal.name) return;
    setIsSearchingArukereso(true);

    const cleanQuery = deal.name.replace(/global version/gi, '').replace(/eu plug/gi, '').trim();
    const directUrl = `https://www.arukereso.hu/CategorySearch.php?st=${encodeURIComponent(cleanQuery)}`;
    setArukeresoSearchUrl(directUrl);

    try {
      const res = await fetch(`https://bifc-couponfinder.onrender.com/api/arukereso-search?q=${encodeURIComponent(cleanQuery)}`);
      const data = await res.json();

      if (data && data.foundPrice) {
        setDeal(prev => ({
          ...prev,
          arukeresoPrice: data.foundPrice.toString()
        }));
      } else {
        // Fallback: Ha az API nem talált közvetlen árat, a kuponos ár 1.5x-ét vagy megnyitási opciót adunk
        if (parseFloat(deal.price)) {
          setDeal(prev => ({
            ...prev,
            arukeresoPrice: Math.round(parseFloat(deal.price) * 1.5).toString()
          }));
        }
      }
    } catch (err) {
      console.warn('Árukereső API elérése nem sikerült, manuális ellenőrzési hivatkozás használata.', err);
    } finally {
      setIsSearchingArukereso(false);
    }
  };

  // Canvas Banner Renderelése
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = 800;
    const height = 800;
    canvas.width = width;
    canvas.height = height;

    // Háttér
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = deal.image ? deal.image.replace('http://', 'https://') : '';

    const drawOverlay = () => {
      // Top Gradient
      const topGradient = ctx.createLinearGradient(0, 0, 0, 180);
      topGradient.addColorStop(0, 'rgba(15, 23, 42, 0.85)');
      topGradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, width, 180);

      // Bottom Gradient
      const bottomGradient = ctx.createLinearGradient(0, height - 260, 0, height);
      bottomGradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
      bottomGradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, height - 260, width, 260);

      // Top Right: Store Badge
      const storeName = deal.source || 'Banggood';
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.roundRect(width - 220, 25, 195, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(storeName, width - 122, 57);

      // Top Left: Warehouse Badge
      const warehouseText = deal.warehouse ? `📦 ${deal.warehouse}` : '🇪🇺 EU Raktár';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.beginPath();
      ctx.roundRect(25, 25, 240, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(warehouseText, 145, 56);

      // Discount Percentage Badge
      const discountPercentNum = deal.arukeresoPrice && deal.price 
        ? Math.round(((parseFloat(deal.arukeresoPrice) - parseFloat(deal.price)) / parseFloat(deal.arukeresoPrice)) * 100) 
        : 40;
      const discountText = `-${discountPercentNum > 0 ? discountPercentNum : 40}% OLCSÓBB!`;
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(25, height - 230, 260, 60, 16);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(discountText, 155, height - 192);

      // Domestic Price Comparison Box
      ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(25, height - 150, width - 50, 125, 16);
      ctx.fill();
      ctx.stroke();

      // Domestic price cross out
      const arukeresoVal = deal.arukeresoPrice ? `${parseInt(deal.arukeresoPrice).toLocaleString('hu-HU')} Ft` : '34 990 Ft';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Árukereső ár: ${arukeresoVal}`, 45, height - 105);

      // Red strikethrough line
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(170, height - 112);
      ctx.lineTo(340, height - 112);
      ctx.stroke();

      // KÍNÁBÓL VEDD MEG Price
      const dealPriceVal = deal.price ? `${parseInt(deal.price).toLocaleString('hu-HU')} Ft` : '18 990 Ft';
      ctx.fillStyle = '#00f0ff';
      ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`Kuponos ár: ${dealPriceVal}`, 45, height - 55);

      // Coupon Code Box (Right Side)
      if (deal.code) {
        ctx.fillStyle = '#ffb703';
        ctx.beginPath();
        ctx.roundRect(width - 320, height - 125, 285, 75, 14);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KUPONKÓD:', width - 177, height - 95);
        ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(deal.code, width - 177, height - 63);
      }

      // Watermark Branding
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('⚡ KÍNÁBÓL VEDD MEG OFFICIAL', width - 35, height - 15);
    };

    img.onload = () => {
      const scale = Math.max(width / img.width, height / img.height);
      const x = (width / 2) - (img.width / 2) * scale;
      const y = (height / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      drawOverlay();
    };

    img.onerror = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(deal.name || 'Termékkép betöltése...', width / 2, height / 2);
      drawOverlay();
    };
  }, [deal]);

  const handleCopyPost = () => {
    navigator.clipboard.writeText(generatedPostText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const handleDownloadBanner = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `deal-banner-${(deal.code || 'coupon').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="deal-studio-container">
      <div className="studio-header">
        <h2>⚡ Deal Studio & Autoposzt Generáló</h2>
        <p>Válassz kuponos ajánlatot a táblázatból, ellenőrizd az árat az Árukeresőn, generálj posztszöveget és tölts le profi reklámbannert 1 kattintással!</p>
      </div>

      <div className="studio-layout">
        {/* Bal oldali oszlop: Form & Adatok */}
        <div className="studio-panel">
          <h3>📦 1. Kijelölt Ajánlat & Árukereső Ár Szerkesztése</h3>
          
          {availableCoupons.length > 0 && (
            <div className="form-group">
              <label className="form-label">Gyorsválasztó a beolvasott kuponokból:</label>

              <select 
                className="form-select"
                onChange={(e) => {
                  const selectedIdx = parseInt(e.target.value);
                  if (availableCoupons[selectedIdx]) {
                    const c = availableCoupons[selectedIdx];
                    setDeal(prev => ({
                      ...prev,
                      ...c,
                      arukeresoPrice: Math.round(parseFloat(c.price || 20000) * 1.5).toString()
                    }));
                    setArukeresoSearchUrl(`https://www.arukereso.hu/CategorySearch.php?st=${encodeURIComponent(c.name)}`);
                  }
                }}
              >
                <option value="">-- Válassz egy kupont a listából ({availableCoupons.length} db) --</option>
                {availableCoupons.slice(0, 50).map((c, i) => (
                  <option key={i} value={i}>
                    {c.source} | {c.name ? c.name.substring(0, 50) : 'Névtelen'} ({c.price} - Code: {c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Termék Neve (FB Poszt & Banner Fejléc):</label>

            <input 
              type="text" 
              className="form-input" 
              value={deal.name || ''} 
              onChange={e => setDeal({...deal, name: e.target.value})}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">📉 Kuponos Ár (Ft):</label>

              <input 
                type="text" 
                className="form-input" 
                value={deal.price || ''} 
                onChange={e => setDeal({...deal, price: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">🛒 Árukereső / Hazai Ár (Ft):</label>

              <div style={{display: 'flex', gap: '0.5rem'}}>
                <input 
                  type="text" 
                  className="form-input" 
                  value={deal.arukeresoPrice || ''} 
                  onChange={e => setDeal({...deal, arukeresoPrice: e.target.value})}
                />
                <button 
                  type="button"
                  className="btn-action btn-primary"
                  style={{padding: '0 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap'}}
                  onClick={handleAutoFetchArukereso}
                  disabled={isSearchingArukereso}
                  title="Automatikus Árukereső Ár Keresés"
                >
                  {isSearchingArukereso ? '⏳ Keresés...' : '🔍 Árukereső Keresés'}
                </button>
              </div>
              
              {arukeresoSearchUrl && (
                <div style={{display: 'flex', gap: '0.8rem', marginTop: '0.4rem', fontSize: '0.78rem'}}>
                  <a 
                    href={arukeresoSearchUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{color: 'var(--accent-cyan)'}}
                  >
                    🔍 Árukereső keresés ↗
                  </a>
                  <a 
                    href={`https://www.argep.hu/main.aspx?suche=${encodeURIComponent(deal.name || '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{color: 'var(--accent-gold)'}}
                  >
                    🏷️ Árgép keresés ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">🔑 Kuponkód:</label>

              <input 
                type="text" 
                className="form-input" 
                value={deal.code || ''} 
                onChange={e => setDeal({...deal, code: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">📦 Raktár (pl. CZ / EU Raktár):</label>

              <input 
                type="text" 
                className="form-input" 
                value={deal.warehouse || ''} 
                onChange={e => setDeal({...deal, warehouse: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">🔗 Vásárlási Affiliate Link:</label>

            <input 
              type="text" 
              className="form-input" 
              value={deal.link || ''} 
              onChange={e => setDeal({...deal, link: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label">🖼️ Termékkép URL:</label>

            <input 
              type="text" 
              className="form-input" 
              value={deal.image || ''} 
              onChange={e => setDeal({...deal, image: e.target.value})}
            />
          </div>

          {/* Poszt Sablon Választó */}
          <div className="form-group" style={{marginTop: '1.5rem'}}>
            <label className="form-label">🔥 Poszt Stílus & Sablon:</label>

            <select 
              className="form-select"
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
            >
              <option value="CASUAL_HYPE">🔥 Bombasztikus Hype (Árukereső spórolás fókusz)</option>
              <option value="URGENT_LIMITED">⚡ Villámakció - Limitált Darabszám</option>
              <option value="REVIEW_STYLE">📌 Teszt & Ár-összehasonlító elemzés</option>
            </select>
          </div>

          {/* Poszt Kimenet & Másolás Gomb */}
          <div className="form-group">
            <label className="form-label">📋 Generált Posztszöveg (FB / Telegram):</label>

            <textarea 
              className="form-textarea post-output" 
              value={generatedPostText} 
              readOnly 
              rows={10}
            />
          </div>

          <button 
            className={`btn-action ${copySuccess ? 'btn-success' : 'btn-primary'}`} 
            onClick={handleCopyPost}
            style={{width: '100%'}}
          >
            {copySuccess ? '✅ Posztszöveg Vágólapra Másolva!' : '📋 Posztszöveg Másolása'}
          </button>
        </div>

        {/* Jobb oldali oszlop: Live Canvas Banner Preview & Download */}
        <div className="studio-panel">
          <h3>🖼️ 2. Automatizált Akciós Banner Kártya</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
            A rendszer automatikusan felhelyezi a kedvezményes ármatricát, a bolti logót, a kuponkódot és a vízjelet a képre.
          </p>

          <div className="canvas-preview-container">
            <canvas ref={canvasRef} />
          </div>

          <div className="btn-group" style={{marginTop: '1.25rem'}}>
            <button className="btn-action btn-secondary" onClick={handleDownloadBanner} style={{width: '100%'}}>
              📥 Banner Letöltése HD PNG Képként
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealStudio;
