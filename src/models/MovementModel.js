const BaseModel = require('../core/BaseModel');

class MovementModel extends BaseModel {
  constructor() {
    super('movements');
  }

  async findByInventory(inventoryId) {
    return this.query(`
      SELECT m.*, u.name AS actor_name,
        fb.code AS from_bin_code, tb.code AS to_bin_code
      FROM movements m
      LEFT JOIN users u ON u.id = m.actor_id
      LEFT JOIN bins fb ON fb.id = m.from_bin_id
      LEFT JOIN bins tb ON tb.id = m.to_bin_id
      WHERE m.inventory_id = $1
      ORDER BY m.ts DESC
    `, [inventoryId]);
  }

  async findByActor(actorId) {
    return this.query(`
      SELECT m.*, 
        fb.code AS from_bin_code, tb.code AS to_bin_code
      FROM movements m
      LEFT JOIN bins fb ON fb.id = m.from_bin_id
      LEFT JOIN bins tb ON tb.id = m.to_bin_id
      WHERE m.actor_id = $1
      ORDER BY m.ts DESC
      LIMIT 100
    `, [actorId]);
  }

  async logMovement(data) {
    return this.create(data);
  }
}

module.exports = new MovementModel();
