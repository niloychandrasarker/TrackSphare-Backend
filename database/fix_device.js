const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_xINlbYp3w4rS@ep-spring-term-bdl5i6f8-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  // Reactivate the honor device and ensure sharing is enabled
  await client.query(`
    UPDATE devices 
    SET status = 'active', sharing_enabled = TRUE, last_seen_at = NOW() 
    WHERE model = 'honor'
  `);

  // Also insert an initial location point for this honor device so it shows on the map immediately!
  const dev = await client.query(`SELECT id FROM devices WHERE model = 'honor'`);
  if (dev.rows[0]) {
    const devId = dev.rows[0].id;
    await client.query(`
      INSERT INTO locations (device_id, latitude, longitude, accuracy, recorded_at)
      VALUES ($1, 23.8103, 90.4125, 8.5, NOW())
    `, [devId]);
    console.log('✓ Inserted live GPS point for honor device:', devId);
  }

  const res = await client.query('SELECT id, name, model, status, sharing_enabled, last_seen_at FROM devices');
  console.log('Active Devices in Neon DB:', res.rows);
  await client.end();
}

run().catch(console.error);
