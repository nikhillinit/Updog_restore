/**
 * jscodeshift transform:
 *   import.meta.env.FOO  ->  clientEnv.FOO
 * and injects:
 *   import clientEnv from config.client
 *
 * Run (dry-run first):
 *   npx jscodeshift -t codemods/env-to-clientEnv.js client/src --extensions=ts,tsx --parser=ts --dry
 * Then:
 *   npx jscodeshift -t codemods/env-to-clientEnv.js client/src --extensions=ts,tsx --parser=ts
 */
module.exports = function (file, api) {
  const j = api.jscodeshift;
  const src = file.source;
  const p = file.path.replace(/\\/g, '/');
  if (p.endsWith('client/src/config.client.ts')) return null;

  const root = j(src);
  let changed = false;

  const ensureClientEnvImport = () => {
    const hasExact = root.find(j.ImportDeclaration, { source: { value: '@/config.client' } })
      .filter(d => d.node.specifiers?.some(s => s.type === 'ImportSpecifier' && s.imported.name === 'clientEnv'))
      .size() > 0;
    if (hasExact) return;

    const existing = root.find(j.ImportDeclaration, { source: { value: '@/config.client' } });
    if (existing.size() > 0) {
      existing.forEach(d => {
        d.node.specifiers = d.node.specifiers || [];
        const already = d.node.specifiers.some(s => s.type === 'ImportSpecifier' && s.imported.name === 'clientEnv');
        if (!already) { d.node.specifiers.push(j.importSpecifier(j.identifier('clientEnv'))); changed = true; }
      });
    } else {
      const newImport = j.importDeclaration([j.importSpecifier(j.identifier('clientEnv'))], j.literal('@/config.client'));
      root.get().node.program.body.unshift(newImport);
      changed = true;
    }
  };

  // import.meta.env.X -> clientEnv.X
  root.find(j.MemberExpression, {
    object: { type: 'MemberExpression', object: { type: 'MetaProperty' }, property: { type: 'Identifier', name: 'env' } }
  }).forEach(path => {
    const obj = path.node.object;
    if (obj.object?.type === 'MetaProperty' && obj.object.meta?.name === 'import' && obj.object.property?.name === 'meta') {
      const replacement = j.memberExpression(j.identifier('clientEnv'), path.node.property, path.node.computed || false);
      j(path).replaceWith(replacement);
      changed = true;
    }
  });

  if (changed) { ensureClientEnvImport(); return root.toSource({ quote: 'single' }); }
  return null;
};
