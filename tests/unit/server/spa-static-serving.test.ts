import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../vite.config', () => ({ default: {} }));

import { serveStatic } from '../../../server/vite';

let tempRoot: string | undefined;

afterEach(async () => {
  const directory = tempRoot;
  tempRoot = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('serveStatic', () => {
  it('serves SPA routes from a build nested under a hidden worktree path', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'updog-spa-static-'));
    const distPath = path.join(tempRoot, '.codex', 'worktrees', 'demo', 'dist', 'public');
    await mkdir(path.join(distPath, 'assets'), { recursive: true });
    await writeFile(path.join(distPath, 'index.html'), '<html>connected demo</html>');
    await writeFile(path.join(distPath, 'assets', 'app.js'), 'window.demo = true;');
    await writeFile(path.join(distPath, '.secret'), 'do not disclose');

    const app = express();
    serveStatic(app, distPath);

    const spa = await request(app).get('/login/deep');
    expect(spa.status).toBe(200);
    expect(spa.text).toContain('connected demo');

    const asset = await request(app).get('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toBe('window.demo = true;');

    const hiddenFile = await request(app).get('/.secret');
    expect(hiddenFile.text).not.toContain('do not disclose');
  });
});
