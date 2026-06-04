const bcrypt = require('bcryptjs');
const pool = require('../core/db');
const runSchema = require('./schema');

async function seed() {
  try {
    // Step 1: Run schema (drops and recreates all tables)
    await runSchema();

    console.log('🌱 Seeding demo data...');

    // Step 2: Create client
    const { rows: [client] } = await pool.query(
      "INSERT INTO clients (name) VALUES ('Demo Warehouse Inc') RETURNING *"
    );
    console.log('  ✓ Client created');

    // Step 3: Create users (1 manager + 3 workers)
    const salt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('admin123', salt);
    const workerHash = await bcrypt.hash('worker123', salt);

    const { rows: [manager] } = await pool.query(`
      INSERT INTO users (client_id, email, password_hash, name, role, skills, equipment_auth, max_safe_weight, status)
      VALUES ($1, 'admin@wms.com', $2, 'Admin Manager', 'manager', $3, $4, 100, 'available')
      RETURNING *
    `, [client.id, adminHash, '{pick,pack,receive,ship,returns,forklift}', '{forklift,pallet_jack}']);

    const { rows: [alice] } = await pool.query(`
      INSERT INTO users (client_id, email, password_hash, name, role, skills, equipment_auth, max_safe_weight, status)
      VALUES ($1, 'alice@wms.com', $2, 'Alice Worker', 'worker', $3, $4, 25, 'available')
      RETURNING *
    `, [client.id, workerHash, '{pick,pack,receive}', '{pallet_jack}']);

    const { rows: [bob] } = await pool.query(`
      INSERT INTO users (client_id, email, password_hash, name, role, skills, equipment_auth, max_safe_weight, status)
      VALUES ($1, 'bob@wms.com', $2, 'Bob Worker', 'worker', $3, $4, 50, 'available')
      RETURNING *
    `, [client.id, workerHash, '{pick,receive,forklift}', '{forklift,pallet_jack}']);

    const { rows: [carol] } = await pool.query(`
      INSERT INTO users (client_id, email, password_hash, name, role, skills, equipment_auth, max_safe_weight, status)
      VALUES ($1, 'carol@wms.com', $2, 'Carol Worker', 'worker', $3, $4, 20, 'available')
      RETURNING *
    `, [client.id, workerHash, '{pack,ship,returns}', '{}']);

    console.log('  ✓ 4 users created (1 manager + 3 workers)');

    // Step 4: Create 250 bins (10x5 grid, 5 shelves each)
    const rows_arr = ['A', 'B', 'C', 'D', 'E'];
    const binIds = [];

    const zWeights = {
      0: 500, // Bottom shelf (heaviest)
      1: 250,
      2: 100,
      3: 50,
      4: 25   // Top shelf (lightest)
    };

    for (let row = 0; row < 5; row++) {
      for (let col = 1; col <= 10; col++) {
        for (let z = 0; z < 5; z++) {
          const code = `${rows_arr[row]}-${String(col).padStart(2, '0')}-L${z}`;
          const handlingClasses = row < 2 
            ? '{fragile,hazardous,heavy}' 
            : row < 4 
              ? '{fragile,heavy}' 
              : '{general}';

          const { rows: [bin] } = await pool.query(`
            INSERT INTO bins (code, x, y, z, int_length_cm, int_width_cm, int_height_cm, volume_capacity_cm3, max_weight_kg, allowed_handling_classes, status)
            VALUES ($1, $2, $3, $4, 50, 50, 50, 50000, $5, $6, 'active')
            RETURNING *
          `, [code, col, row + 1, z, zWeights[z], handlingClasses]);

          binIds.push(bin.id);
        }
      }
    }
    console.log('  ✓ 250 bins created (10x5 grid: 5 levels A-01-L0 to E-10-L4)');

    // Step 5: Create 12 SKUs
    const skuData = [
      { code: 'SKU-001', name: 'Industrial Motor 5HP', l: 40, w: 30, h: 25, weight: 35, handling: '{heavy}', barcode: 'BAR001', velocity: 'B' },
      { code: 'SKU-002', name: 'Steel Bearings Pack', l: 15, w: 15, h: 10, weight: 8, handling: '{heavy}', barcode: 'BAR002', velocity: 'A' },
      { code: 'SKU-003', name: 'Glass Display Panel', l: 60, w: 40, h: 5, weight: 4, handling: '{fragile}', barcode: 'BAR003', velocity: 'B' },
      { code: 'SKU-004', name: 'Crystal Vase Set', l: 25, w: 25, h: 30, weight: 3, handling: '{fragile}', barcode: 'BAR004', velocity: 'C' },
      { code: 'SKU-005', name: 'Rubber Gaskets Box', l: 20, w: 15, h: 10, weight: 2, handling: '{general}', barcode: 'BAR005', velocity: 'A' },
      { code: 'SKU-006', name: 'Copper Wire Spool', l: 30, w: 30, h: 20, weight: 12, handling: '{heavy}', barcode: 'BAR006', velocity: 'A' },
      { code: 'SKU-007', name: 'LED Light Strips', l: 100, w: 5, h: 5, weight: 0.5, handling: '{general}', barcode: 'BAR007', velocity: 'A' },
      { code: 'SKU-008', name: 'Hydraulic Cylinder', l: 45, w: 15, h: 15, weight: 28, handling: '{heavy}', barcode: 'BAR008', velocity: 'C' },
      { code: 'SKU-009', name: 'Ceramic Tiles Pack', l: 30, w: 30, h: 15, weight: 15, handling: '{fragile,heavy}', barcode: 'BAR009', velocity: 'B' },
      { code: 'SKU-010', name: 'Precision Screws Kit', l: 10, w: 8, h: 5, weight: 1, handling: '{general}', barcode: 'BAR010', velocity: 'A' },
      { code: 'SKU-011', name: 'Forklift Battery 48V', l: 50, w: 40, h: 30, weight: 45, handling: '{heavy,hazardous}', barcode: 'BAR011', velocity: 'C' },
      { code: 'SKU-012', name: 'Safety Gloves Case', l: 35, w: 25, h: 20, weight: 3, handling: '{general}', barcode: 'BAR012', velocity: 'B' },
    ];

    const skuIds = [];
    for (const s of skuData) {
      const { rows: [sku] } = await pool.query(`
        INSERT INTO skus (client_id, code, name, length_cm, width_cm, height_cm, weight_kg, handling_classes, barcode, velocity_class)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [client.id, s.code, s.name, s.l, s.w, s.h, s.weight, s.handling, s.barcode, s.velocity]);
      skuIds.push(sku.id);
    }
    console.log('  ✓ 12 SKUs created');

    // Step 6: Seed 30 inventory records
    let invCount = 0;
    const usedCombos = new Set();

    while (invCount < 30) {
      const skuIdx = Math.floor(Math.random() * skuIds.length);
      const binIdx = Math.floor(Math.random() * binIds.length);
      const comboKey = `${skuIds[skuIdx]}-${binIds[binIdx]}`;

      if (usedCombos.has(comboKey)) continue;
      usedCombos.add(comboKey);

      const qty = Math.floor(Math.random() * 20) + 1;

      try {
        await pool.query(`
          INSERT INTO inventory (client_id, sku_id, bin_id, qty, status)
          VALUES ($1, $2, $3, $4, 'available')
        `, [client.id, skuIds[skuIdx], binIds[binIdx], qty]);
        invCount++;
      } catch (e) {
        // Skip duplicates
      }
    }
    console.log(`  ✓ ${invCount} inventory records created`);

    console.log('');
    console.log('🎉 Seed completed successfully!');
    console.log('');
    console.log('Demo Credentials:');
    console.log('  Manager: admin@wms.com / admin123');
    console.log('  Worker:  alice@wms.com / worker123');
    console.log('  Worker:  bob@wms.com   / worker123');
    console.log('  Worker:  carol@wms.com / worker123');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seed;
