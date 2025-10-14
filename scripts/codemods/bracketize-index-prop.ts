/**
 * TS4111 codemod: Replace dot-access with bracket-access when the
 * left-hand type is *index-signature only* and the property is not declared.
 *
 * Safety rules:
 *  - If the property exists as a declared member on the type, DO NOT touch.
 *  - For unions, ALL constituents must be index-signature-only and none
 *    may declare the property. Otherwise, DO NOT touch.
 *  - Skip any/unknown/type parameters.
 *  - Skip .d.ts, tests, and generated artifacts.
 *
 * Usage:
 *  - Dry run (default):   tsx scripts/codemods/bracketize-index-prop.ts --target server
 *  - Write in place:      tsx scripts/codemods/bracketize-index-prop.ts --target server --write
 *  - Single file:         tsx scripts/codemods/bracketize-index-prop.ts --file path/to/file.ts --write
 *
 * Artifacts:
 *  artifacts/week2/ts4111-codemod-report.json
 */

import { Project, SyntaxKind, PropertyAccessExpression, SourceFile, Type } from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';

type Args = {
  target?: string;
  file?: string;
  write?: boolean;
  dryRun?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true, args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true, args.write = false;
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--file') args.file = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const report: {
  mode: 'dry-run' | 'write';
  target?: string;
  file?: string;
  processedFiles: number;
  transformedFiles: number;
  totalTransforms: number;
  perFile: Record<string, number>;
  skipped: Array<{ file: string; reason: string }>;
} = {
  mode: args.write ? 'write' : 'dry-run',
  target: args.target,
  file: args.file,
  processedFiles: 0,
  transformedFiles: 0,
  totalTransforms: 0,
  perFile: {},
  skipped: []
};

function ensureArtifactsDir() {
  const outDir = path.join('artifacts', 'week2');
  fs.mkdirSync(outDir, { recursive: true });
  return path.join(outDir, 'ts4111-codemod-report.json');
}

function hasIndexSignature(t: Type): boolean {
  const apparent = t.getApparentType();
  return !!apparent.getStringIndexType() || !!apparent.getNumberIndexType();
}

function propertyDeclared(t: Type, name: string): boolean {
  const apparent = t.getApparentType();
  const sym = apparent.getProperty(name);
  return !!sym;
}

function isAnyOrUnknownOrTypeParam(t: Type): boolean {
  return t.isAny() || t.isUnknown() || t.isTypeParameter();
}

function allUnionConstituentsIndexOnlyAndMissing(type: Type, name: string): boolean {
  const parts = type.getUnionTypes();
  if (parts.length === 0) return false; // not a union
  return parts.every(u => hasIndexSignature(u) && !propertyDeclared(u, name));
}

function isSafeToBracketize(type: Type, propName: string): boolean {
  if (isAnyOrUnknownOrTypeParam(type)) return false;
  if (type.isUnion()) {
    return allUnionConstituentsIndexOnlyAndMissing(type, propName);
  }
  return hasIndexSignature(type) && !propertyDeclared(type, propName);
}

function shouldSkipFile(sf: SourceFile): string | null {
  const fp = sf.getFilePath();
  if (fp.endsWith('.d.ts')) return 'declaration file';
  if (/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(fp)) return 'test/spec file';
  if (/node_modules/.test(fp)) return 'node_modules';
  if (/artifacts\/|dist\/|build\//.test(fp)) return 'generated/artifacts';
  return null;
}

function collectSourceFiles(project: Project): SourceFile[] {
  if (args.file) {
    const sf = project.getSourceFile(args.file);
    if (!sf) throw new Error(`File not found in project: ${args.file}`);
    return [sf];
  }
  const target = args.target ?? 'server';
  return project.getSourceFiles([
    `${target.replace(/\/+$/, '')}/**/*.ts`,
    `${target.replace(/\/+$/, '')}/**/*.tsx`
  ]);
}

async function main() {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.server.json',
    skipAddingFilesFromTsConfig: false
  });

  const files = collectSourceFiles(project);

  for (const sf of files) {
    const skipReason = shouldSkipFile(sf);
    if (skipReason) {
      report.skipped.push({ file: sf.getFilePath(), reason: skipReason });
      continue;
    }

    report.processedFiles++;
    let fileTransforms = 0;

    sf.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.PropertyAccessExpression) return;
      const pa = node as PropertyAccessExpression;
      const lhsType = pa.getExpression().getType();
      const name = pa.getName();

      if (!isSafeToBracketize(lhsType, name)) return;

      // Replace: obj.prop  ->  obj["prop"]
      const exprText = pa.getExpression().getText();
      pa.replaceWithText(`${exprText}["${name}"]`);
      fileTransforms++;
      report.totalTransforms++;
    });

    if (fileTransforms > 0) {
      report.transformedFiles++;
      report.perFile[sf.getFilePath()] = fileTransforms;
    }
  }

  const outPath = ensureArtifactsDir();
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  if (args.write) {
    await project.save();
    console.log(`✅ TS4111 codemod (WRITE): ${report.totalTransforms} changes across ${report.transformedFiles}/${report.processedFiles} files`);
  } else {
    console.log(`🔎 TS4111 codemod (DRY-RUN): ${report.totalTransforms} potential changes across ${report.transformedFiles}/${report.processedFiles} files`);
  }
  console.log(`↳ Report: ${outPath}`);
}

main().catch((err) => {
  console.error('Codemod failed:', err);
  process.exit(1);
});
