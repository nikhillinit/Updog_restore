import { readFileSync } from 'fs';

const resultsPath = process.argv[2] || '.promptfoo/capital-allocation/results.json';
const data = JSON.parse(readFileSync(resultsPath, 'utf8'));

const summary = {
  version: data.version,
  testCaseCount: data.results.length,
  passingTests: data.results.filter(r => r.success).length,
  failingTests: data.results.filter(r => !r.success).length,
  stats: data.stats,
  results: data.results.map((r, idx) => ({
    testCase: idx + 1,
    docType: r.vars.doc_type,
    success: r.success,
    score: r.score,
    pass: r.gradingResult?.pass,
    componentResults: r.gradingResult?.componentResults?.map(cr => ({
      assertion: cr.assertion?.type,
      pass: cr.pass,
      score: cr.score,
      reason: cr.reason
    }))
  }))
};

console.log(JSON.stringify(summary, null, 2));
