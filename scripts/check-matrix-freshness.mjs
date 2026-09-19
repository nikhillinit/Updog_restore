#!/usr/bin/env node
import fs from 'node:fs';
import console from 'node:console';
import process from 'node:process';

import { renderMatrix, renderPath } from '../audit/surface-contract-matrix/scripts/render-matrix.mjs';

const expected = renderMatrix();
const committed = fs.readFileSync(renderPath, 'utf8');

if (committed === expected) {
  console.log('MATRIX.md is fresh.');
  process.exit(0);
}

console.error('MATRIX.md is stale -- committed content does not match renderMatrix() output.');
console.error('Run:  node audit/surface-contract-matrix/scripts/render-matrix.mjs');
process.exit(1);
