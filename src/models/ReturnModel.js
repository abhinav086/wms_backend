const BaseModel = require('../core/BaseModel');

class ReturnModel extends BaseModel {
  constructor() {
    super('returns');
  }

  async findByOrder(orderId) {
    return this.findAll({ order_id: orderId });
  }

  async findWithLines(returnId) {
    const ret = await this.findById(returnId);
    if (!ret) return null;

    const lines = await this.query(`
      SELECT rl.*, s.name AS sku_name, s.code AS sku_code, s.barcode
      FROM return_lines rl
      JOIN skus s ON s.id = rl.sku_id
      WHERE rl.return_id = $1
      ORDER BY s.name
    `, [returnId]);

    return { ...ret, lines };
  }

  async findAllWithSummary() {
    return this.query(`
      SELECT r.*, o.ship_to,
        COUNT(rl.id) AS line_count,
        SUM(rl.qty) AS total_qty,
        SUM(CASE WHEN rl.disposition = 'restock' THEN rl.qty ELSE 0 END) as restocked_qty,
        SUM(CASE WHEN rl.disposition IN ('damage', 'quarantine') THEN rl.qty ELSE 0 END) as hold_qty
      FROM returns r
      LEFT JOIN orders o ON o.id = r.order_id
      LEFT JOIN return_lines rl ON rl.return_id = r.id
      GROUP BY r.id, o.ship_to
      ORDER BY r.created_at DESC
    `);
  }
}

module.exports = new ReturnModel();
