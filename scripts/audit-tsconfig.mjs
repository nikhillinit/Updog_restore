#!/usr/bin/env node
/**
 * TypeScript config strictness audit
 * Scope-aware: client (client+shared) vs full (all)
 * Validates:
 *   - strict: true
 *   - exactOptionalPropertyTypes: true
 *   - No tsconfigRaw in vite.config.ts (full scope only)
 */
import fs from "node:fs";

// Minimal JSONC strip (remove // and /* */ comments; trim dangling commas)
function stripJsonc(text) {
  // remove /* block */ comments
  let s = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // remove // line comments
  s = s.replace(/(^|\s)\/\/.*$/gm, "$1");
  // remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

const scopeArg = process.argv.find(a => a.startsWith("--scope="));
const scope = scopeArg ? scopeArg.split("=")[1] : "client"; // "client" | "full"

const filesFull = [
  "tsconfig.json",
  "tsconfig.client.json",
  "tsconfig.server.json",
  "tsconfig.shared.json"
];
const filesClient = [
  "tsconfig.json",
  "tsconfig.client.json",
  "tsconfig.shared.json"
];
const files = scope === "full" ? filesFull : filesClient;

let errs = [];

// Audit TypeScript configs
for (const f of files) {
  if (!fs.existsSync(f)) {
    errs.push(`${f}: file not found`);
    continue;
  }

  try {
    const raw = fs.readFileSync(f, "utf8");
    const json = stripJsonc(raw);
    const j = JSON.parse(json);
    const co = j?.compilerOptions ?? {};

    if (co.strict !== true) {
      errs.push(`${f}: "strict" must be true (found: ${co.strict})`);
    }

    if (co.exactOptionalPropertyTypes !== true) {
      errs.push(`${f}: "exactOptionalPropertyTypes" must be true (found: ${co.exactOptionalPropertyTypes})`);
    }

    // Check for explicit bypass flags
    if (co.strictNullChecks === false) {
      errs.push(`${f}: "strictNullChecks" bypass detected (must be removed)`);
    }

    if (co.noImplicitAny === false) {
      errs.push(`${f}: "noImplicitAny" bypass detected (must be removed)`);
    }
  } catch (e) {
    errs.push(`${f}: invalid JSON (${e?.message || e})`);
  }
}

// Audit Vite config for tsconfigRaw bypass (full scope only)
if (scope === "full") {
  const vite = fs.existsSync("vite.config.ts")
    ? fs.readFileSync("vite.config.ts", "utf8")
    : "";

  if (/tsconfigRaw\s*:/m.test(vite)) {
    errs.push("vite.config.ts: tsconfigRaw present (remove in Week 2)");
  }
}

if (errs.length) {
  console.error("❌ Strictness audit failed:");
  console.error(errs.map(e => `   - ${e}`).join("\n"));
  process.exit(1);
} else {
  console.log(`✅ Strictness audit passed (scope=${scope})`);
  console.log(`   Validated: ${files.join(", ")}`);
  if (scope === "full") {
    console.log("   Vite config: no tsconfigRaw bypass");
  }
}
