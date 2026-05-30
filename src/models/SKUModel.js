const BaseModel = require('../core/BaseModel');

class SKUModel extends BaseModel {
  constructor() {
    super('skus');
  }

  async findByBarcode(barcode) {
    const rows = await this.query('SELECT * FROM skus WHERE barcode = $1', [barcode]);
    return rows;
  }

  async findByClient(clientId) {
    return this.findAll({ client_id: clientId });
  }

  async findByVelocityClass(velocityClass) {
    return this.findAll({ velocity_class: velocityClass });
  }

  async search(filters = {}) {
    let sql = 'SELECT * FROM skus WHERE 1=1';
    const params = [];
    let idx = 1;

    if (filters.client_id) {
      sql += ` AND client_id = $${idx++}`;
      params.push(filters.client_id);
    }
    if (filters.velocity_class) {
      sql += ` AND velocity_class = $${idx++}`;
      params.push(filters.velocity_class);
    }
    if (filters.search) {
      sql += ` AND (name ILIKE $${idx} OR code ILIKE $${idx})`;
      params.push(`%${filters.search}%`);
      idx++;
    }

    sql += ' ORDER BY created_at DESC';
    return this.query(sql, params);
  }
}

module.exports = new SKUModel();
