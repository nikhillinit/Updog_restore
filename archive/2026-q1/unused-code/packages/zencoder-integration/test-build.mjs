 
// Build verification test - checks that the package built correctly
import { readFileSync, existsSync } from 'fs';

console.log('Starting build verification tests...\n');

let passed = 0;
let failed = 0;

// Test 1: Check dist folder exists
try {
  if (existsSync('./dist')) {
    console.log('✓ Test 1: dist folder exists');
    passed++;
  } else {
    console.log('✗ Test 1: dist folder missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 1: dist folder check failed');
  console.error(error);
  failed++;
}

// Test 2: Check index.js exists
try {
  if (existsSync('./dist/index.js')) {
    console.log('✓ Test 2: dist/index.js exists');
    passed++;
  } else {
    console.log('✗ Test 2: dist/index.js missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 2: dist/index.js check failed');
  console.error(error);
  failed++;
}

// Test 3: Check ZencoderAgent.js exists
try {
  if (existsSync('./dist/ZencoderAgent.js')) {
    console.log('✓ Test 3: dist/ZencoderAgent.js exists');
    passed++;
  } else {
    console.log('✗ Test 3: dist/ZencoderAgent.js missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 3: dist/ZencoderAgent.js check failed');
  console.error(error);
  failed++;
}

// Test 4: Check type declarations exist
try {
  if (existsSync('./dist/index.d.ts') && existsSync('./dist/ZencoderAgent.d.ts')) {
    console.log('✓ Test 4: Type declaration files exist');
    passed++;
  } else {
    console.log('✗ Test 4: Type declaration files missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 4: Type declaration check failed');
  console.error(error);
  failed++;
}

// Test 5: Check index.js exports ZencoderAgent
try {
  const indexContent = readFileSync('./dist/index.js', 'utf8');
  if (indexContent.includes('export') && indexContent.includes('ZencoderAgent')) {
    console.log('✓ Test 5: index.js exports ZencoderAgent');
    passed++;
  } else {
    console.log('✗ Test 5: index.js does not export ZencoderAgent');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 5: index.js export check failed');
  console.error(error);
  failed++;
}

// Test 6: Check ZencoderAgent.js contains class definition
try {
  const agentContent = readFileSync('./dist/ZencoderAgent.js', 'utf8');
  if (agentContent.includes('class ZencoderAgent') && agentContent.includes('extends BaseAgent')) {
    console.log('✓ Test 6: ZencoderAgent.js contains class definition');
    passed++;
  } else {
    console.log('✗ Test 6: ZencoderAgent.js class definition invalid');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 6: ZencoderAgent.js class check failed');
  console.error(error);
  failed++;
}

// Test 7: Check type definitions are complete
try {
  const typeContent = readFileSync('./dist/ZencoderAgent.d.ts', 'utf8');
  const hasInputType = typeContent.includes('interface ZencoderInput') || typeContent.includes('type ZencoderInput');
  const hasResultType = typeContent.includes('interface ZencoderResult') || typeContent.includes('type ZencoderResult');
  const hasClass = typeContent.includes('class ZencoderAgent') || typeContent.includes('declare class ZencoderAgent');

  if (hasInputType && hasResultType && hasClass) {
    console.log('✓ Test 7: Type definitions are complete');
    passed++;
  } else {
    console.log('✗ Test 7: Type definitions incomplete');
    if (!hasInputType) console.log('  - Missing ZencoderInput type');
    if (!hasResultType) console.log('  - Missing ZencoderResult type');
    if (!hasClass) console.log('  - Missing ZencoderAgent class');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 7: Type definition check failed');
  console.error(error);
  failed++;
}

// Test 8: Check for required methods in compiled code
try {
  const agentContent = readFileSync('./dist/ZencoderAgent.js', 'utf8');
  const hasPerformOperation = agentContent.includes('performOperation');
  const hasFixTypeScript = agentContent.includes('fixTypeScriptErrors');
  const hasFixTests = agentContent.includes('fixTestFailures');
  const hasFixEslint = agentContent.includes('fixESLintErrors');
  const hasUpdateDeps = agentContent.includes('updateDependencies');

  if (hasPerformOperation && hasFixTypeScript && hasFixTests && hasFixEslint && hasUpdateDeps) {
    console.log('✓ Test 8: All required methods present');
    passed++;
  } else {
    console.log('✗ Test 8: Required methods missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 8: Method check failed');
  console.error(error);
  failed++;
}

// Test 9: Check package.json configuration
try {
  const pkgContent = readFileSync('./package.json', 'utf8');
  const pkg = JSON.parse(pkgContent);

  const hasCorrectMain = pkg.main === 'dist/index.js';
  const hasCorrectTypes = pkg.types === 'dist/index.d.ts';
  const hasTypeModule = pkg.type === 'module';
  const hasBuildScript = pkg.scripts && pkg.scripts.build;

  if (hasCorrectMain && hasCorrectTypes && hasTypeModule && hasBuildScript) {
    console.log('✓ Test 9: package.json configured correctly');
    passed++;
  } else {
    console.log('✗ Test 9: package.json configuration invalid');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 9: package.json check failed');
  console.error(error);
  failed++;
}

// Test 10: Check source map files exist
try {
  if (existsSync('./dist/index.d.ts.map') && existsSync('./dist/ZencoderAgent.d.ts.map')) {
    console.log('✓ Test 10: Source map files exist');
    passed++;
  } else {
    console.log('✗ Test 10: Source map files missing');
    failed++;
  }
} catch (error) {
  console.log('✗ Test 10: Source map check failed');
  console.error(error);
  failed++;
}

console.log('\n' + '='.repeat(50));
console.log(`Build verification completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
