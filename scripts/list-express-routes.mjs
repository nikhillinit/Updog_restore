#!/usr/bin/env node
/**
 * Lists registered Express routes. Adjust APP_MODULE to your app export.
 */
const APP_MODULE = '../server/app';
async function main() {
  let app;
  try {
    const mod = await import(APP_MODULE);
    app = mod.default || mod.app || mod.server || mod;
  } catch {
    console.error('Could not import Express app. Update APP_MODULE in list-express-routes.mjs');
    process.exit(1);
  }
  const stack = (app && app._router && app._router.stack) || [];
  const routes = [];
  function parseLayer(layer, prefix = '') {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
      routes.push(`${methods.padEnd(7)} ${prefix}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      for (const l of layer.handle.stack) parseLayer(l, prefix);
    }
  }
  for (const layer of stack) parseLayer(layer);
  routes.sort().forEach(r => console.log(r));
}
main();
