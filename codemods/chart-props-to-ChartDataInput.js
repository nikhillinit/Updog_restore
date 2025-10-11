/**
 * jscodeshift transform:
 *   In TS/TSX files, find prop types with a data field and set its type to ChartDataInput.
 *   Ensures: import ChartDataInput from shared/chart-types
 *
 * Run (dry-run first):
 *   npx jscodeshift -t codemods/chart-props-to-ChartDataInput.js client/src --extensions=ts,tsx --parser=ts --dry
 * Then:
 *   npx jscodeshift -t codemods/chart-props-to-ChartDataInput.js client/src --extensions=ts,tsx --parser=ts
 */
module.exports = function (file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  const refChartDataInput = () => j.tsTypeReference(j.identifier('ChartDataInput'));

  const ensureChartImport = () => {
    const hasExact = root.find(j.ImportDeclaration, { source: { value: '@/shared/chart-types' } })
      .filter(d => d.node.specifiers?.some(s => s.type === 'ImportSpecifier' && s.imported.name === 'ChartDataInput'))
      .size() > 0;
    if (hasExact) return;

    const existing = root.find(j.ImportDeclaration, { source: { value: '@/shared/chart-types' } });
    if (existing.size() > 0) {
      existing.forEach(d => {
        d.node.specifiers = d.node.specifiers || [];
        const already = d.node.specifiers.some(s => s.type === 'ImportSpecifier' && s.imported.name === 'ChartDataInput');
        if (!already) { d.node.specifiers.push(j.importSpecifier(j.identifier('ChartDataInput'))); changed = true; }
      });
    } else {
      const newImport = j.importDeclaration([j.importSpecifier(j.identifier('ChartDataInput'))], j.literal('@/shared/chart-types'));
      root.get().node.program.body.unshift(newImport);
      changed = true;
    }
  };

  const fixMembers = (members) => {
    let localChange = false;
    members.forEach(m => {
      if (m.type === 'TSPropertySignature') {
        const key = m.key;
        const name = (key.type === 'Identifier') ? key.name : null;
        if (name === 'data') {
          m.typeAnnotation = j.tsTypeAnnotation(refChartDataInput());
          localChange = true;
        }
      }
    });
    if (localChange) changed = true;
  };

  // interface Props { data: ... }
  root.find(j.TSInterfaceDeclaration).forEach(path => {
    const body = path.node.body?.body;
    if (body && body.length) fixMembers(body);
  });

  // type Props = { data: ... }
  root.find(j.TSTypeAliasDeclaration).forEach(path => {
    const t = path.node.typeAnnotation;
    if (t?.type === 'TSTypeLiteral') fixMembers(t.members || []);
  });

  // function C({ data }: { data: ... })
  root.find(j.FunctionDeclaration).forEach(path => {
    path.node.params.forEach(p => {
      if (p.type === 'ObjectPattern' && p.typeAnnotation?.type === 'TSTypeAnnotation') {
        const t = p.typeAnnotation.typeAnnotation;
        if (t.type === 'TSTypeLiteral') fixMembers(t.members || []);
      }
    });
  });
  root.find(j.VariableDeclarator).forEach(path => {
    const init = path.node.init;
    if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
      init.params.forEach(p => {
        if (p.type === 'ObjectPattern' && p.typeAnnotation?.type === 'TSTypeAnnotation') {
          const t = p.typeAnnotation.typeAnnotation;
          if (t.type === 'TSTypeLiteral') fixMembers(t.members || []);
        }
      });
    }
  });

  if (changed) { ensureChartImport(); return root.toSource({ quote: 'single' }); }
  return null;
};
