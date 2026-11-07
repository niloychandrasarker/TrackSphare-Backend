const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, '../node_modules/pg'));

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_xINlbYp3w4rS@ep-spring-term-bdl5i6f8-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function runMigration() {
  console.log('Connecting to Neon PostgreSQL database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Successfully connected to Neon database!');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const indexesPath = path.join(__dirname, 'indexes.sql');

    console.log('Executing schema.sql...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('✓ Tables created successfully!');

    console.log('Executing indexes.sql...');
    const indexesSql = fs.readFileSync(indexesPath, 'utf8');
    await client.query(indexesSql);
    console.log('✓ Indexes created successfully!');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\nVerified tables in database:');
    res.rows.forEach((row, i) => {
      console.log(` ${i + 1}. ${row.table_name}`);
    });

    console.log('\n✅ Database migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
