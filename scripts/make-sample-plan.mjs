/**
 * Generates a synthetic UK semi-detached ground-floor plan for testing the
 * import pipeline end to end.
 *
 * It is drawn from exact millimetre coordinates, so the printed dimensions and
 * the drawn geometry agree perfectly. That makes it a fair test of calibration
 * (a correct scale should show 0.0% error on every printed dimension) but a
 * flattering one of extraction — a real scanned survey is messier, and this
 * file deliberately says so on its face.
 *
 * Run: npm run sample:plan
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const PX_PER_MM = 0.12;
const MARGIN_PX = 150;

// Building envelope, external face to external face.
const W = 8400;
const D = 9000;
const EXT = 300; // external wall thickness
const INT = 100; // internal partition thickness
const GAR = 200; // house-to-garage wall

const px = (mm) => mm * PX_PER_MM;
const X = (mm) => MARGIN_PX + px(mm);
const Y = (mm) => MARGIN_PX + px(mm);

const width = Math.round(px(W) + MARGIN_PX * 2);
const height = Math.round(px(D) + MARGIN_PX * 2 + 90);

const parts = [];
const wall = (x, y, w, h) =>
  parts.push(
    `<rect x="${X(x)}" y="${Y(y)}" width="${px(w)}" height="${px(h)}" fill="#2b2b2b"/>`,
  );

// External envelope (left wall is the party wall of the semi).
wall(0, 0, W, EXT); // front
wall(0, D - EXT, W, EXT); // rear
wall(0, 0, EXT, D); // party wall, left
wall(W - EXT, 0, EXT, D); // right

// Integral garage, right-hand side, 6000 deep.
wall(5800, 0, GAR, 6000);
wall(6000, 5800, W - EXT - 6000, GAR);

// Main house partitions.
wall(3400, EXT, INT, 4200); // hall / living room
wall(EXT, 4400, 5800 - EXT, INT); // hall / kitchen-diner
wall(3500, 3300, 1200, INT); // WC front wall
wall(4600, 3400, INT, 1000); // WC side wall

// --- openings: white gaps punched through the wall, plus symbols ----------
const gap = (x, y, w, h) =>
  parts.push(
    `<rect x="${X(x)}" y="${Y(y)}" width="${px(w)}" height="${px(h)}" fill="#ffffff"/>`,
  );

const windowSymbol = (x, y, w, h) => {
  gap(x, y, w, h);
  const horizontal = w > h;
  const mid = horizontal ? y + h / 2 : x + w / 2;
  parts.push(
    horizontal
      ? `<line x1="${X(x)}" y1="${Y(mid)}" x2="${X(x + w)}" y2="${Y(mid)}" stroke="#2b2b2b" stroke-width="1.4"/>`
      : `<line x1="${X(mid)}" y1="${Y(y)}" x2="${X(mid)}" y2="${Y(y + h)}" stroke="#2b2b2b" stroke-width="1.4"/>`,
  );
  parts.push(
    `<rect x="${X(x)}" y="${Y(y)}" width="${px(w)}" height="${px(h)}" fill="none" stroke="#2b2b2b" stroke-width="1.2"/>`,
  );
};

/** Door: gap, leaf line and swing arc, so the extractor has a real symbol. */
const doorSymbol = (x, y, w, h, hingeX, hingeY, sweepFlag) => {
  gap(x, y, w, h);
  const leaf = Math.max(w, h);
  const endX = hingeX + (w > h ? 0 : leaf);
  const endY = hingeY + (w > h ? leaf : 0);
  parts.push(
    `<line x1="${X(hingeX)}" y1="${Y(hingeY)}" x2="${X(endX)}" y2="${Y(endY)}" stroke="#2b2b2b" stroke-width="1.4"/>`,
  );
  const arcEndX = hingeX + (w > h ? leaf : 0);
  const arcEndY = hingeY + (w > h ? 0 : leaf);
  parts.push(
    `<path d="M ${X(endX)} ${Y(endY)} A ${px(leaf)} ${px(leaf)} 0 0 ${sweepFlag} ${X(arcEndX)} ${Y(arcEndY)}" fill="none" stroke="#2b2b2b" stroke-width="1" stroke-dasharray="4 3"/>`,
  );
};

// Front elevation (y = 0).
windowSymbol(700, 0, 2200, EXT); // living room window
doorSymbol(4300, 0, 900, EXT, 4300, 0, 1); // front door
gap(6000, 0, 2100, EXT); // garage door
parts.push(
  `<rect x="${X(6000)}" y="${Y(0)}" width="${px(2100)}" height="${px(EXT)}" fill="none" stroke="#2b2b2b" stroke-width="1.2"/>`,
  `<line x1="${X(6000)}" y1="${Y(EXT / 2)}" x2="${X(8100)}" y2="${Y(EXT / 2)}" stroke="#2b2b2b" stroke-width="1.4"/>`,
);

// Rear elevation (y = D).
windowSymbol(600, D - EXT, 1800, EXT); // kitchen window
gap(3400, D - EXT, 1800, EXT); // french doors
parts.push(
  `<rect x="${X(3400)}" y="${Y(D - EXT)}" width="${px(1800)}" height="${px(EXT)}" fill="none" stroke="#2b2b2b" stroke-width="1.2"/>`,
  `<line x1="${X(4300)}" y1="${Y(D - EXT)}" x2="${X(4300)}" y2="${Y(D)}" stroke="#2b2b2b" stroke-width="1.2"/>`,
);

// Internal doors.
doorSymbol(3400, 1200, INT, 800, 3400, 1200, 1); // hall -> living room
doorSymbol(3700, 3300, 800, INT, 3700, 3300, 1); // hall -> WC
doorSymbol(2400, 4400, 900, INT, 2400, 4400, 0); // hall -> kitchen/diner
doorSymbol(6400, 5800, 800, GAR, 6400, 5800, 0); // garage -> rear

// --- stairs in the hall, 13 treads going up towards the front ------------
const stairX = 4750;
const stairW = 900;
const stairTop = 700;
const treadDepth = 200;
parts.push(
  `<rect x="${X(stairX)}" y="${Y(stairTop)}" width="${px(stairW)}" height="${px(treadDepth * 13)}" fill="none" stroke="#2b2b2b" stroke-width="1.2"/>`,
);
for (let i = 1; i < 13; i++) {
  const y = stairTop + i * treadDepth;
  parts.push(
    `<line x1="${X(stairX)}" y1="${Y(y)}" x2="${X(stairX + stairW)}" y2="${Y(y)}" stroke="#2b2b2b" stroke-width="1"/>`,
  );
}
parts.push(
  `<line x1="${X(stairX + stairW / 2)}" y1="${Y(stairTop + treadDepth * 13)}" x2="${X(stairX + stairW / 2)}" y2="${Y(stairTop + 250)}" stroke="#2b2b2b" stroke-width="1.2"/>`,
  `<path d="M ${X(stairX + stairW / 2)} ${Y(stairTop + 150)} l -${px(250)} ${px(250)} l ${px(500)} 0 z" fill="#2b2b2b"/>`,
  `<text x="${X(stairX - 450)}" y="${Y(2200)}" font-family="Helvetica, Arial" font-size="13" fill="#2b2b2b">UP</text>`,
);

// --- room labels ----------------------------------------------------------
const label = (text, x, y, size = 15) =>
  parts.push(
    `<text x="${X(x)}" y="${Y(y)}" font-family="Helvetica, Arial" font-size="${size}" fill="#2b2b2b" text-anchor="middle">${text}</text>`,
  );

label("LIVING ROOM", 1850, 2400);
label("HALL", 4000, 2000);
label("WC", 4050, 3950, 12);
label("KITCHEN / DINER", 3000, 6600);
label("GARAGE", 7050, 3000);

// --- printed dimensions ---------------------------------------------------
const dimStroke = `stroke="#8a2f2f" stroke-width="1.1"`;
const tick = (x, y, vertical) =>
  vertical
    ? `<line x1="${X(x) - 5} " y1="${Y(y)}" x2="${X(x) + 5}" y2="${Y(y)}" ${dimStroke}/>`
    : `<line x1="${X(x)}" y1="${Y(y) - 5}" x2="${X(x)}" y2="${Y(y) + 5}" ${dimStroke}/>`;

const hDim = (x1, x2, y, text) => {
  parts.push(
    `<line x1="${X(x1)}" y1="${Y(y)}" x2="${X(x2)}" y2="${Y(y)}" ${dimStroke}/>`,
    tick(x1, y, false),
    tick(x2, y, false),
    `<text x="${X((x1 + x2) / 2)}" y="${Y(y) - 7}" font-family="Helvetica, Arial" font-size="14" fill="#8a2f2f" text-anchor="middle">${text}</text>`,
  );
};

const vDim = (y1, y2, x, text) => {
  parts.push(
    `<line x1="${X(x)}" y1="${Y(y1)}" x2="${X(x)}" y2="${Y(y2)}" ${dimStroke}/>`,
    tick(x, y1, true),
    tick(x, y2, true),
    `<text x="${X(x) - 8}" y="${Y((y1 + y2) / 2)}" font-family="Helvetica, Arial" font-size="14" fill="#8a2f2f" text-anchor="middle" transform="rotate(-90 ${X(x) - 8} ${Y((y1 + y2) / 2)})">${text}</text>`,
  );
};

hDim(0, W, -700, "8,400"); // overall width
hDim(EXT, 3400, -250, "3,100"); // living room internal width
vDim(0, D, -700, "9,000"); // overall depth
vDim(4500, D - EXT, -250, "4,200"); // kitchen/diner internal depth

// --- title block ----------------------------------------------------------
const titleY = height - 55;
parts.push(
  `<line x1="${MARGIN_PX}" y1="${titleY - 28}" x2="${width - MARGIN_PX}" y2="${titleY - 28}" stroke="#2b2b2b" stroke-width="1"/>`,
  `<text x="${MARGIN_PX}" y="${titleY}" font-family="Helvetica, Arial" font-size="15" fill="#2b2b2b">SAMPLE — GROUND FLOOR — SEMI-DETACHED (SYNTHETIC TEST DRAWING, NOT A SURVEY)</text>`,
  `<text x="${MARGIN_PX}" y="${titleY + 20}" font-family="Helvetica, Arial" font-size="13" fill="#8a2f2f">NOT TO A PAPER SCALE — CALIBRATE FROM A PRINTED DIMENSION. ALL DIMENSIONS IN MILLIMETRES.</text>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${parts.join("\n")}
</svg>`;

const outDir = join(process.cwd(), "public", "sample");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sample-ground-floor.svg"), svg);
await sharp(Buffer.from(svg))
  .png()
  .toFile(join(outDir, "sample-ground-floor.png"));

console.log(
  `[make-sample-plan] wrote public/sample/sample-ground-floor.{svg,png} (${width}x${height}px, ${PX_PER_MM} px/mm)`,
);
console.log(
  `[make-sample-plan] true scale: 1px = ${(1 / PX_PER_MM).toFixed(4)}mm — calibrate on the 8,400 dimension and expect ~0.0% error.`,
);
