require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/core/db');

async function restore() {
  try {
    const salt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('admin123', salt);
    const workerHash = await bcrypt.hash('worker123', salt);

    await pool.query(`
      INSERT INTO users (email, password_hash, name, role, skills, equipment_auth, max_safe_weight, status)
      VALUES 
      ('admin@wms.com', $1, 'Admin Manager', 'manager', '{pick,pack,receive,ship,returns,forklift}', '{forklift,pallet_jack}', 100, 'available'),
      ('alice@wms.com', $2, 'Alice Worker', 'worker', '{pick,pack,receive}', '{pallet_jack}', 25, 'available'),
      ('bob@wms.com', $2, 'Bob Worker', 'worker', '{pick,receive,forklift}', '{forklift,pallet_jack}', 50, 'available'),
      ('carol@wms.com', $2, 'Carol Worker', 'worker', '{pack,ship,returns}', '{}', 20, 'available')
    `, [adminHash, workerHash]);

    console.log('Users restored!');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

restore();
