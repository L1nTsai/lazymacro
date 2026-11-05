// Renders the app icons into public/icons. Run with: node scripts/generate-icons.mjs
import sharp from "sharp";

const mark = (size, inset) => {
  const c = size / 2;
  const r = size * (0.5 - inset);
  const stroke = size * 0.11;
  const circumference = 2 * Math.PI * r;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#000"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#333" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fff" stroke-width="${stroke}"
      stroke-dasharray="${circumference * 0.68} ${circumference}" transform="rotate(-90 ${c} ${c})"/>
  </svg>`);
};

for (const [name, size, inset] of [
  ["icon-192.png", 192, 0.24],
  ["icon-512.png", 512, 0.24],
  ["maskable-512.png", 512, 0.3],
  ["apple-touch-icon.png", 180, 0.24],
]) {
  await sharp(mark(size, inset)).png().toFile(`public/icons/${name}`);
}
