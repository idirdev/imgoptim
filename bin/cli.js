#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI for imgoptim - image analysis and optimization suggestions.
 * @author idirdev
 */

const path = require('path');
const { scanDir, analyzeImage, formatReport, summary } = require('../src/index.js');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: imgoptim <dir> [--format table|json] [--min-size <bytes>] [--suggest]');
  console.log('');
  console.log('Options:');
  console.log('  --format table|json   Output format (default: table)');
  console.log('  --min-size <size>     Minimum file size in bytes (default: 0)');
  console.log('  --suggest             Include optimization suggestions');
  console.log('  -h, --help            Show this help message');
  process.exit(0);
}

const dir     = args[0];
let format    = 'table';
let minSize   = 0;
let suggest   = false;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) {
    format = args[++i];
  } else if (args[i] === '--min-size' && args[i + 1]) {
    const raw = args[++i];
    if (raw.endsWith('KB')) minSize = parseFloat(raw) * 1024;
    else if (raw.endsWith('MB')) minSize = parseFloat(raw) * 1024 * 1024;
    else minSize = parseInt(raw, 10);
  } else if (args[i] === '--suggest') {
    suggest = true;
  }
}

const images = scanDir(dir, { minSize });

if (format === 'json') {
  console.log(JSON.stringify({ images, summary: summary(images) }, null, 2));
} else {
  console.log(formatReport(images, { suggest }));
}
