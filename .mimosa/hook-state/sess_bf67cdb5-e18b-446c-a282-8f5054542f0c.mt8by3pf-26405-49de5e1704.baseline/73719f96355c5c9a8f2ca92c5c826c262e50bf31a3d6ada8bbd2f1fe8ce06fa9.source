import pg from 'pg';
const { Client } = pg;

async function checkConnection() {
  const urls = [
    'postgresql://postgres:postgres@localhost:5432/povc_fund',
    'postgresql://postgres:postgres@127.0.0.1:5432/povc_fund',
    'postgresql://postgres:postgres@host.docker.internal:5432/povc_fund',
  ];

  for (const url of urls) {
    console.log(`\nTrying: ${url}`);
    const client = new Client({ connectionString: url });
    
    try {
      await client.connect();
      console.log('✅ Connected successfully!');
      const res = await client.query('SELECT version()');
      console.log('PostgreSQL version:', res.rows[0].version);
      await client.end();
      
      console.log('\n🎉 Use this DATABASE_URL:', url);
      return url;
    } catch (err) {
      console.log('❌ Failed:', err.message);
    }
  }
  
  console.log('\n❌ Could not connect to PostgreSQL on any URL');
  console.log('\nTroubleshooting steps:');
  console.log('1. Check if containers are running: docker compose ps');
  console.log('2. Start them if needed: docker compose up -d postgres redis');
  console.log('3. Check logs: docker compose logs postgres');
  console.log('4. Try connecting from WSL if on Windows');
}

checkConnection();