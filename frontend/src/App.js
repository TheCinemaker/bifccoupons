/* eslint-disable jsx-a11y/accessible-emoji */
import React, { useEffect, useState } from 'react';
import './Coupons.css';
import CouponGrid from './components/CouponGrid';
import DealStudio from './components/DealStudio';
import ReviewsPage from './components/ReviewsPage';
import AdminModal from './components/AdminModal';

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
    <button onClick={toggleDarkMode} className="btn-mac btn-mac-secondary dark-toggle-btn">
      {darkMode ? 'Világos mód' : 'Sötét mód'}
    </button>
  );
};

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const SHEET_NAMES = ['BG Unique', 'BG Unique HUN', 'BANGGOODAPI', 'ALIEXPRESSAPI', 'Geekbuying', 'Geekbuying Unique'];

async function fetchLiveGoogleSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const json = JSON.parse(jsonString);

  if (!json.table || !json.table.rows) return [];

  const cols = json.table.cols || [];
  const findColIndex = (keyWords, defaultIdx) => {
    const idx = cols.findIndex(col => {
      if (!col || !col.label) return false;
      const label = col.label.toLowerCase().trim();
      return keyWords.some(kw => label.includes(kw));
    });
    return idx !== -1 ? idx : defaultIdx;
  };

  const is9ColSchema = cols.length === 9 || (cols[2] && cols[2].label && cols[2].label.toLowerCase().includes('link'));

  const imgIdx = findColIndex(['image', 'kép', 'fotó'], 0);
  const nameIdx = findColIndex(['product name', 'name', 'név', 'termék'], 1);
  const linkIdx = findColIndex(['shortlink', 'link', 'url'], is9ColSchema ? 2 : 3);
  const priceIdx = findColIndex(['coupon price', 'price', 'akciós ár', 'akcios ar', 'kupon ár', 'kupon ar', 'ár', 'ar'], is9ColSchema ? 3 : 6);
  const codeIdx = findColIndex(['coupon code', 'code', 'kupon'], is9ColSchema ? 4 : 7);
  const warehouseIdx = findColIndex(['warehouse', 'raktár'], is9ColSchema ? 5 : 9);
  const endTimeIdx = findColIndex(['end time', 'endtime', 'lejárat'], is9ColSchema ? 6 : 12);
  const updateTimeIdx = findColIndex(['update time', 'updatetime', 'frissítés'], is9ColSchema ? 7 : 13);
  const shortlinkIdx = findColIndex(['shortlink'], is9ColSchema ? 8 : (is9ColSchema ? 2 : 3));

  const getCellStr = (cell) => {
    if (!cell) return '';
    if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
    if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
    return '';
  };

  return json.table.rows.map(row => {
    const c = row.c || [];
    const rawImage = getCellStr(c[imgIdx]);
    const name = getCellStr(c[nameIdx]);
    const link = getCellStr(c[linkIdx]);
    const price = getCellStr(c[priceIdx]);
    const code = getCellStr(c[codeIdx]);
    const warehouse = getCellStr(c[warehouseIdx]);
    const endTime = getCellStr(c[endTimeIdx]);
    const updateTime = getCellStr(c[updateTimeIdx]);
    const shortlink = getCellStr(c[shortlinkIdx]);

    return {
      image: rawImage,
      name: name,
      link: link,
      price: price,
      code: code,
      warehouse: warehouse,
      endTime: endTime,
      updateTime: updateTime,
      shortlink: shortlink,
      source: sheetName
    };
  }).filter(item => item.name && item.link);
}

function App() {
  const [coupons, setCoupons] = useState([]);
  const [activeTab, setActiveTab] = useState('coupons');
  const [activeSheet, setActiveSheet] = useState('Összes');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDealForStudio, setSelectedDealForStudio] = useState(null);
  const [apiStatus, setApiStatus] = useState({ loading: true, error: null });

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    let isMounted = true;
    
    async function loadAllLiveSheets() {
      try {
        setApiStatus({ loading: true, error: null });

        const sheetPromises = SHEET_NAMES.map(name => fetchLiveGoogleSheet(name));
        const results = await Promise.allSettled(sheetPromises);

        let allLiveCoupons = [];
        results.forEach(res => {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            allLiveCoupons = allLiveCoupons.concat(res.value);
          }
        });

        if (isMounted) {
          if (allLiveCoupons.length > 0) {
            setCoupons(allLiveCoupons);
            setApiStatus({ loading: false, error: null });
          } else {
            setApiStatus({ loading: false, error: 'A Google Sheets táblázat elérhető, de nincs érvényes sor.' });
          }
        }
      } catch (err) {
        console.error('Kuponok betöltési hibája:', err);
        if (isMounted) {
          setApiStatus({ loading: false, error: 'Nem sikerült az élő kuponok letöltése a Google Sheets-ből.' });
        }
      }
    }

    loadAllLiveSheets();

    return () => { isMounted = false; };
  }, []);

  const handleSendToStudio = (coupon) => {
    setSelectedDealForStudio(coupon);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminClick = () => {
    if (isAdmin) {
      setIsAdmin(false);
      if (activeTab === 'studio' || activeTab === 'feeds') {
        setActiveTab('coupons');
      }
    } else {
      setIsAdminModalOpen(true);
    }
  };

  const handleAdminSuccess = () => {
    setIsAdmin(true);
    setIsAdminModalOpen(false);
  };

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-top-row">
          <div className="logo-brand">
            <div>
              <h1 className="brand-title">KINABOLVEDDMEG</h1>
              <p className="brand-subtitle">BUYITFROMCHINA - PREMIUMLISZTALT KUPONOK ES AKCIOK</p>
            </div>
          </div>

          <div className="header-right-controls">
            <DarkModeToggle />
            <button
              className={`hamburger-btn ${mobileMenuOpen ? 'is-open' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
            </button>
          </div>
        </div>

        <nav className={`nav-tabs ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <button 
            className={`nav-tab ${activeTab === 'coupons' ? 'active' : ''}`}
            onClick={() => switchTab('coupons')}
          >
            Kinalat ({coupons.length})
          </button>
          
          <button 
            className={`nav-tab ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => switchTab('reviews')}
          >
            Tesztek & Unboxing
          </button>

          {isAdmin && (
            <>
              <button 
                className={`nav-tab admin-tab ${activeTab === 'studio' ? 'active' : ''}`}
                onClick={() => switchTab('studio')}
              >
                Deal Studio
              </button>
              <button 
                className={`nav-tab admin-tab ${activeTab === 'feeds' ? 'active' : ''}`}
                onClick={() => switchTab('feeds')}
              >
                Live Feeds
              </button>
            </>
          )}

          <button 
            className={`nav-tab lock-tab ${isAdmin ? 'logged-in' : ''}`}
            onClick={() => { handleAdminClick(); setMobileMenuOpen(false); }}
          >
            {isAdmin ? 'Admin (Kijelentkezes)' : 'Admin Belepes'}
          </button>
        </nav>
      </header>

      {apiStatus.loading && (
        <div className="status-banner info">
          <span>Élő kuponok betöltése a táblázatból...</span>
        </div>
      )}

      {apiStatus.error && !apiStatus.loading && (
        <div className="status-banner error">
          <span>[INFO] {apiStatus.error}</span>
        </div>
      )}

      <main className="main-content">
        {activeTab === 'coupons' && (
          <CouponGrid 
            coupons={coupons}
            activeSheet={activeSheet}
            setActiveSheet={setActiveSheet}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSendToStudio={handleSendToStudio}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewsPage isAdmin={isAdmin} />
        )}

        {isAdmin && activeTab === 'studio' && (
          <DealStudio initialDeal={selectedDealForStudio} availableCoupons={coupons} />
        )}

        {isAdmin && activeTab === 'feeds' && (
          <div className="feeds-section mac-card">
            <h3>ÉLŐ ADATCSATORNÁK ÉS ÁLLAPOT</h3>
            <p>Google Sheets Táblázat ID: <code>{SPREADSHEET_ID}</code></p>
            <div className="feeds-list">
              {SHEET_NAMES.map(name => (
                <div key={name} className="feed-item">
                  <span className="feed-name">{name}</span>
                  <span className="feed-status active">Aktív Szinkron</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <AdminModal 
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={handleAdminSuccess}
      />
    </div>
  );
}

export default App;
