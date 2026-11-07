const path = require('path');
const { Client } = require(path.join(__dirname, '../../node_modules/pg'));
const bcrypt = require(path.join(__dirname, '../../node_modules/bcryptjs'));

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_xINlbYp3w4rS@ep-spring-term-bdl5i6f8-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function seedAdmin() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to Neon database for seeding...');

    const adminEmail = 'admin@tracksphere.com';
    const adminPassword = 'AdminPassword123!';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query(
        'UPDATE users SET password_hash = $1, role = $2 WHERE email = $3',
        [passwordHash, 'super_admin', adminEmail]
      );
      console.log('✓ Admin user updated successfully!');
    } else {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        ['Super Administrator', adminEmail, passwordHash, 'super_admin']
      );
      console.log('✓ New Super Admin user created!');
    }

    console.log('\n=======================================');
    console.log('🔐 TRACKSPHERE ADMIN CREDENTIALS');
    console.log('=======================================');
    console.log(`Email:    ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`Role:     super_admin`);
    console.log('=======================================\n');
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await client.end();
  }
}

seedAdmin();
