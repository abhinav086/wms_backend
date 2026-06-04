const BaseController = require('../core/BaseController');
const binModel = require('../models/BinModel');

class BinController extends BaseController {
  constructor() {
    super(binModel);
    this.getAllWithOccupancy = this.getAllWithOccupancy.bind(this);
    this.getByIdWithInventory = this.getByIdWithInventory.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
  }

  async create(req, res) {
    try {
      const data = { ...req.body };
      
      // Enforce unique coordinates
      const existingBin = await this.model.findByCoords(data.x, data.y, data.z);
      if (existingBin) {
        return this.error(res, `A bin already exists at coordinates X:${data.x}, Y:${data.y}, Z:${data.z || 0} (${existingBin.code})`);
      }

      if (!data.code || data.code.trim() === '') {
        data.code = 'BIN-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
      }
      const record = await this.model.create(data);
      this.success(res, record, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const data = { ...req.body };
      
      // Enforce unique coordinates on update
      if (data.x !== undefined && data.y !== undefined) {
        const existingBin = await this.model.findByCoords(data.x, data.y, data.z);
        if (existingBin && existingBin.id !== id) {
          return this.error(res, `A bin already exists at coordinates X:${data.x}, Y:${data.y}, Z:${data.z || 0} (${existingBin.code})`);
        }
      }

      const record = await this.model.update(id, data);
      if (!record) return this.error(res, 'Not found', 404);
      this.success(res, record);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getAllWithOccupancy(req, res) {
    try {
      const bins = await this.model.findAllWithOccupancy();
      this.success(res, bins);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getByIdWithInventory(req, res) {
    try {
      const bin = await this.model.findByIdWithInventory(req.params.id);
      if (!bin) return this.error(res, 'Bin not found', 404);
      this.success(res, bin);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new BinController();
