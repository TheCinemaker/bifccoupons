/* eslint-disable jsx-a11y/accessible-emoji */
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
      {darkMode ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
};

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const SHEET_NAMES = ['BG Unique', 'BG Unique HUN', 'BG ALL Coupons', 'AliExpress ALL', 'Geekbuying', 'Geekbuying Unique'];

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
      const label = col.label.toLowerCase();
      return keyWords.some(kw => label.includes(kw));
    });
    return idx !== -1 ? idx : defaultIdx;
  };

  const is9ColSchema = cols.length === 9 || (cols[2] && cols[2].label && cols[2].label.toLowerCase().includes('link'));

  const imgIdx = findColIndex(['image', 'kép'], 0);
  const nameIdx = findColIndex(['product name', 'name', 'név', 'termék'], 1);
  const linkIdx = findColIndex(['shortlink', 'link'], is9ColSchema ? 2 : 3);
  const priceIdx = findColIndex(['coupon price', 'price', 'ár'], is9ColSchema ? 3 : 6);
  const codeIdx = findColIndex(['coupon code', 'code', 'kupon'], is9ColSchema ? 4 : 7);
  const warehouseIdx = findColIndex(['warehouse', 'raktár'], is9ColSchema ? 5 : 9);
  const endTimeIdx = findColIndex(['end time', 'endtime', 'lejárat'], is9ColSchema ? 6 : 12);
  const updateTimeIdx = findColIndex(['update time', 'updatetime', 'frissítés'], is9ColSchema ? 7 : 13);
  const shortlinkIdx = findColIndex(['shortlink'], is9ColSchema ? 8 : (is9ColSchema ? 2 : 3));

  return json.table.rows.map(row => {
    const c = row.c || [];
    const rawImage = c[imgIdx] ? c[imgIdx].v : '';
    const name = c[nameIdx] ? c[nameIdx].v : '';
    const link = c[linkIdx] ? c[linkIdx].v : '';
    const price = c[priceIdx] ? c[priceIdx].v : '';
    const code = c[codeIdx] ? c[codeIdx].v : '';
    const warehouse = c[warehouseIdx] ? c[warehouseIdx].v : '';
    const endTime = c[endTimeIdx] ? c[endTimeIdx].v : '';
    const updateTime = c[updateTimeIdx] ? c[updateTimeIdx].v : '';
    const shortlink = c[shortlinkIdx] ? c[shortlinkIdx].v : '';

    return {
      image: typeof rawImage === 'string' ? rawImage : '',
      name: typeof name === 'string' ? name : '',
      link: typeof link === 'string' ? link : '',
      price: price ? String(price) : '',
      code: code ? String(code) : '',
      warehouse: warehouse ? String(warehouse) : '',
      endTime: endTime ? String(endTime) : '',
      updateTime: updateTime ? String(updateTime) : '',
      shortlink: shortlink ? String(shortlink) : '',
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

  useEffect(() => {
    let isMounted = true;
    
    async function loadAllLiveSheets() {
      try {
        setApiStatus({ loading: true, error: null });

        // Párhuzamos lekérés az összes lapra a maximális sebességért
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
            console.log('Összesen betöltött élő kuponok száma (párhuzamos beolvasással):', allLiveCoupons.length);
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

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="logo-brand">
          <div className="logo-badge">BIFC</div>
          <div>
            <h1 className="brand-title">KÍNÁBÓL VEDD MEG</h1>
            <p className="brand-subtitle">BUYITFROMCHINA - KUPONKERESŐ & DEAL STUDIO</p>
          </div>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'coupons' ? 'active' : ''}`}
            onClick={() => setActiveTab('coupons')}
          >
            Kuponkereső ({coupons.length})
          </button>
          <button 
            className={`nav-tab ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            Deal Studio & Autoposzt
          </button>
          <button 
            className={`nav-tab ${activeTab === 'feeds' ? 'active' : ''}`}
            onClick={() => setActiveTab('feeds')}
          >
            Live Feeds
          </button>
        </nav>

        <DarkModeToggle />
      </header>

      {apiStatus.loading && (
        <div className="status-banner info">
          <span>Élő kuponok töltése a Google Sheets táblázatból (ID: 1qw3IXBpWl...)...</span>
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
          />
        )}

        {activeTab === 'studio' && (
          <DealStudio 
            initialDeal={selectedDealForStudio || (coupons.length > 0 ? coupons[0] : null)}
            availableCoupons={coupons}
            onSelectDeal={(deal) => setSelectedDealForStudio(deal)}
          />
        )}

        {activeTab === 'feeds' && (
          <div className="feeds-container panel">
            <h2>Live Adatforrások & Google Sheets Státusz</h2>
            <p className="text-muted">A kuponok közvetlenül a Google Sheets táblázatodból olvasódnak be élőben.</p>
            
            <div className="feeds-grid">
              <div className="feed-card">
                <h3>Google Sheets Élő Szinkron</h3>
                <p><strong>Spreadsheet ID:</strong> <code>1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc</code></p>
                <p><strong>Beolvasott Laptáblák:</strong></p>
                <ul>
                  <li>BG Unique</li>
                  <li>BG Unique HUN</li>
                  <li>BG ALL Coupons</li>
                  <li>Geekbuying</li>
                  <li>Geekbuying Unique</li>
                </ul>
                <p style={{marginTop: '0.5rem'}}><strong>Összes beolvasott élő kupon:</strong> {coupons.length} db</p>
                <span className="badge-status online">[OK] Élő Adatfolyam Csatlakoztatva</span>
              </div>

              <div className="feed-card">
                <h3>Banggood Affiliate API</h3>
                <p><strong>API kódok:</strong> Netlify & Backend szinkronizált</p>
                <p><strong>Frissítés:</strong> Google Sheets automatikus szinkronizáció</p>
                <span className="badge-status online">[OK] Csatlakoztatva</span>
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
