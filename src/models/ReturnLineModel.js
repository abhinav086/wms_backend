const BaseModel = require('../core/BaseModel');

class ReturnLineModel extends BaseModel {
  constructor() {
    super('return_lines');
  }

  async findByReturn(returnId) {
    return this.query(`
      SELECT rl.*, s.name AS sku_name, s.code AS sku_code
      FROM return_lines rl
      JOIN skus s ON s.id = rl.sku_id
      WHERE rl.return_id = $1
      ORDER BY s.name
    `, [returnId]);
  }
}

module.exports = new ReturnLineModel();
