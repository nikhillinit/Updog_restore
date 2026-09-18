import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CANONICAL_MANIFEST_IDENTITIES } from '../../scripts/reconcile-prod-schema.mjs';

// Legacy capability scenarios use the revision-8 inventory, not the live directory.
export function createPinned32ManifestFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-revision8-pinned32-'));
  try {
    const fixturePaths = new Set<string>();
    for (const identity of CANONICAL_MANIFEST_IDENTITIES) {
      fixturePaths.add(identity.manifestPath);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), identity.manifestPath), 'utf8')
      );
      for (const sqlPath of manifest.sqlFiles ?? []) fixturePaths.add(sqlPath);
    }
    for (const relativePath of fixturePaths) {
      const destination = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(process.cwd(), relativePath), destination);
    }
    return root;
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
