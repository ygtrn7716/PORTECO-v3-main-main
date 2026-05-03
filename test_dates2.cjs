const XLSX = require('xlsx');
const fs = require('fs');

const buf = fs.readFileSync('/sessions/peaceful-fervent-darwin/mnt/uploads/Europower 27.04.2026 20_46_22 Report - Europower 27.04.2026 20_46_22 Report.csv');
const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

console.log('First 5 rows:');
for (let i = 1; i <= 5; i++) {
  console.log('  Row ' + i + ': rawDate=' + JSON.stringify(aoa[i][0]) + ' | type=' + typeof aoa[i][0]);
}
console.log('Rows 60-70:');
for (let i = 60; i <= 70; i++) {
  console.log('  Row ' + i + ': rawDate=' + JSON.stringify(aoa[i][0]) + ' | type=' + typeof aoa[i][0]);
}
console.log('---');
const types = {};
for (let i = 1; i < aoa.length; i++) {
  const t = aoa[i][0] instanceof Date ? 'Date' : typeof aoa[i][0];
  types[t] = (types[t] || 0) + 1;
}
console.log('Type distribution:', types);

console.log('---Month distribution (parsed via DD.MM):');
const months = {};
for (let i = 1; i < aoa.length; i++) {
  const d = aoa[i][0];
  if (typeof d === 'string') {
    const m = d.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-]/);
    if (m) {
      const mon = Number(m[2]);
      months[mon] = (months[mon] || 0) + 1;
    }
  }
}
console.log(months);
