const BaseController = require('../core/BaseController');
const inventoryModel = require('../models/InventoryModel');

class InventoryController extends BaseController {
  constructor() {
    super(inventoryModel);
    this.search = this.search.bind(this);
    this.getLocations = this.getLocations.bind(this);
    this.getSummary = this.getSummary.bind(this);
  }

  async search(req, res) {
    try {
      const inventory = await this.model.search(req.query);
      this.success(res, inventory);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getLocations(req, res) {
    try {
      const locations = await this.model.findLocations(req.params.sku_id);
      this.success(res, locations);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getSummary(req, res) {
    try {
      const summary = await this.model.getSummary();
      this.success(res, summary);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new InventoryController();
