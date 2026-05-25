const { Client } = require('pg');

async function main() {
  const password = process.argv[2];
  if (!password) { console.log('Usage: node run-vacuum.js <password>'); process.exit(1); }

  // Try pooler with hostname (not IP) - this should work via SNI routing
  const configs = [
    { host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543, database: 'postgres', user: 'postgres', password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 },
    { host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres', password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 },
  ];

  let client = null;
  for (const cfg of configs) {
    console.log(`Trying ${cfg.host}:${cfg.port}...`);
    const c = new Client(cfg);
    try {
      await c.connect();
      client = c;
      console.log('Connected!');
      break;
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }

  if (!client) {
    console.error('Could not connect');
    process.exit(1);
  }

  try {
    console.log('Dropping columns and indexes...');
    await client.query('ALTER TABLE public.survey_units DROP COLUMN IF EXISTS image_urls');
    console.log('  Dropped image_urls');
    for (const idx of ['idx_bills_month','idx_bills_status','idx_bills_survey_id','idx_verified_survey_id','idx_survey_consumer_name_trgm']) {
      await client.query(`DROP INDEX IF EXISTS ${idx}`);
      console.log(`  Dropped ${idx}`);
    }

    // Try VACUUM FULL (may fail through pooler)
    console.log('Running VACUUM FULL...');
    for (const t of ['public.survey_units', 'public.bill_items', 'public.payment_history']) {
      console.log(`  ${t}...`);
      await client.query(`VACUUM FULL ${t}`);
      console.log('    Done');
    }
    
    await client.query('ANALYZE');
    console.log('Analyze complete');
  } catch (err) {
    console.log('Pooler error (expected for VACUUM):', err.message);
    console.log('\nDDL changes (DROP COLUMN + DROP INDEX) likely succeeded.');
    console.log('VACUUM FULL requires a direct connection. Please run:');
    console.log('\n  VACUUM FULL public.survey_units;');
    console.log('  VACUUM FULL public.bill_items;');
    console.log('  VACUUM FULL public.payment_history;');
    console.log('\nThrough Supabase Dashboard → SQL Editor → Settings (disable transaction wrapping)');
  }

  await client.end();
  console.log('Done!');
}

main();
