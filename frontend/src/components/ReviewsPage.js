import React, { useState, useEffect } from 'react';

const INITIAL_REVIEWS = [
  {
    id: '1',
    title: 'Xiaomi Smart Band 8 Pro Teszt & Unboxing',
    category: 'Okosóra & Aktivitásmérő',
    image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=800&q=80',
    description: 'Kicsomagoltuk és 2 hétig teszteltük a Xiaomi legújabb AMOLED kijelzős okoskarkötőjét. A GPS pontossága kiváló, az akkumulátor üzemidő pedig valóban eléri a 14 napot.',
    link: 'https://www.banggood.com',
    code: 'BGXMBAND8',
    price: '18 900 Ft',
    date: '2026-08-01'
  },
  {
    id: '2',
    title: 'BlitzWolf BW-V5 Max Projektor Teszt',
    category: 'Házimozi & Projektorok',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80',
    description: 'Valódi 1080p Full HD felbontás Android TV rendszerrel. Kipróbáltuk sötétített szobában és nappali fénynél is. Ennyi pénzért elképesztő képminőséget nyújt.',
    link: 'https://www.banggood.com',
    code: 'BGV5MAX',
    price: '34 500 Ft',
    date: '2026-07-28'
  }
];

const ReviewsPage = ({ isAdmin }) => {
  const [reviews, setReviews] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
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
    const saved = localStorage.getItem('kinabolveddmeg_reviews');
    if (saved) {
      try {
        setReviews(JSON.parse(saved));
      } catch (e) {
        setReviews(INITIAL_REVIEWS);
      }
    } else {
      setReviews(INITIAL_REVIEWS);
    }
  }, []);

  const saveReviews = (updated) => {
    setReviews(updated);
    localStorage.setItem('kinabolveddmeg_reviews', JSON.stringify(updated));
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

  return (
    <div className="reviews-page">
      <div className="reviews-header-banner">
        <h2>Tesztek és unboxing anyagok</h2>
        <p>Saját tapasztalatok, tesztek és kicsomagoló leírások a KÍNÁBÓL VEDD MEG csapatától.</p>

        {isAdmin && (
          <button
            type="button"
            className="btn-mac btn-mac-primary mt-16"
            onClick={() => setIsFormOpen(true)}
          >
            Új teszt / unboxing hozzáadása
          </button>
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
