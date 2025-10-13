// Test file to verify OpenTelemetry imports work correctly
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';

console.log('✓ Imports successful');
console.log('ATTR_SERVICE_NAME:', ATTR_SERVICE_NAME);
console.log('ATTR_DEPLOYMENT_ENVIRONMENT:', ATTR_DEPLOYMENT_ENVIRONMENT);

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'test-service',
  [ATTR_DEPLOYMENT_ENVIRONMENT]: 'test'
});

console.log('✓ Resource created:', resource.attributes);
console.log('\nAll imports working correctly!');
