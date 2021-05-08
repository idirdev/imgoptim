'use strict';

/**
 * @fileoverview Image analysis and optimization suggestion tool.
 * @module imgoptim
 * @author idirdev
 */

const fs = require('fs');
const path = require('path');

/**
 * Known image format signatures (magic bytes).
 * @type {Array<{format:string, bytes:number[], mask?:number[], offset?:number}>}
 */
const FORMAT_SIGNATURES = [
  { format: 'JPEG', bytes: [0xFF, 0xD8, 0xFF] },
  { format: 'PNG',  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { format: 'GIF',  bytes: [0x47, 0x49, 0x46] },
  { format: 'WebP', bytes: [0x52, 0x49, 0x46, 0x46], webp: true },
  { format: 'SVG',  text: '<svg' },
];

/** Supported image file extensions. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

/**
 * Estimated savings percentages when converting to WebP.
 * @type {Object<string,number>}
 */
const SAVINGS_ESTIMATES = {
  PNG:  0.30,
  JPEG: 0.25,
  GIF:  0.35,
  SVG:  0,
  WebP: 0,
};

/**
 * Format a byte count as a human-readable string.
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size string (e.g. "1.23 MB").
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Detect image format from file buffer by inspecting magic bytes.
 * For SVG, falls back to text inspection.
 * @param {Buffer} buf - File buffer (at least 12 bytes recommended).
 * @returns {string} Detected format name or 'Unknown'.
 */
function detectFormat(buf) {
  for (const sig of FORMAT_SIGNATURES) {
    if (sig.text) {
      if (buf.toString('utf8', 0, 32).includes(sig.text)) return sig.format;
      continue;
    }
    if (sig.webp) {
      if (buf.length >= 12 &&
          sig.bytes.every((b, i) => buf[i] === b) &&
          buf.toString('ascii', 8, 12) === 'WEBP') return 'WebP';
      continue;
    }
    if (buf.length >= sig.bytes.length &&
        sig.bytes.every((b, i) => buf[i] === b)) return sig.format;
  }
  return 'Unknown';
}

/**
 * Parse PNG image dimensions from IHDR chunk.
 * IHDR starts at byte 16 (8 signature + 4 length + 4 "IHDR").
 * @param {Buffer} buf - PNG file buffer.
 * @returns {{width:number,height:number}|null}
 */
function parsePNGDimensions(buf) {
  if (buf.length < 24) return null;
  try {
    const width  = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Parse JPEG image dimensions by scanning for SOF0/SOF2 markers.
 * @param {Buffer} buf - JPEG file buffer.
 * @returns {{width:number,height:number}|null}
 */
function parseJPEGDimensions(buf) {
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xFF) break;
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    // SOF markers: 0xC0 (SOF0), 0xC1, 0xC2 contain dimensions
    if (marker >= 0xC0 && marker <= 0xC3) {
      if (offset + 9 < buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width  = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Analyze a single image file and return metadata.
 * @param {string} filePath - Absolute or relative path to the image file.
 * @returns {{file:string, path:string, format:string, size:number, sizeStr:string, dimensions:{width:number,height:number}|null}}
 */
function analyzeImage(filePath) {
  const absPath = path.resolve(filePath);
  const stat    = fs.statSync(absPath);
  const size    = stat.size;
  // Read enough bytes for magic detection and dimension parsing
  const fd      = fs.openSync(absPath, 'r');
  const buf     = Buffer.alloc(Math.min(size, 65536));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const format     = detectFormat(buf);
  let   dimensions = null;

  if (format === 'PNG') {
    dimensions = parsePNGDimensions(buf);
  } else if (format === 'JPEG') {
    dimensions = parseJPEGDimensions(buf);
  }

  return {
    file:       path.basename(absPath),
    path:       absPath,
    format,
    size,
    sizeStr:    formatSize(size),
    dimensions,
  };
}

/**
 * Recursively scan a directory and return analyzed image metadata.
 * @param {string} dir - Directory path to scan.
 * @param {{minSize?:number, recursive?:boolean}} [opts={}] - Scan options.
 * @returns {Array<Object>} Array of image analysis objects.
 */
function scanDir(dir, opts = {}) {
  const { minSize = 0, recursive = true } = opts;
  const results = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          try {
            const info = analyzeImage(full);
            if (info.size >= minSize) results.push(info);
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Suggest optimization strategies for a single image.
 * @param {{format:string, size:number, file:string}} image - Image analysis object.
 * @returns {{suggestions:string[], estimatedSavings:number, estimatedSavingsStr:string}}
 */
function suggestOptimization(image) {
  const suggestions = [];
  const savingsPct  = SAVINGS_ESTIMATES[image.format] || 0;
  const estimated   = Math.round(image.size * savingsPct);

  if (image.format === 'PNG') {
    suggestions.push('Convert to WebP for ~30% size reduction.');
    suggestions.push('Use pngquant or oxipng for lossless compression.');
  } else if (image.format === 'JPEG') {
    suggestions.push('Convert to WebP for ~25% size reduction.');
    suggestions.push('Re-encode at quality 80-85 with mozjpeg for smaller size.');
  } else if (image.format === 'GIF') {
    suggestions.push('Convert animated GIFs to WebP or AVIF for ~35% reduction.');
    suggestions.push('For static frames, convert to PNG or WebP.');
  } else if (image.format === 'WebP') {
    suggestions.push('Already in WebP format. Consider AVIF for further compression.');
  } else if (image.format === 'SVG') {
    suggestions.push('Run svgo to minify SVG and remove metadata.');
  } else {
    suggestions.push('Convert to WebP or AVIF for modern browser support.');
  }

  return {
    suggestions,
    estimatedSavings:    estimated,
    estimatedSavingsStr: formatSize(estimated),
  };
}

/**
 * Compute summary statistics across a set of analyzed images.
 * @param {Array<Object>} images - Array of image analysis objects.
 * @returns {{count:number, totalSize:number, totalSizeStr:string, byFormat:Object, totalPotentialSavings:number, totalPotentialSavingsStr:string}}
 */
function summary(images) {
  const byFormat = {};
  let totalSize     = 0;
  let totalSavings  = 0;

  for (const img of images) {
    totalSize += img.size;
    byFormat[img.format] = (byFormat[img.format] || 0) + 1;
    const pct = SAVINGS_ESTIMATES[img.format] || 0;
    totalSavings += Math.round(img.size * pct);
  }

  return {
    count:                   images.length,
    totalSize,
    totalSizeStr:            formatSize(totalSize),
    byFormat,
    totalPotentialSavings:   totalSavings,
    totalPotentialSavingsStr: formatSize(totalSavings),
  };
}

/**
 * Format an array of image analyses into a human-readable report string.
 * @param {Array<Object>} images - Image analysis objects.
 * @param {{suggest?:boolean}} [opts={}] - Report options.
 * @returns {string} Formatted report.
 */
function formatReport(images, opts = {}) {
  if (images.length === 0) return 'No images found.';
  const lines = [];
  lines.push(`Image Analysis Report (${images.length} file${images.length !== 1 ? 's' : ''})`);
  lines.push('='.repeat(60));

  for (const img of images) {
    lines.push(`${img.file}`);
    lines.push(`  Path:    ${img.path}`);
    lines.push(`  Format:  ${img.format}`);
    lines.push(`  Size:    ${img.sizeStr}`);
    if (img.dimensions) {
      lines.push(`  Dimensions: ${img.dimensions.width}x${img.dimensions.height}`);
    }
    if (opts.suggest) {
      const opt = suggestOptimization(img);
      lines.push(`  Optimization:`);
      for (const s of opt.suggestions) lines.push(`    • ${s}`);
      if (opt.estimatedSavings > 0) {
        lines.push(`  Estimated savings: ${opt.estimatedSavingsStr}`);
      }
    }
    lines.push('');
  }

  const sum = summary(images);
  lines.push('Summary');
  lines.push('-'.repeat(40));
  lines.push(`Total files:     ${sum.count}`);
  lines.push(`Total size:      ${sum.totalSizeStr}`);
  lines.push(`By format:       ${Object.entries(sum.byFormat).map(([k, v]) => k + ':' + v).join(', ')}`);
  if (sum.totalPotentialSavings > 0) {
    lines.push(`Potential savings: ${sum.totalPotentialSavingsStr}`);
  }

  return lines.join('\n');
}

module.exports = {
  analyzeImage,
  scanDir,
  suggestOptimization,
  formatReport,
  formatSize,
  summary,
  detectFormat,
};
