const XLSX = require('xlsx');
const fs = require('fs');

const buf = fs.readFileSync('/sessions/peaceful-fervent-darwin/mnt/uploads/Europower 27.04.2026 20_46_22 Report - Europower 27.04.2026 20_46_22 Report.csv');
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];

const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
console.log('Header:', aoa[0]);
console.log('---');
let printed = 0;
for (let i = 1; i < aoa.length && printed < 5; i++) {
  const v = aoa[i][1];
  if (v !== 0 && v !== '0' && v !== '' && v != null) {
    console.log(`Row ${i}: tarih=${aoa[i][0]} | value=${JSON.stringify(v)} | type=${typeof v}`);
    printed++;
  }
}
console.log('---');
let total = 0, max = 0;
for (let i = 1; i < aoa.length; i++) {
  const v = Number(aoa[i][1]);
  if (Number.isFinite(v)) { total += v; if (v > max) max = v; }
}
console.log('Total:', total, 'Max:', max);
