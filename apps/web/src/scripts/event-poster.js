// Affiche d'une soirée Zola : le nom de l'endroit en grand, l'info d'entrée,
// et le code QR en bas sur une carte blanche. Format A (1 x 1,414), 1240 x
// 1754 px : net en A5 et correct en A4. Même langage que le site public
// (fond sombre, halo rose et orange, Montserrat très gras en capitales).
import QRCode from 'qrcode';

export const POSTER_W = 1240;
export const POSTER_H = 1754;

const FLAME_A = '#fd267a';
const FLAME_B = '#ff6036';
const DARK = '#101113';

// Les tracés de l'empreinte du logo (viewBox 24 x 24), les mêmes que l'icône
// du site.
const FINGERPRINT = [
  'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4',
  'M14 13.12c0 2.38 0 6.38-1 8.88',
  'M17.29 21.02c.12-.6.43-2.3.5-3.02',
  'M2 12a10 10 0 0 1 18-6',
  'M2 16h.01',
  'M21.8 16c.2-2 .131-5.354 0-6',
  'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2',
  'M8.65 22c.21-.66.45-1.32.57-2',
  'M9 6.8a6 6 0 0 1 9 5.2v2',
];

function flame(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, FLAME_A);
  g.addColorStop(1, FLAME_B);
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Le logo : carré arrondi en dégradé flamme, empreinte blanche.
function drawMark(ctx, x, y, size) {
  ctx.save();
  roundRect(ctx, x, y, size, size, size * 0.26);
  ctx.fillStyle = flame(ctx, x, y + size, x + size, y);
  ctx.fill();
  const inner = size * 0.62;
  const s = inner / 24;
  ctx.translate(x + (size - inner) / 2, y + (size - inner) / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of FINGERPRINT) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function setFont(ctx, weight, px, spacing = 0) {
  ctx.font = `${weight} ${px}px Montserrat, "Segoe UI", Arial, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * px}px`;
}

// Coupe un texte en lignes qui tiennent dans maxWidth.
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// Le plus grand corps de titre qui tient en 3 lignes au maximum.
function fitTitle(ctx, text, maxWidth) {
  for (let px = 120; px >= 60; px -= 4) {
    setFont(ctx, 900, px, -0.02);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= 3 && widest <= maxWidth) return { px, lines };
  }
  setFont(ctx, 900, 60, -0.02);
  return { px: 60, lines: wrap(ctx, text, maxWidth).slice(0, 4) };
}

/**
 * Dessine l'affiche dans le canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ title: string, info?: string, token: string }} opts
 */
export async function drawEventPoster(canvas, { title, info, token }) {
  // Le canvas n'attend pas la police : sans ce chargement, la première
  // affiche sortirait en police système.
  await Promise.all([
    document.fonts.load('900 100px Montserrat'),
    document.fonts.load('700 40px Montserrat'),
  ]).catch(() => {});

  const W = POSTER_W;
  const H = POSTER_H;
  const PAD = 96;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fond : sombre, halo rose en haut à droite, orange en bas à gauche.
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, W, H);
  const halo = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(16, 17, 19, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  halo(W * 0.92, H * 0.02, 980, 'rgba(253, 38, 122, 0.62)');
  halo(W * 0.02, H * 0.62, 820, 'rgba(255, 96, 54, 0.28)');

  // Marque
  drawMark(ctx, PAD, PAD, 92);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  setFont(ctx, 900, 58, 0.04);
  ctx.fillText('ZOLA', PAD + 92 + 26, PAD + 48);

  // Accroche
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 800, 30, 0.12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fillText('CE SOIR, ON SE RENCONTRE ICI', PAD, 300);

  // Nom de l'endroit
  const maxW = W - PAD * 2;
  const { px, lines } = fitTitle(ctx, String(title || '').toUpperCase(), maxW);
  const lh = px * 1.02;
  let y = 300 + 36 + px * 0.9;
  ctx.fillStyle = '#fff';
  for (const line of lines) {
    ctx.fillText(line, PAD, y);
    y += lh;
  }

  // Trait flamme sous le titre, puis l'info d'entrée
  const lastBaseline = y - lh;
  const barY = lastBaseline + 40;
  roundRect(ctx, PAD, barY, 120, 10, 5);
  ctx.fillStyle = flame(ctx, PAD, 0, PAD + 120, 0);
  ctx.fill();
  if (info) {
    setFont(ctx, 600, 40, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    let iy = barY + 10 + 62;
    for (const l of wrap(ctx, info, maxW).slice(0, 2)) { ctx.fillText(l, PAD, iy); iy += 54; }
  }

  // Carte blanche du code QR, en bas
  const cardW = 700;
  const qrSize = 520;
  const cardH = 48 + qrSize + 36 + 44 + 40 + 48;
  const cardX = (W - cardW) / 2;
  const cardY = H - PAD - cardH;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, `zola://event/${token}`, {
    width: qrSize, margin: 0, errorCorrectionLevel: 'H',
    color: { dark: DARK, light: '#ffffff' },
  });
  const qrX = (W - qrSize) / 2;
  const qrY = cardY + 48;
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  // Le logo au centre du code (correction d'erreur H : le code reste lisible)
  const hole = 116;
  roundRect(ctx, W / 2 - hole / 2, qrY + qrSize / 2 - hole / 2, hole, hole, 26);
  ctx.fillStyle = '#fff';
  ctx.fill();
  drawMark(ctx, W / 2 - 46, qrY + qrSize / 2 - 46, 92);

  // Légende
  ctx.textAlign = 'center';
  ctx.fillStyle = DARK;
  setFont(ctx, 900, 40, 0.02);
  ctx.fillText("SCANNE AVEC L'APP ZOLA", W / 2, qrY + qrSize + 36 + 40);
  setFont(ctx, 600, 28, 0.02);
  ctx.fillStyle = '#656a78';
  ctx.fillText('Et vois qui est là ce soir · zola-rdc.com', W / 2, qrY + qrSize + 36 + 40 + 44);
  ctx.textAlign = 'left';
}

// Le code QR seul, en grand, pour ceux qui veulent l'intégrer à leur propre
// visuel.
export async function drawQrOnly(canvas, token) {
  await QRCode.toCanvas(canvas, `zola://event/${token}`, {
    width: 1024, margin: 2, errorCorrectionLevel: 'H',
    color: { dark: DARK, light: '#ffffff' },
  });
}

export function posterFileName(title) {
  const slug = String(title || 'soiree').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'soiree';
}
