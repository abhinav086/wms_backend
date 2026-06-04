const BaseModel = require('../core/BaseModel');

class TaskModel extends BaseModel {
  constructor() {
    super('tasks');
  }

  async findByStatus(status) {
    return this.findAll({ status });
  }

  async findOffered() {
    return this.query(`
      SELECT t.*, s.name AS sku_name, s.code AS sku_code,
        ob.code AS origin_bin_code, db.code AS dest_bin_code,
        u.name AS assignee_name, o.ship_to AS order_ship_to
      FROM tasks t
      LEFT JOIN skus s ON s.id = t.sku_id
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN orders o ON o.id = t.related_order_id
      WHERE t.status = 'offered'
      ORDER BY t.priority DESC, t.created_at ASC
    `);
  }

  async findNextForWorker(workerId) {
    // This is a simplified version; the full routing logic is in algorithms/taskRouting.js
    return this.query(`
      SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode,
        ob.code AS origin_bin_code, ob.x AS origin_x, ob.y AS origin_y,
        db.code AS dest_bin_code, db.x AS dest_x, db.y AS dest_y,
        o.ship_to AS order_ship_to
      FROM tasks t
      LEFT JOIN skus s ON s.id = t.sku_id
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      LEFT JOIN orders o ON o.id = t.related_order_id
      WHERE t.status = 'offered'
        AND (t.assignee_id IS NULL OR t.assignee_id = $1)
      ORDER BY t.priority DESC, t.created_at ASC
      LIMIT 1
    `, [workerId]);
  }

  async findAllWithDetails(filters = {}) {
    let sql = `
      SELECT t.*, s.name AS sku_name, s.code AS sku_code,
        ob.code AS origin_bin_code, db.code AS dest_bin_code,
        u.name AS assignee_name, o.ship_to AS order_ship_to
      FROM tasks t
      LEFT JOIN skus s ON s.id = t.sku_id
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN orders o ON o.id = t.related_order_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (filters.status) {
      sql += ` AND t.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.type) {
      sql += ` AND t.type = $${idx++}`;
      params.push(filters.type);
    }
    if (filters.assignee_id) {
      sql += ` AND t.assignee_id = $${idx++}`;
      params.push(filters.assignee_id);
    }
    if (filters.related_order_id) {
      sql += ` AND t.related_order_id = $${idx++}`;
      params.push(filters.related_order_id);
    }

    sql += ' ORDER BY t.priority DESC, t.created_at DESC';
    return this.query(sql, params);
  }

  async findWorkerHistory(workerId) {
    return this.query(`
      SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode,
        ob.code AS origin_bin_code, db.code AS dest_bin_code,
        o.ship_to AS order_ship_to
      FROM tasks t
      LEFT JOIN skus s ON s.id = t.sku_id
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      LEFT JOIN orders o ON o.id = t.related_order_id
      WHERE t.assignee_id = $1 AND t.status IN ('done', 'expired', 'declined')
      ORDER BY t.completed_at DESC NULLS LAST, t.created_at DESC
    `, [workerId]);
  }

  async accept(taskId, workerId) {
    return this.query(
      `UPDATE tasks SET status = 'accepted', assignee_id = $1, accepted_at = NOW()
       WHERE id = $2 RETURNING *`,
      [workerId, taskId]
    );
  }

  async decline(taskId) {
    return this.query(
      `UPDATE tasks SET status = 'declined'
       WHERE id = $1 RETURNING *`,
      [taskId]
    );
  }

  async complete(taskId, overrideReason = null) {
    return this.query(
      `UPDATE tasks SET status = 'done', completed_at = NOW(), override_reason = $1
       WHERE id = $2 RETURNING *`,
      [overrideReason, taskId]
    );
  }
}

module.exports = new TaskModel();
