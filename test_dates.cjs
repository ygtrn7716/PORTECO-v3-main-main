const XLSX = require('xlsx');
const fs = require('fs');

const buf = fs.readFileSync('/sessions/peaceful-fervent-darwin/mnt/uploads/Europower 27.04.2026 20_46_22 Report - Europower 27.04.2026 20_46_22 Report.csv');
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];

const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

console.log('Header:', aoa[0]);
console.log('---');
// İlk 5 ve son 5 tarih
console.log('İlk 5 satır:');
for (let i = 1; i <= 5; i++) {
  console.log(`  Row ${i}: rawDate=${JSON.stringify(aoa[i][0])} | type=${typeof aoa[i][0]}`);
}
console.log('Son 5 satır:');
for (let i = aoa.length - 5; i < aoa.length; i++) {
  console.log(`  Row ${i}: rawDate=${JSON.stringify(aoa[i][0])} | type=${typeof aoa[i][0]}`);
}
console.log('---');
// Ay dağılımı
const months = {};
for (let i = 1; i < aoa.length; i++) {
  const d = aoa[i][0];
  if (d instanceof Date) {
    const m = d.getMonth() + 1;
    months[m] = (months[m] || 0) + 1;
  } else if (typeof d === 'string') {
    const match = d.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-]/);
    if (match) {
      const m = Number(match[2]); // 2. grup ay (DD.MM.YYYY için)
      months['str_' + m] = (months['str_' + m] || 0) + 1;
    }
  }
}
console.log('Ay dağılımı:', months);
