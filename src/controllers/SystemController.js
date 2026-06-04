const BaseController = require('../core/BaseController');
const pool = require('../core/db');

class SystemController {
  constructor() {
    this.wipeData = this.wipeData.bind(this);
  }

  async wipeData(req, res) {
    try {
      // Begin transaction to ensure safe wipe
      await pool.query('BEGIN');

      // 1. Detach foreign keys from users so we can wipe clients and bins safely
      await pool.query('UPDATE users SET client_id = NULL, last_bin_id = NULL');

      // 2. Delete data in correct reverse-dependency order
      // Level 1: Logs and joining tables
      await pool.query('DELETE FROM movements');
      await pool.query('DELETE FROM tasks');
      await pool.query('DELETE FROM notifications');
      await pool.query('DELETE FROM order_lines');
      await pool.query('DELETE FROM receipt_lines');
      await pool.query('DELETE FROM return_lines');
      
      // Level 2: Inventory which depends on skus and bins
      await pool.query('DELETE FROM inventory');

      // Level 3: Headers
      await pool.query('DELETE FROM orders');
      await pool.query('DELETE FROM receipts');
      await pool.query('DELETE FROM returns');

      // Level 4: Master data
      await pool.query('DELETE FROM skus');
      await pool.query('DELETE FROM bins');
      
      // Level 5: Top level master data
      await pool.query('DELETE FROM clients');

      await pool.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'System data wiped successfully. Workers preserved.',
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error('System Wipe Error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to wipe system data: ' + err.message,
      });
    }
  }
}

module.exports = new SystemController();
