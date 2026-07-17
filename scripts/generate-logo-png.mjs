// scripts/generate-logo-png.mjs
//
// PortEco yatay SVG logosunu ExcelJS'in gömebileceği PNG'ye çevirir.
// (ExcelJS addImage yalnız png/jpeg/gif kabul eder; SVG desteklenmez.)
//
// sharp kalıcı bir bağımlılık DEĞİLDİR — yeniden üretmek için:
//   npm i -D sharp && node scripts/generate-logo-png.mjs && npm un sharp
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svgPath = fileURLToPath(
  new URL("../src/assets/porteco-logo-horizontal.svg", import.meta.url),
);
const outPath = fileURLToPath(
  new URL("../src/assets/porteco-logo-horizontal.png", import.meta.url),
);

const svg = await readFile(svgPath);

// density: SVG'yi yüksek çözünürlükte rasterize et ki resize küçültme olsun
// (büyütme bulanıklaştırır). Hedef yükseklik 160px = Excel'deki 40px
// görünümün 4 katı; genişlik en-boy oranından otomatik (~530px).
await sharp(svg, { density: 300 })
  .resize({ height: 160 })
  .png()
  .toFile(outPath);

console.log("Yazıldı:", outPath);
