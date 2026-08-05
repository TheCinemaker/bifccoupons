import React, { useState, useEffect, useRef } from 'react';

const DealStudio = ({ initialDeal, availableCoupons = [], onSelectDeal }) => {
  const [deal, setDeal] = useState({
    name: 'Xiaomi Mi Smart Air Fryer 3.5L Okos Sütő',
    price: '18990',
    code: 'BGXIAOMI35',
    link: 'https://www.banggood.com/custlink/353490',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=600&q=80',
    warehouse: 'CZ Raktár',
    source: 'Banggood'
  });

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

  // Generálja a posztszöveget és az első kommentet
  useEffect(() => {
    const formattedPrice = deal.price ? (deal.price.includes('Ft') || deal.price.includes('$') ? deal.price : `${deal.price} Ft`) : 'Akciós ár';
    const formattedCode = deal.code ? deal.code : 'Automatikus kedvezmény';
    const formattedWarehouse = deal.warehouse ? deal.warehouse : 'EU Raktár';

    const postBody = `AKCIÓS AJÁNLAT!
Termék: ${deal.name || ''}
Akciós Ár: ${formattedPrice}
Kuponkód: ${formattedCode}
Raktár: ${formattedWarehouse}

A vásárlási linket az első kommentben találod!
#kinabolveddmeg #akció #kupon #${(deal.source || 'akcio').toLowerCase().replace(/\s+/g, '')}`;

    const commentBody = `Vásárlási link a kuponos árhoz:
${deal.link || ''}`;

    setPostText(postBody);
    setCommentText(commentBody);
  }, [deal]);

  // Canvas képrejz (vízjel + ár matrica a fotóra)
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
      // Alsó sötét árnyék
      const bottomGradient = ctx.createLinearGradient(0, height - 200, 0, height);
      bottomGradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
      bottomGradient.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, height - 200, width, 200);

      // Felső sötét sáv
      const topGradient = ctx.createLinearGradient(0, 0, 0, 120);
      topGradient.addColorStop(0, 'rgba(15, 23, 42, 0.8)');
      topGradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, width, 120);

      // Raktár matrica bal fent
      if (deal.warehouse) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(25, 25, 220, 44, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Raktár: ${deal.warehouse}`, 135, 53);
      }

      // Bolt matrica jobb fent
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

      // Ár matrica lent
      const priceText = deal.price ? (deal.price.includes('Ft') || deal.price.includes('$') ? deal.price : `${deal.price} Ft`) : '';
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
        ctx.fillText(`Kuponos Ár: ${priceText}`, 45, height - 60);

        if (deal.code) {
          ctx.fillStyle = '#ffb703';
          ctx.beginPath();
          ctx.roundRect(width - 300, height - 105, 260, 65, 12);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.font = '800 14px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('KUPONKÓD:', width - 170, height - 75);
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
      ctx.fillText(deal.name || 'Termékkép', width / 2, height / 2);
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
        <h2>Facebook Poszt & Komment Generáló Studio</h2>
        <p>Válassz kuponos ajánlatot a táblázatból, másold ki a posztszöveget, az első kommentet és a képet 1 kattintással!</p>
      </div>

      <div className="studio-layout">
        {/* Bal oldali oszlop: Szövegek & Másolók */}
        <div className="studio-panel">
          <h3>1. FB Poszt & Első Komment Adatok</h3>

          {availableCoupons.length > 0 && (
            <div className="form-group">
              <label className="form-label">Termék kiválasztása a táblázatból ({availableCoupons.length} db):</label>
              <select 
                className="form-select"
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  if (availableCoupons[idx]) {
                    setDeal(availableCoupons[idx]);
                  }
                }}
              >
                <option value="">-- Válassz a beolvasott kuponokból --</option>
                {availableCoupons.slice(0, 100).map((c, i) => (
                  <option key={i} value={i}>
                    {c.source} | {c.name ? c.name.substring(0, 55) : 'Névtelen'} ({c.price} - {c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Termék Neve:</label>
            <input 
              type="text" 
              className="form-input" 
              value={deal.name || ''} 
              onChange={e => setDeal({...deal, name: e.target.value})}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kuponos Ár:</label>
              <input 
                type="text" 
                className="form-input" 
                value={deal.price || ''} 
                onChange={e => setDeal({...deal, price: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Kuponkód:</label>
              <input 
                type="text" 
                className="form-input" 
                value={deal.code || ''} 
                onChange={e => setDeal({...deal, code: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Raktár:</label>
              <input 
                type="text" 
                className="form-input" 
                value={deal.warehouse || ''} 
                onChange={e => setDeal({...deal, warehouse: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bolt:</label>
              <input 
                type="text" 
                className="form-input" 
                value={deal.source || ''} 
                onChange={e => setDeal({...deal, source: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vásárlási Link (Első kommentbe):</label>
            <input 
              type="text" 
              className="form-input" 
              value={deal.link || ''} 
              onChange={e => setDeal({...deal, link: e.target.value})}
            />
          </div>

          {/* Fő Posztszöveg Terület */}
          <div className="form-group" style={{marginTop: '1.25rem'}}>
            <label className="form-label">Fő Facebook Posztszöveg (Kép mellé):</label>
            <textarea 
              className="form-textarea post-output" 
              value={postText} 
              readOnly 
              rows={6}
            />
            <button 
              className={`btn-action ${copyPostSuccess ? 'btn-success' : 'btn-primary'}`} 
              onClick={handleCopyPost}
              style={{width: '100%', marginTop: '0.5rem'}}
            >
              {copyPostSuccess ? '[OK] Fő Posztszöveg Másolva!' : 'Fő Posztszöveg Másolása'}
            </button>
          </div>

          {/* Első Komment Terület */}
          <div className="form-group" style={{marginTop: '1.25rem'}}>
            <label className="form-label">Első Komment Szövege (Közvetlen Vásárlási Link):</label>
            <textarea 
              className="form-textarea post-output" 
              value={commentText} 
              readOnly 
              rows={3}
            />
            <button 
              className={`btn-action ${copyCommentSuccess ? 'btn-success' : 'btn-secondary'}`} 
              onClick={handleCopyComment}
              style={{width: '100%', marginTop: '0.5rem'}}
            >
              {copyCommentSuccess ? '[OK] Első Komment Másolva!' : 'Első Komment Másolása'}
            </button>
          </div>
        </div>

        {/* Jobb oldali oszlop: Kép Másolás & Letöltés */}
        <div className="studio-panel">
          <h3>2. Posztolható Termékkép</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
            Töltsd le vagy másold a képet, és csatold a Facebook poszthoz a maximális elérésért!
          </p>

          <div className="canvas-preview-container" style={{marginTop: '1rem'}}>
            <canvas ref={canvasRef} />
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem'}}>
            <button 
              className={`btn-action ${copyImageSuccess ? 'btn-success' : 'btn-primary'}`} 
              onClick={handleCopyImageToClipboard}
            >
              {copyImageSuccess ? '[OK] Kép Másolva Vágólapra!' : 'Kép Másolása Vágólapra'}
            </button>

            <button 
              className="btn-action btn-secondary" 
              onClick={handleDownloadImage}
            >
              Kép Letöltése HD PNG-ben
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealStudio;
