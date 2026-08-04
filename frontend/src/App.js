import React, { useEffect, useState } from 'react';
import './Coupons.css';
import CouponGrid from './components/CouponGrid';
import DealStudio from './components/DealStudio';

const DarkModeToggle = () => {
  const [darkMode, setDarkMode] = useState(true);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.body.classList.toggle('light-mode', darkMode);
    localStorage.setItem('darkMode', !darkMode ? 'enabled' : 'disabled');
  };

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'disabled') {
      setDarkMode(false);
      document.body.classList.add('light-mode');
    }
  }, []);

  return (
    <button onClick={toggleDarkMode} className="dark-mode-toggle">
      {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
    </button>
  );
};

// Fallback biztonsági mintaadatok ha az API lassú vagy nem elérhető
const mockFallbackCoupons = [
  {
    name: 'Xiaomi Mi Smart Air Fryer 3.5L Okos Forrólevegős Sütő',
    price: '18990',
    originalPrice: '28990',
    code: 'BGXIAOMI35',
    link: 'https://www.banggood.com/custlink/353490',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=600&q=80',
    warehouse: 'CZ Raktár',
    source: 'BG Unique',
    endTime: '2026-08-31'
  },
  {
    name: 'NEXTOOL 16 in 1 Kompakt Multi-Tool Szerszám Fogó',
    price: '6490',
    originalPrice: '12990',
    code: 'BGTOOL16',
    link: 'https://www.banggood.com/custlink/nextool16',
    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    warehouse: 'HK Raktár',
    source: 'BG Unique HUN',
    endTime: '2026-08-25'
  },
  {
    name: 'Engwe EP-2 Pro 750W Összecsukható Elektromos Kerékpár',
    price: '289900',
    originalPrice: '389900',
    code: 'GKBEP2PRO',
    link: 'https://www.geekbuying.com/item/engwe-ep2pro',
    image: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=600&q=80',
    warehouse: 'PL Raktár',
    source: 'Geekbuying Unique',
    endTime: '2026-08-30'
  },
  {
    name: 'Teclast P30T 10.1 hüvelykes Android 14 Tablet 128GB',
    price: '32990',
    originalPrice: '45990',
    code: 'BGTECLASTP30',
    link: 'https://www.banggood.com/custlink/teclastp30',
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80',
    warehouse: 'CZ Raktár',
    source: 'Banggood',
    endTime: '2026-08-28'
  }
];

function App() {
  const [coupons, setCoupons] = useState(mockFallbackCoupons);
  const [activeTab, setActiveTab] = useState('coupons'); // 'coupons' | 'studio' | 'feeds'
  const [activeSheet, setActiveSheet] = useState('Összes');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDealForStudio, setSelectedDealForStudio] = useState(null);
  const [apiStatus, setApiStatus] = useState({ loading: true, error: null });

  // Adatok betöltése az API végpontokból
  useEffect(() => {
    let isMounted = true;
    
    // Először megpróbáljuk a backend API-t le kérni
    fetch('https://bifc-couponfinder.onrender.com/api/coupons')
      .then(res => {
        if (!res.ok) throw new Error('API válasz hiba');
        return res.json();
      })
      .then(data => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          console.log('Google Sheets API kuponok betöltve:', data.length);
          setCoupons(data);
          setApiStatus({ loading: false, error: null });
        }
      })
      .catch(err => {
        console.warn('API lekérési hiba, biztonsági adatok használata:', err.message);
        if (isMounted) {
          setApiStatus({ loading: false, error: 'Saját API offline, mintaadatok betöltve.' });
        }
      });

    return () => { isMounted = false; };
  }, []);

  const handleSendToStudio = (coupon) => {
    setSelectedDealForStudio(coupon);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="main-header">
        <div className="logo-brand">
          <div className="logo-badge">⚡</div>
          <div>
            <h1 className="brand-title">KÍNÁBÓL VEDD MEG</h1>
            <p className="brand-subtitle">BUYITFROMCHINA - KUPONKERESŐ & DEAL STUDIO</p>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'coupons' ? 'active' : ''}`}
            onClick={() => setActiveTab('coupons')}
          >
            🛒 Kuponkereső ({coupons.length})
          </button>
          <button 
            className={`nav-tab ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            ⚡ Deal Studio & Autoposzt
          </button>
          <button 
            className={`nav-tab ${activeTab === 'feeds' ? 'active' : ''}`}
            onClick={() => setActiveTab('feeds')}
          >
            📊 Live Feeds
          </button>
        </nav>

        <DarkModeToggle />
      </header>

      {/* API Status Notice */}
      {apiStatus.error && (
        <div className="status-banner info">
          <span>ℹ️ {apiStatus.error}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'coupons' && (
          <CouponGrid 
            coupons={coupons}
            activeSheet={activeSheet}
            setActiveSheet={setActiveSheet}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSendToStudio={handleSendToStudio}
          />
        )}

        {activeTab === 'studio' && (
          <DealStudio 
            initialDeal={selectedDealForStudio || (coupons[0] || mockFallbackCoupons[0])}
            availableCoupons={coupons}
            onSelectDeal={(deal) => setSelectedDealForStudio(deal)}
          />
        )}

        {activeTab === 'feeds' && (
          <div className="feeds-container panel">
            <h2>📊 Live Adatforrások & API Státusz</h2>
            <p className="text-muted">A kuponok szinkronizációja folyamatos a Google Sheets és a Banggood API között.</p>
            
            <div className="feeds-grid">
              <div className="feed-card">
                <h3>📊 Google Sheets Sync</h3>
                <p><strong>Sheet ID:</strong> <code>1qw3IXBpWl...</code></p>
                <p><strong>Laptáblák:</strong> BG Unique, BG Unique HUN, BG ALL Coupons, Geekbuying, Geekbuying Unique</p>
                <span className="badge-status online">🟢 Aktív Szinkron</span>
              </div>

              <div className="feed-card">
                <h3>🛒 Banggood Affiliate API</h3>
                <p><strong>API végpont:</strong> <code>https://affapi.banggood.com/coupon/list</code></p>
                <p><strong>Frissítés:</strong> Automatic 15 percenként</p>
                <span className="badge-status online">🟢 API Csatlakoztatva</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="main-footer">
        <p>© 2026 KÍNÁBÓL VEDD MEG - BUYITFROMCHINA OFFICIAL | FB Csoport & Telegram Újjáélesztő Rendszer</p>
      </footer>
    </div>
  );
}

export default App;
