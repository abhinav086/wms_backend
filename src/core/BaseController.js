class BaseController {
  constructor(model) {
    this.model = model;
    // Bind all methods to preserve 'this' context in route callbacks
    this.getAll = this.getAll.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
  }

  // Standard success response
  success(res, data, statusCode = 200) {
    return res.status(statusCode).json({ success: true, data });
  }

  // Standard error response
  error(res, message, statusCode = 400) {
    return res.status(statusCode).json({ success: false, message });
  }

  // Wrap async handlers to auto-catch errors
  asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  }

  // Generic CRUD handlers — override in child if needed
  async getAll(req, res) {
    try {
      const records = await this.model.findAll();
      this.success(res, records);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getById(req, res) {
    try {
      const record = await this.model.findById(req.params.id);
      if (!record) return this.error(res, 'Not found', 404);
      this.success(res, record);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async create(req, res) {
    try {
      const record = await this.model.create(req.body);
      this.success(res, record, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async update(req, res) {
    try {
      const record = await this.model.update(req.params.id, req.body);
      if (!record) return this.error(res, 'Not found', 404);
      this.success(res, record);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async delete(req, res) {
    try {
      await this.model.delete(req.params.id);
      this.success(res, { message: 'Deleted successfully' });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = BaseController;
