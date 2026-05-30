const BaseModel = require('../core/BaseModel');

class ReceiptLineModel extends BaseModel {
  constructor() {
    super('receipt_lines');
  }

  async findByReceipt(receiptId) {
    return this.query(`
      SELECT rl.*, s.name AS sku_name, s.code AS sku_code, s.barcode
      FROM receipt_lines rl
      JOIN skus s ON s.id = rl.sku_id
      WHERE rl.receipt_id = $1
      ORDER BY s.name
    `, [receiptId]);
  }
}

module.exports = new ReceiptLineModel();
