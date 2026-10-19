// Renders assets/icon.svg to the PNG icons iOS and the manifest need.
// Run with: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = "assets/icon.svg";
const out = [
  ["public/icons/apple-touch-icon.png", 180, 1],
  ["public/icons/icon-192.png", 192, 1],
  ["public/icons/icon-512.png", 512, 1],
  // Maskable icons get cropped to a circle on Android; keep the glyph in the safe zone.
  ["public/icons/icon-maskable-512.png", 512, 0.8],
];
for (const [file, size, scale] of out) {
  const inner = Math.round(size * scale);
  const glyph = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#2A5FF0" } })
    .composite([{ input: glyph, gravity: "centre" }])
    .png()
    .toFile(file);
  console.log(file);
}
