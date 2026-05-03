// Placeholder data for GES detail page when user has no API connection.
// Values are deterministic so render output is stable.

const MONTH_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

// Seasonal sine curve 800-2400 kWh for 12 months
export const MOCK_MONTHLY = MONTH_SHORT.map((label, i) => {
  const phase = ((i - 5) / 12) * Math.PI * 2;
  const kwh = 1600 + Math.cos(phase) * 800;
  return { label, month: i + 1, kwh: Math.round(kwh * 10) / 10 };
});

// 30 days, 30-65 kWh each — deterministic wobble
export const MOCK_DAILY = Array.from({ length: 30 }, (_, i) => {
  const kwh = 45 + Math.sin(i * 0.7) * 12 + Math.cos(i * 0.3) * 6;
  return { day: i + 1, kwh: Math.round(kwh * 10) / 10 };
});

export const MOCK_SUMMARY = {
  thisMonth: 1245,
  lastMonth: 1390,
  today: 42,
  instantKw: 8.4,
  lifetime: 18420,
};
