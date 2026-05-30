const BaseModel = require('../core/BaseModel');

class ReceiptModel extends BaseModel {
  constructor() {
    super('receipts');
  }

  async findByStatus(status) {
    return this.findAll({ status });
  }

  async findWithLines(receiptId) {
    const receipt = await this.findById(receiptId);
    if (!receipt) return null;

    const lines = await this.query(`
      SELECT rl.*, s.name AS sku_name, s.code AS sku_code, s.barcode
      FROM receipt_lines rl
      JOIN skus s ON s.id = rl.sku_id
      WHERE rl.receipt_id = $1
      ORDER BY s.name
    `, [receiptId]);

    return { ...receipt, lines };
  }

  async findAllWithSummary() {
    return this.query(`
      SELECT r.*,
        COUNT(rl.id) AS line_count,
        SUM(rl.qty) AS total_qty
      FROM receipts r
      LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
  }
}

module.exports = new ReceiptModel();
