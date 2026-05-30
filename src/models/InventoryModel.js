const BaseModel = require('../core/BaseModel');

class InventoryModel extends BaseModel {
  constructor() {
    super('inventory');
  }

  async findBySku(skuId) {
    return this.query(`
      SELECT i.*, b.code AS bin_code, b.x, b.y, b.z
      FROM inventory i
      JOIN bins b ON b.id = i.bin_id
      WHERE i.sku_id = $1
      ORDER BY b.code
    `, [skuId]);
  }

  async findByBin(binId) {
    return this.query(`
      SELECT i.*, s.name AS sku_name, s.code AS sku_code
      FROM inventory i
      JOIN skus s ON s.id = i.sku_id
      WHERE i.bin_id = $1
      ORDER BY s.name
    `, [binId]);
  }

  async findLocations(skuId) {
    return this.query(`
      SELECT i.id, i.qty, i.status, b.id AS bin_id, b.code AS bin_code, b.x, b.y, b.z
      FROM inventory i
      JOIN bins b ON b.id = i.bin_id
      WHERE i.sku_id = $1 AND i.qty > 0
      ORDER BY b.code
    `, [skuId]);
  }

  async getSummary() {
    return this.query(`
      SELECT s.id AS sku_id, s.code AS sku_code, s.name AS sku_name,
        SUM(CASE WHEN i.status = 'available' THEN i.qty ELSE 0 END) AS available_qty,
        SUM(CASE WHEN i.status = 'allocated' THEN i.qty ELSE 0 END) AS allocated_qty,
        SUM(CASE WHEN i.status = 'hold' THEN i.qty ELSE 0 END) AS hold_qty,
        SUM(i.qty) AS total_qty,
        COUNT(DISTINCT i.bin_id) AS bin_count
      FROM skus s
      LEFT JOIN inventory i ON i.sku_id = s.id
      GROUP BY s.id, s.code, s.name
      ORDER BY s.name
    `);
  }

  async search(filters = {}) {
    let sql = `
      SELECT i.*, s.name AS sku_name, s.code AS sku_code, s.barcode,
        b.code AS bin_code, b.x, b.y
      FROM inventory i
      JOIN skus s ON s.id = i.sku_id
      JOIN bins b ON b.id = i.bin_id
      WHERE i.qty > 0
    `;
    const params = [];
    let idx = 1;

    if (filters.sku_id) {
      sql += ` AND i.sku_id = $${idx++}`;
      params.push(filters.sku_id);
    }
    if (filters.bin_id) {
      sql += ` AND i.bin_id = $${idx++}`;
      params.push(filters.bin_id);
    }
    if (filters.status) {
      sql += ` AND i.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.search) {
      sql += ` AND (s.name ILIKE $${idx} OR s.code ILIKE $${idx} OR b.code ILIKE $${idx})`;
      params.push(`%${filters.search}%`);
      idx++;
    }

    sql += ' ORDER BY s.name, b.code';
    return this.query(sql, params);
  }

  async findOrCreate(skuId, binId, clientId) {
    const existing = await this.query(
      "SELECT * FROM inventory WHERE sku_id = $1 AND bin_id = $2 AND status = 'available'",
      [skuId, binId]
    );
    if (existing.length > 0) return existing[0];
    return this.create({
      sku_id: skuId,
      bin_id: binId,
      client_id: clientId,
      qty: 0,
      status: 'available',
    });
  }
}

module.exports = new InventoryModel();
