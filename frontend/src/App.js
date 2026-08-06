import React, { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import './Coupons.css';
import CouponGrid from './components/CouponGrid';
import DealStudio from './components/DealStudio';
import ReviewsPage from './components/ReviewsPage';
import AdminModal from './components/AdminModal';

/* ============================================================
   Ikonok (inline SVG — nincs külső függőség, öröklik a színt)
   ============================================================ */

const IconSun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="theme-icon" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);

const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="theme-icon" aria-hidden="true">
    <path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8z" />
  </svg>
);

const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

/* ============================================================
   Téma: rendszerbeállítás -> localStorage -> data-theme a <html>-en
   ============================================================ */

const readInitialTheme = () => {
  try {
    const saved = window.localStorage.getItem('kvm-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    /* privát mód: elnyeljük */
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#fafafc' : '#101114');
};

const ThemeToggle = ({ theme, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="icon-btn theme-toggle"
    title={theme === 'dark' ? 'Váltás világos módra' : 'Váltás sötét módra'}
    aria-label={theme === 'dark' ? 'Váltás világos módra' : 'Váltás sötét módra'}
  >
    {theme === 'dark' ? <IconSun /> : <IconMoon />}
  </button>
);

/* ============================================================
   Google Sheets betöltés
   ============================================================ */

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
  const is9ColSchema = sheetName === 'BANGGOODAPI' || sheetName === 'ALIEXPRESSAPI' || cols.length === 9;

  const imgIdx = 0;
  const nameIdx = 1;
  const linkIdx = is9ColSchema ? 2 : 3;
  const priceIdx = is9ColSchema ? 3 : 6; // Column G (index 6) strictly for 16-col sheets
  const codeIdx = is9ColSchema ? 4 : 7;  // Column H (index 7) strictly for 16-col sheets
  const warehouseIdx = is9ColSchema ? 5 : 9;
  const endTimeIdx = is9ColSchema ? 6 : 12;
  const updateTimeIdx = is9ColSchema ? 7 : 13;
  const shortlinkIdx = is9ColSchema ? 8 : (is9ColSchema ? 2 : 3);

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

/* ============================================================
   App
   ============================================================ */

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

  // Lusta inicializálás: az ikon már az első rendernél a helyes állapotot mutatja
  const [theme, setTheme] = useState(readInitialTheme);
  const [isCondensed, setIsCondensed] = useState(false);
  const [showToTop, setShowToTop] = useState(false);
  const [isPressingBrand, setIsPressingBrand] = useState(false);

  const pressTimerRef = useRef(null);
  const segRef = useRef(null);
  const thumbRef = useRef(null);
  const headerRef = useRef(null);
  const progressRef = useRef(null);
  const tabRefs = useRef({});

  /* ---------- Téma ---------- */

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /* ---------- Fejlécmagasság -> CSS változó ----------
     A fejléc görgetéskor összemegy, ezért a magassága nem konstans.
     A ragadós eszköztár és a mobil menü ehhez igazodik, így muszáj mérni. */

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;

    const sync = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--header-h', `${h}px`);
    };

    sync();

    if (typeof window.ResizeObserver === 'function') {
      const ro = new window.ResizeObserver(sync);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // A be-/kicsukódás animált, a végállapotot utólag is le kell mérni
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const t = setTimeout(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--header-h', `${h}px`);
    }, 460);
    return () => clearTimeout(t);
  }, [isCondensed, isAdmin]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem('kvm-theme', next);
      } catch (e) {
        /* privát mód: a téma a munkamenetre marad meg */
      }
      return next;
    });
  };

  /* ---------- Görgetés: fejléc összehúzás + haladásjelző ---------- */

  useEffect(() => {
    let ticking = false;

    const measure = () => {
      const doc = document.documentElement;
      const y = window.pageYOffset || doc.scrollTop || 0;

      // Hiszterézis, hogy a határon ne villogjon a fejléc
      setIsCondensed(prev => (prev ? y > 12 : y > 40));
      setShowToTop(y > 600);

      // A haladásjelzőt közvetlenül a DOM-ra írjuk: state-ben minden
      // görgetési frame újrarenderelné a több száz kuponkártyát.
      if (progressRef.current) {
        const max = doc.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
        progressRef.current.style.transform = `scaleX(${ratio})`;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    measure();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  /* ---------- Admin: cím nyomvatartása ---------- */

  const startPressTimer = () => {
    if (isAdmin) return;
    setIsPressingBrand(true);
    pressTimerRef.current = setTimeout(() => {
      setIsPressingBrand(false);
      setIsAdminModalOpen(true);
    }, 3000);
  };

  const cancelPressTimer = () => {
    setIsPressingBrand(false);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  }, []);

  /* ---------- Navigáció ---------- */

  const TABS = [
    { id: 'coupons', label: 'Kínálat', count: coupons.length },
    { id: 'reviews', label: 'Tesztek & Unboxing' }
  ];

  if (isAdmin) {
    TABS.push({ id: 'studio', label: 'Deal Studio', admin: true });
    TABS.push({ id: 'feeds', label: 'Live Feeds', admin: true });
  }

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  /* ---------- Szegmentált vezérlő csúszó indikátora ---------- */

  const positionThumb = useCallback(() => {
    const seg = segRef.current;
    const thumb = thumbRef.current;
    const btn = tabRefs.current[activeTab];
    if (!seg || !thumb || !btn) return;

    const segBox = seg.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    if (btnBox.width === 0) return;

    thumb.style.width = `${btnBox.width}px`;
    thumb.style.transform = `translateX(${btnBox.left - segBox.left}px)`;
    thumb.classList.add('is-ready');
    seg.classList.add('has-thumb');
  }, [activeTab]);

  useLayoutEffect(() => {
    positionThumb();
    // A webfont betöltése után változhat a gombszélesség
    const t = setTimeout(positionThumb, 260);
    window.addEventListener('resize', positionThumb);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', positionThumb);
    };
  }, [positionThumb, isAdmin, coupons.length]);

  /* ---------- Adatbetöltés ---------- */

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

  /* ---------- Mobil menü: ESC + görgetészár ---------- */

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  /* ---------- Kezelők ---------- */

  const handleSendToStudio = (coupon) => {
    setSelectedDealForStudio(coupon);
    setActiveTab('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    setMobileMenuOpen(false);
    if (activeTab === 'studio' || activeTab === 'feeds') {
      setActiveTab('coupons');
    }
  };

  const handleAdminSuccess = () => {
    setIsAdmin(true);
    setIsAdminModalOpen(false);
  };

  useEffect(() => {
    switch (activeTab) {
      case 'reviews':
        document.title = 'KÍNÁBÓLVEDDMEG — Magyar Terméktesztek & Unboxing Cikkek';
        break;
      case 'studio':
        document.title = 'KÍNÁBÓLVEDDMEG — Deal Studio Admin';
        break;
      case 'feeds':
        document.title = 'KÍNÁBÓLVEDDMEG — Élő Adatcsatornák';
        break;
      default:
        document.title = 'KÍNÁBÓLVEDDMEG — Kínai Kuponok, Akciók, Banggood, AliExpress, Geekbuying';
        break;
    }
  }, [activeTab]);

  return (
    <div className="app-root">
      <header className={`site-header ${isCondensed ? 'is-condensed' : ''}`} ref={headerRef}>
        <div className="header-inner">
          <div className="window-dots" aria-hidden="true">
            <span /><span /><span />
          </div>

          <div className={`brand-wrap ${isPressingBrand ? 'is-pressing' : ''}`}>
            <div
              className="brand"
              onMouseDown={startPressTimer}
              onMouseUp={cancelPressTimer}
              onMouseLeave={cancelPressTimer}
              onTouchStart={startPressTimer}
              onTouchEnd={cancelPressTimer}
              onTouchCancel={cancelPressTimer}
              onClick={(e) => {
                if (e.detail === 3 && !isAdmin) setIsAdminModalOpen(true);
              }}
              title="Tartsd nyomva 3 másodpercig az admin belépéshez"
            >
              <h1 className="brand-title">KÍNÁBÓLVEDDMEG</h1>
              <p className="brand-subtitle">BUYITFROMCHINA · PRÉMIUM KUPONOK ÉS AKCIÓK</p>
            </div>
            <span className="brand-hold-bar" />
          </div>

          <nav className="segmented" ref={segRef} aria-label="Fő navigáció">
            <span className="segmented-thumb" ref={thumbRef} aria-hidden="true" />
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                ref={el => { tabRefs.current[tab.id] = el; }}
                className={`seg-btn ${activeTab === tab.id ? 'active' : ''} ${tab.admin ? 'admin-seg' : ''}`}
                onClick={() => switchTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
                {tab.count > 0 && <span className="seg-count">{tab.count}</span>}
              </button>
            ))}
          </nav>

          <div className="header-actions">
            {isAdmin && (
              <button
                type="button"
                className="btn-mac btn-mac-danger admin-exit"
                onClick={handleAdminLogout}
                title="Kilépés az admin módból"
              >
                Admin ki
              </button>
            )}

            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            <button
              type="button"
              className={`hamburger-btn ${mobileMenuOpen ? 'is-open' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menü"
              aria-expanded={mobileMenuOpen}
            >
              <span className="hamburger-bar" />
              <span className="hamburger-bar" />
              <span className="hamburger-bar" />
            </button>
          </div>
        </div>

        <span className="scroll-progress" ref={progressRef} aria-hidden="true" />
      </header>

      <div
        className={`mobile-scrim ${mobileMenuOpen ? 'is-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <div className={`mobile-sheet ${mobileMenuOpen ? 'is-open' : ''}`}>
        <div className="mobile-sheet-inner">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`sheet-item ${activeTab === tab.id ? 'active' : ''} ${tab.admin ? 'admin-seg' : ''}`}
              onClick={() => switchTab(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && <span className="seg-count">{tab.count}</span>}
            </button>
          ))}

          {isAdmin && (
            <>
              <span className="sheet-sep" />
              <button type="button" className="sheet-item danger" onClick={handleAdminLogout}>
                <span>Admin kijelentkezés</span>
              </button>
            </>
          )}
        </div>
      </div>

      <main className="main-content">
        {apiStatus.loading && (
          <div className="status-banner info">
            <span className="spinner" />
            <span>Élő kuponok betöltése a táblázatból…</span>
          </div>
        )}

        {apiStatus.error && !apiStatus.loading && (
          <div className="status-banner error">
            <span>{apiStatus.error}</span>
          </div>
        )}

        {activeTab === 'coupons' && (
          <CouponGrid
            coupons={coupons}
            loading={apiStatus.loading}
            activeSheet={activeSheet}
            setActiveSheet={setActiveSheet}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSendToStudio={handleSendToStudio}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === 'reviews' && <ReviewsPage isAdmin={isAdmin} />}

        {isAdmin && activeTab === 'studio' && (
          <DealStudio initialDeal={selectedDealForStudio} availableCoupons={coupons} />
        )}

        {isAdmin && activeTab === 'feeds' && (
          <div className="feeds-section">
            <h3>Élő adatcsatornák és állapot</h3>
            <p>Google Sheets táblázat ID: <code>{SPREADSHEET_ID}</code></p>
            <div className="feeds-list">
              {SHEET_NAMES.map(name => (
                <div key={name} className="feed-item">
                  <span className="feed-name">{name}</span>
                  <span className="feed-status active">Aktív szinkron</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* SEO Semantikus Lábléc */}
      <footer className="seo-footer">
        <div className="seo-footer-inner">
          <section className="seo-info-block">
            <h2>KÍNÁBÓLVEDDMEG — A legjobb kínai kuponok és akciók gyűjtőhelye</h2>
            <p>
              A KÍNÁBÓLVEDDMEG segítségével naponta több ezer frissülő Banggood, AliExpress és Geekbuying kuponkód közül válogathatsz. 
              Célunk, hogy a legkedvezőbb árakat, EU raktáras ajánlatokat és tesztelt termékeket közvetlenül elhozzuk a vásárlóknak.
            </p>
          </section>

          <section className="seo-faq-grid">
            <div className="seo-faq-item">
              <h3>Hogyan működik a kuponkódok másolása?</h3>
              <p>A kuponkódra vagy a kártyára kattintva a kuponkód azonnal a vágólapodra kerül, amit a webáruház pénztáránál beilleszthetsz.</p>
            </div>
            <div className="seo-faq-item">
              <h3>Mit jelent az EU raktár jelölés?</h3>
              <p>Az EU raktárból érkező termékek gyorsan, általában 3-7 munkanap alatt megérkeznek, és vámmentesen kerülnek kézbesítésre.</p>
            </div>
            <div className="seo-faq-item">
              <h3>Milyen gyakran frissül az adatbázis?</h3>
              <p>Az élő adatbázis folyamatosan frissül automatikus GitHub szinkronizációval a Google Sheets táblázatainkból.</p>
            </div>
          </section>

          <div className="seo-footer-bottom">
            <p>© 2026 KÍNÁBÓLVEDDMEG — Minden jog fenntartva.</p>
          </div>
        </div>
      </footer>

      <button
        type="button"
        className={`to-top ${showToTop ? 'is-visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Vissza a lap tetejére"
        title="Vissza a tetejére"
      >
        <IconArrowUp />
      </button>

      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={handleAdminSuccess}
      />
    </div>
  );
}

export default App;
