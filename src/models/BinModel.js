const BaseModel = require('../core/BaseModel');

class BinModel extends BaseModel {
  constructor() {
    super('bins');
  }

  async findAvailableBins(minVolume) {
    return this.query(`
      SELECT b.*,
        b.volume_capacity_cm3 - COALESCE(SUM(i.qty * s.volume_cm3), 0) AS available_volume,
        b.max_weight_kg - COALESCE(SUM(i.qty * s.weight_kg), 0) AS available_weight
      FROM bins b
      LEFT JOIN inventory i ON i.bin_id = b.id
      LEFT JOIN skus s ON s.id = i.sku_id
      WHERE b.status = 'active'
      GROUP BY b.id
      HAVING b.volume_capacity_cm3 - COALESCE(SUM(i.qty * s.volume_cm3), 0) >= $1
      ORDER BY available_volume ASC
    `, [minVolume]);
  }

  async findByCoords(x, y, z = 0) {
    const rows = await this.query(
      'SELECT * FROM bins WHERE x = $1 AND y = $2 AND z = $3',
      [x, y, z]
    );
    return rows[0] || null;
  }

  async findAllWithOccupancy() {
    return this.query(`
      SELECT b.*,
        COALESCE(SUM(i.qty * s.volume_cm3), 0) AS used_volume,
        COALESCE(SUM(i.qty * s.weight_kg), 0) AS used_weight,
        CASE 
          WHEN b.volume_capacity_cm3 > 0 
          THEN ROUND(COALESCE(SUM(i.qty * s.volume_cm3), 0) / b.volume_capacity_cm3 * 100, 1)
          ELSE 0 
        END AS occupancy_pct
      FROM bins b
      LEFT JOIN inventory i ON i.bin_id = b.id
      LEFT JOIN skus s ON s.id = i.sku_id
      GROUP BY b.id
      ORDER BY b.code ASC
    `);
  }

  async findByIdWithInventory(id) {
    const bins = await this.query(`
      SELECT b.*,
        COALESCE(SUM(i.qty * s.volume_cm3), 0) AS used_volume,
        COALESCE(SUM(i.qty * s.weight_kg), 0) AS used_weight,
        CASE 
          WHEN b.volume_capacity_cm3 > 0 
          THEN ROUND(COALESCE(SUM(i.qty * s.volume_cm3), 0) / b.volume_capacity_cm3 * 100, 1)
          ELSE 0 
        END AS occupancy_pct
      FROM bins b
      LEFT JOIN inventory i ON i.bin_id = b.id
      LEFT JOIN skus s ON s.id = i.sku_id
      WHERE b.id = $1
      GROUP BY b.id
    `, [id]);
    
    if (bins.length === 0) return null;
    const bin = bins[0];

    const inventory = await this.query(`
      SELECT i.*, s.name AS sku_name, s.code AS sku_code, s.barcode
      FROM inventory i
      JOIN skus s ON s.id = i.sku_id
      WHERE i.bin_id = $1
      ORDER BY s.name
    `, [id]);

    return { ...bin, inventory };
  }
}

module.exports = new BinModel();
