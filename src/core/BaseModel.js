const pool = require('./db');

class BaseModel {
  constructor(tableName) {
    this.table = tableName;
    this.db = pool;
  }

  // Execute any raw SQL query
  async query(sql, params = []) {
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  // Find all records, optional WHERE clause
  async findAll(where = {}, orderBy = 'created_at DESC') {
    const keys = Object.keys(where);
    if (keys.length === 0) {
      return this.query(`SELECT * FROM ${this.table} ORDER BY ${orderBy}`);
    }
    const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    return this.query(
      `SELECT * FROM ${this.table} WHERE ${conditions} ORDER BY ${orderBy}`,
      Object.values(where)
    );
  }

  // Find single record by primary key
  async findById(id) {
    const rows = await this.query(
      `SELECT * FROM ${this.table} WHERE id = $1`, [id]
    );
    return rows[0] || null;
  }

  // Insert new record, returns created row
  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const cols = keys.join(', ');
    const rows = await this.query(
      `INSERT INTO ${this.table} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rows[0];
  }

  // Update record by id, returns updated row
  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const rows = await this.query(
      `UPDATE ${this.table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0];
  }

  // Delete record by id
  async delete(id) {
    return this.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }
}

module.exports = BaseModel;
