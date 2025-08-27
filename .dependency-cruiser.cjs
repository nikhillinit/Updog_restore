module.exports = {
  forbidden: [
    // No server imports from client
    {
      name: "no-server-in-client",
      severity: "error",
      from: { path: "^client/src" },
      to:   { path: "^server/" }
    },
    // No Node built-ins in client (except via polyfills)
    {
      name: "no-node-builtins-in-client",
      severity: "error",
      from: { path: "^client/src" },
      to:   { pathNot: "\\.(css|svg|png|jpe?g|gif|webp)$", dependencyTypes: ["core"] }
    },
    // No shared importing server
    {
      name: "no-server-in-shared",
      severity: "error", 
      from: { path: "^shared/" },
      to:   { path: "^server/" }
    }
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json"
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"]
    }
  }
};