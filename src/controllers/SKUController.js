const BaseController = require('../core/BaseController');
const skuModel = require('../models/SKUModel');

class SKUController extends BaseController {
  constructor() {
    super(skuModel);
    this.findByBarcode = this.findByBarcode.bind(this);
    this.search = this.search.bind(this);
    this.create = this.create.bind(this);
  }

  async create(req, res) {
    try {
      const data = { ...req.body };
      if (!data.code || data.code.trim() === '') {
        data.code = 'SKU-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
      }
      if (!data.barcode || data.barcode.trim() === '') {
        data.barcode = Math.floor(1000000000 + Math.random() * 9000000000).toString();
      }
      const record = await this.model.create(data);
      this.success(res, record, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async search(req, res) {
    try {
      const skus = await this.model.search(req.query);
      this.success(res, skus);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async findByBarcode(req, res) {
    try {
      const skus = await this.model.findByBarcode(req.params.code);
      if (!skus.length) return this.error(res, 'SKU not found', 404);
      this.success(res, skus[0]);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new SKUController();
