const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const BaseController = require('../core/BaseController');
const userModel = require('../models/UserModel');

class AuthController extends BaseController {
  constructor() {
    super(userModel);
    this.login = this.login.bind(this);
    this.me = this.me.bind(this);
    this.register = this.register.bind(this);
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return this.error(res, 'Email and password are required');
      }

      const user = await this.model.findByEmail(email);
      if (!user) {
        return this.error(res, 'Invalid email or password', 401);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return this.error(res, 'Invalid email or password', 401);
      }

      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
        name: user.name,
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      });

      // Don't send password hash back
      const { password_hash, ...userData } = user;

      this.success(res, { token, user: userData });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async me(req, res) {
    try {
      const user = await this.model.findById(req.user.id);
      if (!user) return this.error(res, 'User not found', 404);
      const { password_hash, ...userData } = user;
      this.success(res, userData);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async register(req, res) {
    try {
      const { email, password, name, role, client_id, skills, equipment_auth, max_safe_weight } = req.body;

      if (!email || !password || !name || !role) {
        return this.error(res, 'Email, password, name and role are required');
      }

      const existing = await this.model.findByEmail(email);
      if (existing) {
        return this.error(res, 'Email already exists', 409);
      }

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      const user = await this.model.create({
        email,
        password_hash,
        name,
        role,
        client_id: client_id || null,
        skills: skills || [],
        equipment_auth: equipment_auth || [],
        max_safe_weight: max_safe_weight || 25,
        status: 'offline',
      });

      const { password_hash: _, ...userData } = user;
      this.success(res, userData, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new AuthController();
