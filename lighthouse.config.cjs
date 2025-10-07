module.exports = {
  ci: {
    collect: {
      numberOfRuns: 2,
      url: ["http://localhost:4173/"]
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'unused-javascript': ['warn', { maxNumericValue: 20000 }],
        'byte-efficiency/total-byte-weight': ['error', { maxNumericValue: 307200 }], // ≈300KB
      }
    }
  }
};
