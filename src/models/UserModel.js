const BaseModel = require('../core/BaseModel');

class UserModel extends BaseModel {
  constructor() {
    super('users');
  }

  async findByEmail(email) {
    const rows = await this.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  }

  async findWorkersByStatus(status) {
    return this.query(
      "SELECT * FROM users WHERE role = 'worker' AND status = $1 ORDER BY name",
      [status]
    );
  }

  async findAllWorkers() {
    return this.query(
      "SELECT id, name, email, role, skills, equipment_auth, max_safe_weight, status, last_bin_id, created_at FROM users WHERE role = 'worker' ORDER BY name"
    );
  }

  async findAllManagers() {
    return this.query(
      "SELECT id, name, email, role, created_at FROM users WHERE role = 'manager' ORDER BY name"
    );
  }
}

module.exports = new UserModel();
