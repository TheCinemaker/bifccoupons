const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const sheets = ['BG Unique', 'BG Unique HUN', 'BG ALL Coupons', 'Geekbuying', 'Geekbuying Unique'];

async function testFetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const json = JSON.parse(jsonString);
    console.log(`\n=================== Sheet [${sheetName}] ===================`);
    console.log(`Row count:`, json.table.rows.length);
    console.log(`Columns:`, json.table.cols.map((c, i) => `${i}: ${c.label || c.id}`));
    if (json.table.rows.length > 0) {
      console.log(`Sample row 0:`);
      json.table.rows[0].c.forEach((cell, idx) => {
        if (cell && cell.v !== undefined && cell.v !== null) {
          console.log(`  Col ${idx}: ${cell.v}`);
        }
      });
    }
  } catch (err) {
    console.error(`Sheet [${sheetName}] error:`, err.message);
  }
}

async function run() {
  for (const s of sheets) {
    await testFetchSheet(s);
  }
}

run();
