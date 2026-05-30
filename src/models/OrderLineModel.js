const BaseModel = require('../core/BaseModel');

class OrderLineModel extends BaseModel {
  constructor() {
    super('order_lines');
  }

  async findByOrder(orderId) {
    return this.query(`
      SELECT ol.*, s.name AS sku_name, s.code AS sku_code
      FROM order_lines ol
      JOIN skus s ON s.id = ol.sku_id
      WHERE ol.order_id = $1
    `, [orderId]);
  }

  async updateAllocated(id, qty) {
    return this.query(
      'UPDATE order_lines SET allocated_qty = allocated_qty + $1 WHERE id = $2 RETURNING *',
      [qty, id]
    );
  }
}

module.exports = new OrderLineModel();
