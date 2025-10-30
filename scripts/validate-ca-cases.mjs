import { readFile } from 'fs/promises';
import Ajv from 'ajv';

const schema = JSON.parse(await readFile('docs/schemas/capital-allocation-truth-case.schema.json', 'utf8'));
const cases  = JSON.parse(await readFile('docs/capital-allocation.truth-cases.json', 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false }); // relaxed mode for "date" format
const validate = ajv.compile(schema);

let ok = true;

for (const c of cases) {
  const valid = validate(c);
  if (!valid) {
    console.error(`❌ ${c.id} errors:`, JSON.stringify(validate.errors, null, 2));
    ok = false;
  } else {
    console.log(`✅ ${c.id} valid`);
  }
}

if (ok) {
  console.log(`\n✅ All ${cases.length} truth cases valid`);
} else {
  console.error(`\n❌ Validation failed`);
}

process.exit(ok ? 0 : 1);
