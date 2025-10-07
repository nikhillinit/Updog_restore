// scripts/codemods/fix-logger-order.ts
import { Project, Node, CallExpression, PropertyAccessExpression } from 'ts-morph';
import fg from 'fast-glob';

const METHODS = new Set(['fatal','error','warn','info','debug','trace']);
const DEFAULT_GLOBS = [
  'server/**/*.ts',
  'client/**/*.ts',
  'packages/**/*.ts',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/*.spec.ts',
  '!**/*.test.ts',
];

const args = process.argv.slice(2);
const WRITE = args.includes('--write');

function isStringy(arg: any) {
  return Node.isStringLiteral(arg) ||
         Node.isNoSubstitutionTemplateLiteral(arg) ||
         Node.isTemplateExpression(arg);
}

function nameLooksLikeLogger(expr: any) {
  if (Node.isIdentifier(expr)) return /logger$/i.test(expr.getText());
  if (Node.isPropertyAccessExpression(expr)) return /logger$/i.test(expr.getName());
  return false;
}

(async () => {
  const files = await fg(DEFAULT_GLOBS, { dot: true });
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: false
  });
  project.addSourceFilesAtPaths(files);

  let changed = 0;

  for (const sf of project.getSourceFiles()) {
    let sfChanged = false;

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;

      const call = node as CallExpression;
      const callee = call.getExpression();

      if (!Node.isPropertyAccessExpression(callee)) return;
      const pae = callee as PropertyAccessExpression;

      // logger.info / this.logger.info / req.logger.info
      const method = pae.getName();
      if (!METHODS.has(method)) return;
      if (!nameLooksLikeLogger(pae.getExpression())) return;

      const args = call.getArguments();
      if (args.length < 2) return;

      const [a0, a1, ...rest] = args;
      // Flip only when arg0 is NOT stringy and arg1 IS stringy
      if (isStringy(a0) || !isStringy(a1)) return;

      const newArgs = [a1.getText(), a0.getText(), ...rest.map((r) => r.getText())].join(', ');
      const newCall = `${pae.getText()}(${newArgs})`;

      call.replaceWithText(newCall);
      sfChanged = true;
      changed++;
    });

    if (sfChanged && WRITE) sf.saveSync();
  }

  if (WRITE) {
    await project.save();
    console.log(`✔ Rewrote ${changed} logger call(s).`);
  } else {
    console.log(`(dry-run) Would rewrite ${changed} logger call(s). Use --write to apply.`);
  }
})();
