// Node v25+ SlowBuffer compatibility polyfill
const bufferModule = require('buffer');
if (!bufferModule.SlowBuffer) {
  bufferModule.SlowBuffer = bufferModule.Buffer;
}

const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const axios = require('axios');
const md5 = require('md5');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: false
}));
app.use(express.json());

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'credentials.json');
const BANGGOOD_API_KEY = 'aff6045d0060d22';
const BANGGOOD_API_SECRET = '5fe2c9cb4d772b915d3e300fd0e5d0e9';

// Aláírás generálása a Banggood API számára
function createSignature(params) {
    const sortedKeys = Object.keys(params).sort();
    const sortedParams = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    return md5(sortedParams);
}

// Access Token igénylése a Banggood API-tól
async function getAccessToken() {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(7);
    const params = {
        api_key: BANGGOOD_API_KEY,
        noncestr: nonce,
        timestamp: timestamp,
        api_secret: BANGGOOD_API_SECRET
    };
    
    const signature = createSignature(params);
    
    try {
        const response = await axios.get('https://affapi.banggood.com/getAccessToken', {
            params: {
                api_key: BANGGOOD_API_KEY,
                noncestr: nonce,
                timestamp: timestamp,
                signature: signature
            }
        });
        
        if (response.data && response.data.result && response.data.result.access_token) {
            console.log("Access token sikeresen lekérve:", response.data.result.access_token);
            return response.data.result.access_token;
        } else {
            console.error("Access token lekérési hiba:", response.data);
            throw new Error('Failed to fetch access token');
        }
    } catch (error) {
        console.error("Access token lekérési hiba:", error.message);
        throw error;
    }
}

// Banggood kuponok lekérése és egyszerű konzolra írás
const getProductDetails = async (productId, accessToken) => {
    try {
        const response = await axios.get('https://affapi.banggood.com/product/details', {
            params: {
                product_id: productId,
                api_key: BANGGOOD_API_KEY,
                access_token: accessToken
            }
        });
        return response.data.result || {}; // Térjen vissza az eredménnyel
    } catch (error) {
        console.error("Termék részletek lekérési hiba:", error.message);
        return {}; // Üres objektum visszaadása hiba esetén
    }
};

async function fetchBanggoodCoupons() {
    const accessToken = await getAccessToken();

    if (!accessToken) {
        console.error('Nincs érvényes access token');
        throw new Error('Failed to fetch access token');
    }

    let allCoupons = [];
    let currentPage = 1;
    let totalPages = 1;

    try {
        while (currentPage <= totalPages) {
            const response = await axios.get('https://affapi.banggood.com/coupon/list', {
                headers: {
                    'access-token': accessToken
                },
                params: {
                    type: 2,
                    page: currentPage
                }
            });

            if (response.data && response.data.result && Array.isArray(response.data.result.coupon_list)) {
                const formattedCoupons = response.data.result.coupon_list.map((coupon) => {
                    // Termék neve a linkből, kötőjel nélküli formátumra alakítva
                    let productName = coupon.promo_link_standard.split('/').slice(-1)[0].split('-').join(' ');

                    // Affiliate kód eltávolítása a végéről
                    productName = productName.replace(/\?.*$/g, '').replace(/!.*$/g, '');

                    return {
                        image: coupon.coupon_img || '', // Fotó jelenleg nincs
                        name: productName || coupon.only_for,
                        link: coupon.promo_link_standard || '',
                        shortlink: coupon.promo_link_short || '',
                        price: coupon.condition || '0',
                        code: coupon.coupon_code || '',
                        warehouse: coupon.warehouse || '',
                        endTime: coupon.coupon_date_end || '',
                        updateTime: coupon.coupon_date_start || '',
                        discount: coupon.discount || '',
                        condition: coupon.condition || '',
                        discountType: coupon.discount_type || '',
                        description: coupon.coupon_description || '',
                        residual: coupon.coupon_residual || '',
                        originalPrice: coupon.original_price || '',
                        currency: coupon.currency || '',
                        source: 'Banggood'
                    };
                });

                allCoupons = allCoupons.concat(formattedCoupons);
                totalPages = response.data.result.page_total;
                console.log(`Oldal ${currentPage} kuponjai hozzáadva, összesen ${totalPages} oldal.`);
                currentPage++;
            } else {
                console.error('Hibás Banggood API válasz:', response.data);
                throw new Error('Invalid response from Banggood API');
            }
        }

        console.log("Összesített kuponok száma:", allCoupons.length);

        await updateSheetWithCoupons(allCoupons);
        console.log("Google Sheet sikeresen frissítve a Banggood kuponokkal!");

        return allCoupons;

    } catch (error) {
        console.error('Banggood API hívási hiba:', error.message);
        console.error('Hiba részletei:', error.response ? error.response.data : error);
        throw new Error('Failed to fetch Banggood coupons');
    }
}

const fs = require('fs');

function getGoogleAuth(scopes) {
    const authOptions = { scopes };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } catch (e) {
            console.error('Hiba a GOOGLE_CREDENTIALS_JSON parszolásánál:', e.message);
        }
    } else if (fs.existsSync(CREDENTIALS_PATH)) {
        authOptions.keyFile = CREDENTIALS_PATH;
    }
    return new GoogleAuth(authOptions);
}

async function updateSheetWithCoupons(coupons) {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, client);

    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Banggood'];

    // Töröld a meglévő tartalmat, és állítsd be az oszlopok fejlécét
    if (!sheet) {
        sheet = await doc.addSheet({
            title: 'Banggood',
            headerValues: ['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink', 'source']
        });
    } else {
        await sheet.clear();
        await sheet.setHeaderRow(['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink', 'source']);
    }

    const rows = coupons.map(coupon => ({
        image: coupon.image,
        name: coupon.name,
        link: coupon.link,
        price: coupon.price,
        code: coupon.code,
        warehouse: coupon.warehouse,
        endTime: coupon.endTime,
        updateTime: coupon.updateTime,
        shortlink: coupon.shortlink,
        source: coupon.source
    }));

    await sheet.addRows(rows);
    console.log("Kuponok sikeresen hozzáadva a Google Sheets 'Banggood' lapra.");
}

// Google Sheets-ből kuponok lekérése
async function fetchCouponsFromSheets(sheetNames) {
    console.log('Google Sheets kuponok lekérése...');
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, client);
    await doc.loadInfo();
    let allCoupons = [];

    for (const sheetName of sheetNames) {
        const sheet = doc.sheetsByTitle[sheetName];
        if (!sheet) {
            console.warn(`Sheet not found: ${sheetName}`);
            continue;
        }

        console.log(`Adatok lekérése a következő lapról: ${sheet.title}`);
        const rows = await sheet.getRows();
        console.log(`Adatsorok lekérve: ${rows.length} sor a következő lapról: ${sheet.title}`);

        const coupons = rows.map(row => {
            const rawData = row._rawData;
            return {
                image: rawData[0] || '',            // Image
                name: rawData[1] || '',             // Product name
                productId: rawData[2] || '',        // ProductID
                link: rawData[3] || '',             // Link
                originalPrice: rawData[4] || '',    // Original price
                discount: rawData[5] || '',         // Discount
                price: rawData[6] || '',            // Coupon price
                code: rawData[7] || '',             // Coupon code
                quantity: rawData[8] || '',         // Quantity
                warehouse: rawData[9] || '',        // Warehouse
                categories: rawData[10] || '',      // Categories
                startTime: rawData[11] || '',       // Start time
                endTime: rawData[12] || '',         // End time
                updateTime: rawData[13] || '',      // Update time
                source: sheet.title                 // Forrás (a sheet neve)
            };
        }).filter(coupon => coupon.name && coupon.link); // Csak olyan sorok, amik tartalmaznak adatot

        allCoupons = allCoupons.concat(coupons);
    }

    console.log('Google Sheets kuponok:', allCoupons);
    return allCoupons;
}


// Banggood kuponok API végpont
app.get('/api/banggood-coupons', async (req, res) => {
    try {
        const banggoodCoupons = await fetchBanggoodCoupons();
        res.json(banggoodCoupons);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch coupons from Banggood' });
    }
});

// Árukereső automatikus árellenőrző API végpont
app.get('/api/arukereso-search', async (req, res) => {
    const rawQuery = req.query.q || '';
    if (!rawQuery) {
        return res.status(400).json({ message: 'Hiányzó keresési kifejezés (?q=...)' });
    }

    // Tisztított terméknév a jobb keresési találat érdekében
    const cleanQuery = rawQuery
        .replace(/global version/gi, '')
        .replace(/eu plug/gi, '')
        .replace(/uk plug/gi, '')
        .replace(/official/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .trim();

    const searchUrl = `https://www.arukereso.hu/CategorySearch.php?st=${encodeURIComponent(cleanQuery)}`;
    const argepUrl = `https://www.argep.hu/main.aspx?suche=${encodeURIComponent(cleanQuery)}`;

    try {
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });

        const html = response.data || '';
        
        // Keresünk árakat a HTML kódba ágyazva (pl. "24 990 Ft" vagy "data-price="24990"")
        const priceMatches = html.match(/(\d{1,3}(?:\s?\d{3})+)\s*Ft/g) || [];
        const cleanPrices = priceMatches
            .map(p => parseInt(p.replace(/\s+/g, '').replace('Ft', ''), 10))
            .filter(p => !isNaN(p) && p > 1000);

        const lowestPrice = cleanPrices.length > 0 ? Math.min(...cleanPrices) : null;

        res.json({
            success: true,
            query: cleanQuery,
            foundPrice: lowestPrice,
            arukeresoUrl: searchUrl,
            argepUrl: argepUrl,
            allPricesFoundCount: cleanPrices.length
        });
    } catch (error) {
        console.error('Árukereső/Árgép keresési hiba:', error.message);
        res.json({
            success: false,
            query: cleanQuery,
            foundPrice: null,
            arukeresoUrl: searchUrl,
            argepUrl: argepUrl,
            message: 'Nem sikerült az automata árlekérés, manuális keresési linkek biztosítva'
        });
    }
});

// Google Sheets kuponok API végpont
app.get('/api/coupons', async (req, res) => {
    const sheetNames = ['BG Unique', 'BG Unique HUN', 'BG ALL Coupons', 'Geekbuying', 'Geekbuying Unique'];
    try {
        const coupons = await fetchCouponsFromSheets(sheetNames);
        res.json(coupons);
    } catch (error) {
        console.error('Google Sheets kuponok lekérési hiba:', error);
        res.status(500).json({ message: 'Failed to fetch coupons from Google Sheets' });
    }
});

setInterval(async () => {
    try {
        console.log("Frissítés indul: Banggood kuponok Google Sheet frissítése.");
        await fetchBanggoodCoupons();
    } catch (error) {
        console.error("Frissítési hiba:", error);
    }
}, 15 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
