// Quick sanity check - can we boot the system?
import { db } from '../server/db.js';
import { funds, portfolioCompanies } from '../shared/schema.js';

async function smoke() {
    try {
        // Test DB connection
        await db.select().from(funds).limit(1);
        console.log('✅ Database connection OK');
        
        // Test imports work
        console.log('✅ Schema imports OK');
        
        // Test async utilities if they exist
        if (typeof forEachAsync === 'function') {
            console.log('✅ Async utilities loaded');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Smoke test failed:', error.message);
        process.exit(1);
    }
}

smoke();
