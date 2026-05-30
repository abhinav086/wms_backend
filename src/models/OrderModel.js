const BaseModel = require('../core/BaseModel');

class OrderModel extends BaseModel {
  constructor() {
    super('orders');
  }

  async findByStatus(status) {
    return this.findAll({ status });
  }

  async findWithLines(orderId) {
    const order = await this.findById(orderId);
    if (!order) return null;

    const lines = await this.query(`
      SELECT ol.*, s.name AS sku_name, s.code AS sku_code, s.barcode
      FROM order_lines ol
      JOIN skus s ON s.id = ol.sku_id
      WHERE ol.order_id = $1
      ORDER BY s.name
    `, [orderId]);

    const tasks = await this.query(`
      SELECT t.*, s.name AS sku_name, ob.code AS origin_bin_code, db.code AS dest_bin_code,
        u.name AS assignee_name
      FROM tasks t
      LEFT JOIN skus s ON s.id = t.sku_id
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.related_order_id = $1
      ORDER BY t.created_at
    `, [orderId]);

    return { ...order, lines, tasks };
  }

  async findAllWithSummary() {
    return this.query(`
      SELECT o.*,
        COUNT(ol.id) AS line_count,
        SUM(ol.qty) AS total_qty,
        SUM(ol.allocated_qty) AS total_allocated
      FROM orders o
      LEFT JOIN order_lines ol ON ol.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
  }
}

module.exports = new OrderModel();
