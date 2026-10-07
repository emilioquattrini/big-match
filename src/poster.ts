import type { Card } from './types.ts';
import { canonicalTrio } from './domain.ts';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1920;

export interface PosterOptions {
  /** Displayed verbatim, for example "BIG MATCH #0001". */
  code: string;
  question: string;
  logoUrl: string;
  /** Canonical app root displayed in the image, without a private/session URL. */
  baseUrl: string;
  /** Local serving root when a preview uses a different canonical public URL. */
  assetBaseUrl?: string;
}

const PALETTE = {
  cream: '#F7F4EE',
  ink: '#171717',
  muted: '#59534F',
  pink: '#F15C9A',
};
const OUTFIT = '"Outfit Variable", Arial, sans-serif';
const FALLBACK = 'Arial, sans-serif';
const IMAGE_TIMEOUT_MS = 15_000;
const CARD_PATH = /^cards\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|jpeg|png|webp)$/;

function textValue(value: string, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return value.trim().replace(/\s+/g, ' ');
}

function appRoot(value: string): URL {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Poster URLs must use HTTP or HTTPS without credentials.');
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('A poster image took too long to load.')), IMAGE_TIMEOUT_MS);
    image.onload = () => {
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        finish(new Error('A poster image has no readable dimensions.'));
      } else finish();
    };
    image.onerror = () => finish(new Error('A poster image could not be loaded. Please try again.'));
    image.src = url;
  });
}

async function posterFont(): Promise<string> {
  if (!document.fonts) return FALLBACK;
  try {
    await document.fonts.ready;
    await document.fonts.load('700 112px "Outfit Variable"');
    return OUTFIT;
  } catch {
    // A missing font must never prevent the user from exporting their result.
    return FALLBACK;
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function backgroundGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(247,244,238,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
}

/** Draw every source pixel: preserve aspect ratio without cropping the art. */
function containImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number, y: number, width: number, height: number,
): void {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = '';
    // Long hostnames/words must not overflow the fixed Story artboard.
    for (const character of Array.from(word)) {
      if (current && ctx.measureText(current + character).width > width) {
        lines.push(current);
        current = character;
      } else current += character;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface TextBox {
  top: number;
  width: number;
  height: number;
  maxFont: number;
  minFont: number;
  maxLines: number;
  weight?: number;
  color?: string;
}

function drawTextBox(ctx: CanvasRenderingContext2D, text: string, font: string, box: TextBox): void {
  let size = box.maxFont;
  let lines: string[] = [];
  for (; size >= box.minFont; size -= 2) {
    ctx.font = `${box.weight ?? 500} ${size}px ${font}`;
    lines = wrapLines(ctx, text, box.width);
    if (lines.length <= box.maxLines && lines.length * size * 1.18 <= box.height) break;
  }
  if (size < box.minFont) {
    size = box.minFont;
    ctx.font = `${box.weight ?? 500} ${size}px ${font}`;
    lines = wrapLines(ctx, text, box.width);
  }
  const allowedLines = Math.min(box.maxLines, Math.max(1, Math.floor(box.height / (size * 1.18))));
  if (lines.length > allowedLines) {
    lines = lines.slice(0, allowedLines);
    let last = lines.at(-1) ?? '';
    while (last && ctx.measureText(`${last}…`).width > box.width) last = Array.from(last).slice(0, -1).join('');
    lines[lines.length - 1] = `${last}…`;
  }
  ctx.fillStyle = box.color ?? PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = size * 1.18;
  const firstBaseline = box.top + (box.height - (lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, POSTER_WIDTH / 2, firstBaseline + index * lineHeight, box.width));
}

/**
 * Render an independent, fixed-size PNG from the completed result's snapshot.
 * Creates no DOM nodes in the live page and never shares or downloads anything.
 * Every invocation owns its images/canvas; the caller may cache the returned blob.
 */
export async function renderPoster(cards: readonly Card[], options: PosterOptions): Promise<Blob> {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !card)) {
    throw new TypeError('A poster requires exactly three cards.');
  }
  canonicalTrio(cards.map(card => card.id));
  const names = cards.map(card => textValue(card.name, 'card name', 80));
  const code = textValue(options.code, 'combination code', 80);
  const question = textValue(options.question, 'question', 500);
  const publicRoot = appRoot(options.baseUrl);
  const assetRoot = appRoot(options.assetBaseUrl ?? options.baseUrl);
  const cardUrls = cards.map(card => {
    if (typeof card.image !== 'string' || CARD_PATH.exec(card.image)?.[0] !== card.image) {
      throw new TypeError('A card image must be an available app-relative card asset.');
    }
    return new URL(card.image, assetRoot).href;
  });
  const logo = new URL(textValue(options.logoUrl, 'logo URL', 2048), assetRoot);
  if (!['http:', 'https:'].includes(logo.protocol) || logo.username || logo.password) {
    throw new TypeError('Invalid poster logo URL.');
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Poster export requires a browser with canvas support.');
  }
  const [font, images] = await Promise.all([
    posterFont(),
    Promise.all([...cardUrls, logo.href].map(loadImage)),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the poster canvas.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  backgroundGlow(ctx, 1000, 660, 650, 'rgba(104,205,220,0.14)');
  backgroundGlow(ctx, 0, 1280, 700, 'rgba(241,92,154,0.10)');
  backgroundGlow(ctx, 850, 1900, 580, 'rgba(184,165,231,0.13)');

  // Original white Impersonae logo on the established pink brand header.
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, 0, POSTER_WIDTH, 190);
  containImage(ctx, images[3]!, 200, 37, 680, 116);

  drawTextBox(ctx, code, font, { top: 236, width: 900, height: 48, maxFont: 28, minFont: 24, maxLines: 1, weight: 700 });
  drawTextBox(ctx, 'YOUR', font, { top: 302, width: 940, height: 136, maxFont: 116, minFont: 100, maxLines: 1, weight: 700 });
  drawTextBox(ctx, 'BIG MATCH.', font, { top: 426, width: 964, height: 136, maxFont: 116, minFont: 100, maxLines: 1, weight: 700 });
  drawTextBox(ctx, question, font, { top: 572, width: 878, height: 116, maxFont: 38, minFont: 30, maxLines: 3 });

  ctx.save();
  ctx.shadowColor = 'rgba(31,25,21,0.08)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  roundedRect(ctx, 52, 730, 976, 536, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.76)';
  ctx.fill();
  ctx.restore();
  images.slice(0, 3).forEach((image, index) => {
    containImage(ctx, image, 80 + index * 316, 784, 288, 426);
  });

  drawTextBox(ctx, names.join(' × '), font, { top: 1300, width: 920, height: 118, maxFont: 48, minFont: 36, maxLines: 2, weight: 700 });
  drawTextBox(ctx, "WHAT’S YOUR #BIGMATCH?", font, { top: 1468, width: 920, height: 54, maxFont: 36, minFont: 30, maxLines: 1, weight: 700 });
  drawTextBox(ctx, 'Find your three cards.', font, { top: 1538, width: 900, height: 42, maxFont: 28, minFont: 24, maxLines: 1, color: PALETTE.muted });
  const publicAddress = `${publicRoot.host}${publicRoot.pathname}`;
  drawTextBox(ctx, publicAddress, font, { top: 1596, width: 900, height: 92, maxFont: 32, minFont: 24, maxLines: 2, weight: 700 });

  ctx.strokeStyle = 'rgba(23,23,23,0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(114, 1740);
  ctx.lineTo(966, 1740);
  ctx.stroke();
  drawTextBox(ctx, 'Impersonae by @chiarazhu_ · #BIGMilano', font, { top: 1780, width: 900, height: 56, maxFont: 25, minFont: 22, maxLines: 1, color: PALETTE.muted });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob?.type === 'image/png' && blob.size > 0) resolve(blob);
      else reject(new Error('The poster could not be encoded as a PNG. Please try again.'));
    }, 'image/png');
  });
}
