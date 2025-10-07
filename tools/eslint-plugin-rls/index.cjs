"use strict";

module.exports = {
  rules: {
    'enforce-rls-transaction': require('./lib/rules/enforce-rls-transaction'),
  },
  configs: {
    recommended: {
      plugins: ['rls'],
      rules: {
        'rls/enforce-rls-transaction': 'error',
      },
    },
  },
};