import React, { useState, useEffect } from 'react';
import defaultReviews from '../data/reviews.json';

const ReviewsPage = ({ isAdmin }) => {
  const [reviews, setReviews] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [copyNotice, setCopyNotice] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Elektronika',
    image: '',
    description: '',
    link: '',
    code: '',
    price: ''
  });

  useEffect(() => {
    let isMounted = true;
    
    const loadReviews = async () => {
      let initialData = defaultReviews;
      try {
        const res = await fetch('/reviews.json');
        if (res.ok) {
          const remoteJson = await res.json();
          if (Array.isArray(remoteJson) && remoteJson.length > 0) {
            initialData = remoteJson;
          }
        }
      } catch (e) {
        console.log('Online reviews.json fetch fallback to local static json');
      }

      const saved = localStorage.getItem('kinabolveddmeg_reviews');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (isMounted) setReviews(parsed);
            return;
          }
        } catch (e) {
          console.error('Error parsing localStorage reviews', e);
        }
      }

      if (isMounted) setReviews(initialData);
    };

    loadReviews();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveReviews = (updated) => {
    setReviews(updated);
    try {
      localStorage.setItem('kinabolveddmeg_reviews', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  };

  const handleAddReview = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.description) return;

    const newReview = {
      id: Date.now().toString(),
      title: formData.title,
      category: formData.category || 'Elektronika',
      image: formData.image || 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80',
      description: formData.description,
      link: formData.link || '',
      code: formData.code || '',
      price: formData.price || '',
      date: new Date().toISOString().substring(0, 10)
    };

    const updated = [newReview, ...reviews];
    saveReviews(updated);
    setFormData({ title: '', category: 'Elektronika', image: '', description: '', link: '', code: '', price: '' });
    setIsFormOpen(false);
  };

  const handleDeleteReview = (id) => {
    if (window.confirm('Biztosan törölni szeretnéd ezt a tesztet?')) {
      const updated = reviews.filter(r => r.id !== id);
      saveReviews(updated);
    }
  };

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reviews, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "reviews.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(reviews, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr);
      setCopyNotice(true);
      setTimeout(() => setCopyNotice(false), 2000);
    }
  };

  const handleImportSubmit = (e) => {
    e.preventDefault();
    if (!importJsonText.trim()) return;
    try {
      const parsed = JSON.parse(importJsonText);
      if (Array.isArray(parsed)) {
        saveReviews(parsed);
        setIsImportOpen(false);
        setImportJsonText('');
        alert('Tesztek sikeresen importálva!');
      } else {
        alert('Érvénytelen JSON formátum! A JSON fájlnak egy tömbnek (array) kell lennie.');
      }
    } catch (err) {
      alert('Hibás JSON szintaxis: ' + err.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImportJsonText(evt.target.result);
    };
    reader.readAsText(file);
  };

  return (
    <div className="reviews-page">
      <div className="reviews-header-banner">
        <h2>Tesztek és unboxing anyagok</h2>
        <p>Saját tapasztalatok, tesztek és kicsomagoló leírások a KÍNÁBÓLVEDDMEG csapatától.</p>

        {isAdmin && (
          <div className="admin-review-actions mt-16" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-mac btn-mac-primary"
              onClick={() => setIsFormOpen(true)}
            >
              Új teszt / unboxing hozzáadása
            </button>

            <button
              type="button"
              className="btn-mac btn-mac-secondary"
              onClick={handleDownloadJson}
              title="Letölti a meglévő teszteket reviews.json fájlként"
            >
              reviews.json letöltése
            </button>

            <button
              type="button"
              className="btn-mac btn-mac-secondary"
              onClick={handleCopyJson}
              title="Kimásolja az összes teszt JSON kódját a vágólapra"
            >
              {copyNotice ? 'JSON kimásolva!' : 'JSON másolása'}
            </button>

            <button
              type="button"
              className="btn-mac btn-mac-secondary"
              onClick={() => setIsImportOpen(true)}
              title="JSON adatok importálása vagy beillesztése"
            >
              JSON importálása
            </button>
          </div>
        )}
      </div>

      {isFormOpen && isAdmin && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="admin-modal-card review-form-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Új teszt / unboxing leírás</h3>
              <button type="button" className="modal-close" onClick={() => setIsFormOpen(false)} aria-label="Bezárás">
                &times;
              </button>
            </div>

            <form onSubmit={handleAddReview} className="admin-form">
              <div className="form-group">
                <label>Termék / Teszt Címe *</label>
                <input 
                  type="text" 
                  required 
                  value={formData.title} 
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="pl. Xiaomi Robotporszívó Teszt"
                  className="mac-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Kategória</label>
                  <input 
                    type="text" 
                    value={formData.category} 
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    placeholder="pl. Okosotthon"
                    className="mac-input"
                  />
                </div>

                <div className="form-group">
                  <label>Kép URL (GitHub / Web link)</label>
                  <input 
                    type="url" 
                    value={formData.image} 
                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                    placeholder="https://raw.githubusercontent.com/..."
                    className="mac-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Teszt és Unboxing Leírás *</label>
                <textarea 
                  rows="4" 
                  required
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Írd le a tapasztalatokat, előnyöket, hátrányokat..."
                  className="mac-input"
                ></textarea>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Termék Vásárlási Link</label>
                  <input 
                    type="url" 
                    value={formData.link} 
                    onChange={e => setFormData({ ...formData, link: e.target.value })}
                    placeholder="https://..."
                    className="mac-input"
                  />
                </div>

                <div className="form-group">
                  <label>Kuponkód</label>
                  <input 
                    type="text" 
                    value={formData.code} 
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="pl. BG12345"
                    className="mac-input"
                  />
                </div>

                <div className="form-group">
                  <label>Akciós Ár</label>
                  <input 
                    type="text" 
                    value={formData.price} 
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    placeholder="pl. 24 500 Ft vagy 65 EUR"
                    className="mac-input"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-mac btn-mac-secondary" onClick={() => setIsFormOpen(false)}>
                  Mégse
                </button>
                <button type="submit" className="btn-mac btn-mac-primary">
                  Teszt Mentése
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && isAdmin && (
        <div className="modal-overlay" onClick={() => setIsImportOpen(false)}>
          <div className="admin-modal-card review-form-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>JSON Tesztek Importálása</h3>
              <button type="button" className="modal-close" onClick={() => setIsImportOpen(false)} aria-label="Bezárás">
                &times;
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="admin-form">
              <div className="form-group">
                <label>Fájl kiválasztása (reviews.json)</label>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileUpload}
                  className="mac-input"
                />
              </div>

              <div className="form-group">
                <label>Vagy illeszd be a JSON tartalmat közvetlenül:</label>
                <textarea 
                  rows="8" 
                  value={importJsonText} 
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder='[ { "id": "1", "title": "...", ... } ]'
                  className="mac-input"
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                ></textarea>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-mac btn-mac-secondary" onClick={() => setIsImportOpen(false)}>
                  Mégse
                </button>
                <button type="submit" className="btn-mac btn-mac-primary">
                  Importálás és mentés
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="reviews-grid">
        {reviews.length === 0 && (
          <div className="empty-state">
            <h4>Még nincs feltöltött teszt</h4>
            <p>Amint elkészül az első unboxing vagy termékteszt, itt fog megjelenni.</p>
          </div>
        )}

        {reviews.map(review => (
          <div key={review.id} className="review-card">
            <div className="review-image-wrapper">
              <img src={review.image} alt={review.title} className="review-image" loading="lazy" />
              <span className="badge-category">{review.category}</span>
              {isAdmin && (
                <button
                  type="button"
                  className="btn-delete-review"
                  onClick={() => handleDeleteReview(review.id)}
                  title="Törlés"
                  aria-label="Teszt törlése"
                >
                  &times;
                </button>
              )}
            </div>

            <div className="review-content">
              <span className="review-date">{review.date}</span>
              <h3 className="review-title">{review.title}</h3>
              <p className="review-desc">{review.description}</p>

              <div className="review-meta-box">
                {review.code && (
                  <div className="review-meta-item">
                    <span className="meta-label">Kuponkód:</span>
                    <span className="meta-val code">{review.code}</span>
                  </div>
                )}
                {review.price && (
                  <div className="review-meta-item">
                    <span className="meta-label">Ár:</span>
                    <span className="meta-val price">{review.price}</span>
                  </div>
                )}
              </div>

              {review.link && (
                <a href={review.link} target="_blank" rel="noopener noreferrer" className="btn-mac btn-mac-primary full-width">
                  Megnézem a webáruházban
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReviewsPage;

