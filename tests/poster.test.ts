import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Card, Catalogue } from '../src/types.ts';
import { POSTER_HEIGHT, POSTER_WIDTH, renderPoster } from '../src/poster.ts';

const catalogue = JSON.parse(readFileSync(new URL('../catalog/impersonae-v1.json', import.meta.url), 'utf8')) as Catalogue;
const options = {
  code: 'BIG MATCH #0001',
  question: 'What does the future of design look like?',
  logoUrl: 'brand/impersonae.png',
  baseUrl: 'https://bigmatch.example/big-match/',
  assetBaseUrl: 'http://localhost:5173/big-match/',
};

interface ImageShape { src: string; naturalWidth: number; naturalHeight: number }
interface DrawRecord { src: string; x: number; y: number; width: number; height: number; originalWidth: number; originalHeight: number }
interface TextRecord { text: string; font: string }
interface EnvironmentOptions { failImage?: string; failFont?: boolean; noContext?: boolean; nullBlob?: boolean }

class ContextFixture {
  draws: DrawRecord[] = [];
  texts: TextRecord[] = [];
  font = '10px sans-serif';
  fillStyle: string | { addColorStop: (_position: number, _color: string) => void } = '';
  strokeStyle = '';
  lineWidth = 0;
  textAlign = '';
  textBaseline = '';
  imageSmoothingEnabled = false;
  imageSmoothingQuality = '';
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetY = 0;
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(..._coordinates: number[]): void {}
  lineTo(..._coordinates: number[]): void {}
  quadraticCurveTo(..._coordinates: number[]): void {}
  fill(): void {}
  stroke(): void {}
  fillRect(..._coordinates: number[]): void {}
  createRadialGradient(..._coordinates: number[]): { addColorStop: (_position: number, _color: string) => void } {
    return { addColorStop: () => {} };
  }
  measureText(text: string): { width: number } {
    const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    return { width: Array.from(text).length * size * 0.52 };
  }
  fillText(text: string, _x: number, _y: number, _maxWidth?: number): void {
    this.texts.push({ text, font: this.font });
  }
  drawImage(image: ImageShape, x: number, y: number, width: number, height: number): void {
    this.draws.push({ src: image.src, x, y, width, height, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight });
  }
}

class CanvasFixture {
  width = 0;
  height = 0;
  context = new ContextFixture();
  requestedMime: string | null = null;
  environment: EnvironmentOptions;
  constructor(environment: EnvironmentOptions) { this.environment = environment; }
  getContext(type: string): ContextFixture | null {
    assert.equal(type, '2d');
    return this.environment.noContext ? null : this.context;
  }
  toBlob(callback: (blob: Blob | null) => void, mime: string): void {
    this.requestedMime = mime;
    // This fixture checks the canvas API contract, not native PNG encoding.
    queueMicrotask(() => callback(this.environment.nullBlob ? null : new Blob(['CANVAS_API_FIXTURE'], { type: mime })));
  }
}

interface Environment { canvases: CanvasFixture[]; imageUrls: string[]; fontRequests: string[] }

async function withEnvironment(settings: EnvironmentOptions, run: (environment: Environment) => Promise<void>): Promise<void> {
  const environment: Environment = { canvases: [], imageUrls: [], fontRequests: [] };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  class ImageFixture {
    currentSrc = '';
    naturalWidth = 0;
    naturalHeight = 0;
    crossOrigin = '';
    decoding = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    get src(): string { return this.currentSrc; }
    set src(url: string) {
      this.currentSrc = url;
      environment.imageUrls.push(url);
      const isLogo = url.endsWith('impersonae.png');
      this.naturalWidth = isLogo ? 700 : 435;
      this.naturalHeight = isLogo ? 119 : 640;
      queueMicrotask(() => {
        if (settings.failImage && url.includes(settings.failImage)) this.onerror?.();
        else this.onload?.();
      });
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: ImageFixture });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      fonts: {
        ready: Promise.resolve(),
        load: async (font: string) => {
          environment.fontRequests.push(font);
          if (settings.failFont) throw new Error('Font is unavailable.');
          return [];
        },
      },
      createElement: (tag: string) => {
        assert.equal(tag, 'canvas', 'Renderer should create only its own detached canvas.');
        const canvas = new CanvasFixture(settings);
        environment.canvases.push(canvas);
        return canvas;
      },
      querySelector: () => { throw new Error('Renderer must not read the live poster.'); },
      getElementById: () => { throw new Error('Renderer must not read the live result.'); },
      body: { appendChild: () => { throw new Error('Renderer must not mutate the live DOM.'); } },
    },
  });
  try { await run(environment); }
  finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
}

test('renderer requests a fixed 1080×1920 PNG and contains each full image without using the live DOM', async () => {
  await withEnvironment({}, async environment => {
    const cards = catalogue.cards.slice(0, 3);
    const original = JSON.stringify(cards);
    await renderPoster(cards, options);
    assert.equal(environment.canvases.length, 1);
    const canvas = environment.canvases[0]!;
    assert.deepEqual([canvas.width, canvas.height], [POSTER_WIDTH, POSTER_HEIGHT]);
    assert.deepEqual([POSTER_WIDTH, POSTER_HEIGHT], [1080, 1920]);
    assert.equal(canvas.requestedMime, 'image/png');
    assert.equal(canvas.context.draws.length, 4, 'One original logo and exactly three original card images.');
    for (const draw of canvas.context.draws) {
      assert.ok(Math.abs(draw.width / draw.height - draw.originalWidth / draw.originalHeight) < 1e-10);
      assert.ok(draw.x >= 0 && draw.y >= 0);
      assert.ok(draw.x + draw.width <= POSTER_WIDTH && draw.y + draw.height <= POSTER_HEIGHT);
    }
    assert.equal(JSON.stringify(cards), original);
    assert.deepEqual(environment.fontRequests, ['700 112px "Outfit Variable"']);
  });
});

test('preview assets load from the serving root while the poster prints the canonical public root', async () => {
  await withEnvironment({}, async environment => {
    await renderPoster(catalogue.cards.slice(0, 3), {
      ...options,
      baseUrl: 'https://bigmatch.example/big-match/?private=secret#/r/big-2026/impersonae-v1/1-2-3',
    });
    assert.ok(environment.imageUrls.every(url => url.startsWith('http://localhost:5173/big-match/')));
    assert.equal(environment.imageUrls.length, 4);
    const text = environment.canvases[0]!.context.texts.map(record => record.text).join(' ');
    assert.ok(text.includes('bigmatch.example/big-match/'));
    assert.equal(text.includes('private'), false);
    assert.equal(text.includes('secret'), false);
    assert.equal(text.includes('localhost'), false);
  });
});

test('concurrent poster generations own separate canvases and never mix result snapshots', async () => {
  await withEnvironment({}, async environment => {
    const first = catalogue.cards.slice(0, 3);
    const second = catalogue.cards.slice(10, 13);
    await Promise.all([
      renderPoster(first, { ...options, code: 'BIG MATCH #0001' }),
      renderPoster(second, { ...options, code: 'BIG MATCH #0286' }),
    ]);
    assert.equal(environment.canvases.length, 2);
    const exports = environment.canvases.map(canvas => ({
      cards: canvas.context.draws.filter(draw => draw.src.includes('/cards/')).map(draw => new URL(draw.src).pathname.split('/').at(-1)),
      code: canvas.context.texts.find(record => record.text.startsWith('BIG MATCH #'))?.text,
    }));
    assert.deepEqual(exports, [
      { cards: ['cyborg.jpg', 'diva.jpg', 'exotic.jpg'], code: 'BIG MATCH #0001' },
      { cards: ['otherthinker.jpg', 'chimera.jpg', 'emotional.jpg'], code: 'BIG MATCH #0286' },
    ]);
  });
});

test('failed artwork, unavailable canvas and failed PNG encoding reject instead of producing an incomplete export', async () => {
  await withEnvironment({ failImage: 'exotic.jpg' }, async environment => {
    await assert.rejects(renderPoster(catalogue.cards.slice(0, 3), options), /image could not be loaded/);
    assert.equal(environment.canvases.length, 0);
  });
  await withEnvironment({ noContext: true }, async () => {
    await assert.rejects(renderPoster(catalogue.cards.slice(0, 3), options), /could not create the poster canvas/);
  });
  await withEnvironment({ nullBlob: true }, async () => {
    await assert.rejects(renderPoster(catalogue.cards.slice(0, 3), options), /could not be encoded as a PNG/);
  });
});

test('a missing font uses a readable system fallback and still completes the export', async () => {
  await withEnvironment({ failFont: true }, async environment => {
    await renderPoster(catalogue.cards.slice(0, 3), options);
    assert.equal(environment.canvases[0]!.requestedMime, 'image/png');
    assert.ok(environment.canvases[0]!.context.texts.every(record => record.font.includes('Arial') && !record.font.includes('Outfit')));
  });
});

test('invalid selections and non-catalogue asset paths fail before any image request', async () => {
  await withEnvironment({}, async environment => {
    const cards = catalogue.cards.slice(0, 3);
    const invalid: Card[][] = [cards.slice(0, 2), [cards[0]!, cards[0]!, cards[2]!]];
    for (const image of ['https://tracker.example/card.jpg', '../cards/cyborg.jpg', 'cards/cyborg.jpg?tracker=1', 'cards/cyborg.jpg\n']) {
      invalid.push([{ ...cards[0]!, image }, cards[1]!, cards[2]!]);
    }
    for (const input of invalid) await assert.rejects(renderPoster(input, options));
    await assert.rejects(renderPoster(cards, { ...options, baseUrl: 'javascript:alert(1)' }));
    await assert.rejects(renderPoster(cards, { ...options, baseUrl: 'https://user:secret@example.test/' }));
    assert.equal(environment.imageUrls.length, 0);
    assert.equal(environment.canvases.length, 0);
  });
});
