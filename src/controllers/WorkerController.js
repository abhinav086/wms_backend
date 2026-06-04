const bcrypt = require('bcryptjs');
const BaseController = require('../core/BaseController');
const userModel = require('../models/UserModel');

class WorkerController extends BaseController {
  constructor() {
    super(userModel);
    this.getAllWorkers = this.getAllWorkers.bind(this);
    this.getPositions = this.getPositions.bind(this);
    this.createWorker = this.createWorker.bind(this);
    this.updateWorker = this.updateWorker.bind(this);
    this.toggleStatus = this.toggleStatus.bind(this);
  }

  async getAllWorkers(req, res) {
    try {
      const workers = await this.model.findAllWorkers();
      this.success(res, workers);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getPositions(req, res) {
    try {
      const sql = `
        SELECT u.id, u.name, u.status, u.role,
          t.id AS active_task_id, t.type AS task_type, t.status AS task_status,
          ob.x AS origin_x, ob.y AS origin_y, ob.z AS origin_z,
          db.x AS dest_x, db.y AS dest_y, db.z AS dest_z
        FROM users u
        LEFT JOIN tasks t ON t.assignee_id = u.id AND t.status IN ('accepted', 'in_progress')
        LEFT JOIN bins ob ON ob.id = t.origin_bin_id
        LEFT JOIN bins db ON db.id = t.dest_bin_id
        WHERE u.role = 'worker'
      `;
      const rows = await this.model.query(sql);
      this.success(res, rows);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async createWorker(req, res) {
    try {
      const { email, password, name, skills, equipment_auth, max_safe_weight, client_id } = req.body;

      if (!email || !password || !name) {
        return this.error(res, 'Email, password and name are required');
      }

      const existing = await this.model.findByEmail(email);
      if (existing) return this.error(res, 'Email already exists', 409);

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      const worker = await this.model.create({
        email,
        password_hash,
        name,
        role: 'worker',
        client_id: client_id || null,
        skills: skills || [],
        equipment_auth: equipment_auth || [],
        max_safe_weight: max_safe_weight || 25,
        status: 'offline',
      });

      const { password_hash: _, ...workerData } = worker;
      this.success(res, workerData, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async updateWorker(req, res) {
    try {
      const { id } = req.params;
      const { name, email, skills, equipment_auth, max_safe_weight, password } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (skills) updateData.skills = skills;
      if (equipment_auth) updateData.equipment_auth = equipment_auth;
      if (max_safe_weight !== undefined) updateData.max_safe_weight = max_safe_weight;
      
      if (password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password_hash = await bcrypt.hash(password, salt);
      }

      const worker = await this.model.update(id, updateData);
      if (!worker) return this.error(res, 'Worker not found', 404);

      const { password_hash, ...workerData } = worker;
      this.success(res, workerData);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['available', 'busy', 'offline'].includes(status)) {
        return this.error(res, 'Status must be available, busy, or offline');
      }

      const worker = await this.model.update(id, { status });
      if (!worker) return this.error(res, 'Worker not found', 404);

      const { password_hash, ...workerData } = worker;
      this.success(res, workerData);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new WorkerController();
