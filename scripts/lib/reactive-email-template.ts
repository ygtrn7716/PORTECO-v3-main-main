// scripts/lib/reactive-email-template.ts
// Reaktif aşım anlık bildirim maili icin HTML/text/subject builder.
// Referans: aril-sync-main/send_reactive_email.js (gunluk mail).

const LOGO_URL = "https://ecoenerji.net.tr/features/ecologo.png?v=1";
const IND_LIMIT = 20; // RI ve RIO icin ortak
const CAP_LIMIT = 15; // RC ve RCO icin ortak

export type Breach = {
  serno: string;
  ind_pct: number; // RI veya RIO
  cap_pct: number; // RC veya RCO
  ind_breach: boolean;
  cap_breach: boolean;
};

export type SubInfo = { nickname: string | null; title: string | null };

export type BuildArgs = {
  todayIso: string; // YYYY-MM-DD
  timeText: string; // HH:mm
  gridBreaches: Breach[];
  prodBreaches: Breach[];
  subMap: Map<string, SubInfo>;
};

// YYYY-MM-DD -> dd.MM.yyyy
export function isoToTrDateText(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${d}.${m}.${y}`;
}

// Istanbul TZ'de YYYY-MM-DD
export function trDateISO(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Istanbul TZ'de HH:mm
export function trTimeNow(d = new Date()): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPct(n: unknown): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function renderRow(item: Breach, subMap: Map<string, SubInfo>): string {
  const sub = subMap.get(item.serno) ?? { nickname: null, title: null };
  const name = sub.nickname || sub.title || item.serno;
  const indColor = item.ind_breach ? "#dc2626" : "#7A8C99";
  const capColor = item.cap_breach ? "#dc2626" : "#7A8C99";
  return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#0F1C2E;font-weight:600;">${escapeHtml(name)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:14px;color:${indColor};font-weight:700;text-align:right;">${fmtPct(item.ind_pct)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:14px;color:${capColor};font-weight:700;text-align:right;">${fmtPct(item.cap_pct)}</td>
    </tr>`;
}

function renderTable(opts: {
  items: Breach[];
  subMap: Map<string, SubInfo>;
  headerLabel: string; // "Şebeke Yönü — Aşımda Olan N Tesis" gibi
  indColLabel: string; // "RI %" veya "RIO %"
  capColLabel: string; // "RC %" veya "RCO %"
}): string {
  const headerBg = "#dc2626";
  const rowBg = "#FEF2F2";
  const rows = opts.items.map((i) => renderRow(i, opts.subMap)).join("");
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${rowBg};border-radius:10px;overflow:hidden;margin:0 0 20px 0;">
    <thead>
      <tr>
        <th colspan="3" style="background:${headerBg};color:#ffffff;padding:12px 14px;font-size:15px;font-weight:700;text-align:left;letter-spacing:0.2px;">🔴 ${escapeHtml(opts.headerLabel)}</th>
      </tr>
      <tr>
        <th style="padding:10px 14px;font-size:12px;color:#7A8C99;text-align:left;font-weight:600;background:#ffffff;">Tesis</th>
        <th style="padding:10px 14px;font-size:12px;color:#7A8C99;text-align:right;font-weight:600;background:#ffffff;">${escapeHtml(opts.indColLabel)}</th>
        <th style="padding:10px 14px;font-size:12px;color:#7A8C99;text-align:right;font-weight:600;background:#ffffff;">${escapeHtml(opts.capColLabel)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTextTable(opts: {
  items: Breach[];
  subMap: Map<string, SubInfo>;
  title: string;
  indLabel: string;
  capLabel: string;
}): string[] {
  const lines: string[] = [];
  lines.push(`🔴 ${opts.title}:`);
  for (const b of opts.items) {
    const sub = opts.subMap.get(b.serno) ?? { nickname: null, title: null };
    const name = sub.nickname || sub.title || b.serno;
    lines.push(`  - ${name} — ${opts.indLabel} ${fmtPct(b.ind_pct)}, ${opts.capLabel} ${fmtPct(b.cap_pct)}`);
  }
  return lines;
}

export function buildReactiveAlertEmail(args: BuildArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const trDate = isoToTrDateText(args.todayIso);
  const subject = `PORTECO Reaktif Aşım Tespit Edildi — ${trDate}`;
  const year = new Date().getFullYear();

  const gridTableHtml = args.gridBreaches.length
    ? renderTable({
        items: args.gridBreaches,
        subMap: args.subMap,
        headerLabel: `Şebeke Yönü — Aşımda Olan ${args.gridBreaches.length} Tesis`,
        indColLabel: "RI %",
        capColLabel: "RC %",
      })
    : "";

  const prodTableHtml = args.prodBreaches.length
    ? renderTable({
        items: args.prodBreaches,
        subMap: args.subMap,
        headerLabel: `Veriş Yönü — Aşımda Olan ${args.prodBreaches.length} Tesis`,
        indColLabel: "RIO %",
        capColLabel: "RCO %",
      })
    : "";

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:'Inter',Arial,sans-serif;color:#0F1C2E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(15,28,46,0.06);">
          <tr>
            <td align="center" style="padding:24px 24px 0 24px;">
              <img src="${LOGO_URL}" alt="Eco Enerji" style="display:block;max-height:60px;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#00AEEF 0%,#005B96 100%);border-radius:12px;">
                <tr>
                  <td style="padding:22px 24px;color:#ffffff;">
                    <div style="font-size:22px;font-weight:800;letter-spacing:0.3px;">PORTECO</div>
                    <div style="font-size:14px;font-weight:500;opacity:0.92;margin-top:4px;">Reaktif Aşım Tespit Edildi</div>
                    <div style="font-size:13px;font-weight:500;opacity:0.85;margin-top:10px;">${escapeHtml(trDate)} — Saat: ${escapeHtml(args.timeText)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 8px 24px;">
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#0F1C2E;">
                Tesisinizde reaktif limit aşımı tespit edildi. Lütfen kompansatör panelinizi acil olarak kontrol ediniz.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px;">
              ${gridTableHtml}
              ${prodTableHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 16px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;border-left:4px solid #dc2626;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#0F1C2E;">
                    <strong>⚠️ Acil:</strong> Tesisinizde reaktif limit aşımı tespit edildi. Lütfen kompansatör panelinizi acil olarak kontrol ediniz.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 24px 24px;">
              <div style="font-size:12px;color:#7A8C99;line-height:1.6;text-align:center;">
                Reaktif limit değerleri: RI/RIO %${IND_LIMIT}, RC/RCO %${CAP_LIMIT}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 24px 24px;border-top:1px solid #E5E7EB;text-align:center;">
              <div style="font-size:12px;color:#7A8C99;line-height:1.6;">
                © ${year} PORTECO — Eco Enerji<br />
                <a href="mailto:info@ecoenerji.net.tr" style="color:#005B96;text-decoration:none;">info@ecoenerji.net.tr</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [
    `PORTECO — Reaktif Aşım Tespit Edildi`,
    `Tarih: ${trDate} — Saat: ${args.timeText}`,
    ``,
    `Tesisinizde reaktif limit aşımı tespit edildi. Lütfen kompansatör panelinizi acil olarak kontrol ediniz.`,
    ``,
  ];

  if (args.gridBreaches.length) {
    textLines.push(
      ...renderTextTable({
        items: args.gridBreaches,
        subMap: args.subMap,
        title: `Şebeke Yönü — Aşımda Olan ${args.gridBreaches.length} Tesis`,
        indLabel: "RI",
        capLabel: "RC",
      })
    );
    textLines.push(``);
  }

  if (args.prodBreaches.length) {
    textLines.push(
      ...renderTextTable({
        items: args.prodBreaches,
        subMap: args.subMap,
        title: `Veriş Yönü — Aşımda Olan ${args.prodBreaches.length} Tesis`,
        indLabel: "RIO",
        capLabel: "RCO",
      })
    );
    textLines.push(``);
  }

  textLines.push(
    `Reaktif limit değerleri: RI/RIO %${IND_LIMIT}, RC/RCO %${CAP_LIMIT}`,
    ``,
    `© ${year} PORTECO — Eco Enerji | info@ecoenerji.net.tr`
  );

  return { subject, html, text: textLines.join("\n") };
}
