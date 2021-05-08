'use strict';

/**
 * @fileoverview Tests for imgoptim package.
 * @author idirdev
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const {
  analyzeImage,
  detectFormat,
  formatSize,
  suggestOptimization,
  summary,
  scanDir,
} = require('../src/index.js');

/** Create a temp file with given bytes and return its path. */
function makeTempFile(name, bytes) {
  const p = path.join(os.tmpdir(), 'imgoptim-test-' + name);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}

test('detectFormat: identifies JPEG by magic bytes', () => {
  const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  assert.equal(detectFormat(buf), 'JPEG');
});

test('detectFormat: identifies PNG by magic bytes', () => {
  const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  assert.equal(detectFormat(buf), 'PNG');
});

test('detectFormat: identifies GIF by magic bytes', () => {
  const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  assert.equal(detectFormat(buf), 'GIF');
});

test('detectFormat: identifies WebP by RIFF+WEBP signature', () => {
  const buf = Buffer.alloc(12);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(0, 4);
  buf.write('WEBP', 8, 'ascii');
  assert.equal(detectFormat(buf), 'WebP');
});

test('detectFormat: identifies SVG by text content', () => {
  const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(detectFormat(buf), 'SVG');
});

test('detectFormat: returns Unknown for random bytes', () => {
  const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert.equal(detectFormat(buf), 'Unknown');
});

test('formatSize: formats bytes correctly', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(1024), '1.00 KB');
  assert.equal(formatSize(1536), '1.50 KB');
  assert.equal(formatSize(1048576), '1.00 MB');
});

test('analyzeImage: detects PNG format from real file', () => {
  // Minimal valid PNG: signature + IHDR chunk
  const pngSig  = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  // IHDR: length=13, type=IHDR, width=100, height=50, bitdepth=8, colortype=2, compress=0, filter=0, interlace=0, crc=0
  const ihdrLen = [0x00, 0x00, 0x00, 0x0D];
  const ihdrType= [0x49, 0x48, 0x44, 0x52];
  const width   = [0x00, 0x00, 0x00, 0x64]; // 100
  const height  = [0x00, 0x00, 0x00, 0x32]; // 50
  const rest    = [0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const bytes   = [...pngSig, ...ihdrLen, ...ihdrType, ...width, ...height, ...rest];
  const p = makeTempFile('test.png', bytes);
  try {
    const info = analyzeImage(p);
    assert.equal(info.format, 'PNG');
    assert.deepEqual(info.dimensions, { width: 100, height: 50 });
    assert.ok(info.size > 0);
  } finally {
    fs.unlinkSync(p);
  }
});

test('suggestOptimization: PNG suggests WebP conversion', () => {
  const opt = suggestOptimization({ format: 'PNG', size: 100000, file: 'test.png' });
  assert.ok(opt.suggestions.some(s => s.includes('WebP')));
  assert.ok(opt.estimatedSavings > 0);
});

test('suggestOptimization: WebP has zero estimated savings', () => {
  const opt = suggestOptimization({ format: 'WebP', size: 50000, file: 'test.webp' });
  assert.equal(opt.estimatedSavings, 0);
});

test('summary: aggregates counts and sizes correctly', () => {
  const images = [
    { format: 'PNG',  size: 100000 },
    { format: 'PNG',  size: 200000 },
    { format: 'JPEG', size: 150000 },
  ];
  const s = summary(images);
  assert.equal(s.count, 3);
  assert.equal(s.totalSize, 450000);
  assert.equal(s.byFormat.PNG, 2);
  assert.equal(s.byFormat.JPEG, 1);
  assert.ok(s.totalPotentialSavings > 0);
});

test('scanDir: finds images in directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgoptim-scan-'));
  // Write a PNG file
  const pngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x0A,
                    0x08, 0x02, 0x00, 0x00, 0x00];
  fs.writeFileSync(path.join(dir, 'image.png'), Buffer.from(pngBytes));
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'not an image');
  try {
    const results = scanDir(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].format, 'PNG');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
