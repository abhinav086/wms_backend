const BaseController = require('../core/BaseController');
const inventoryModel = require('../models/InventoryModel');
const skuModel = require('../models/SKUModel');
const binModel = require('../models/BinModel');
const movementModel = require('../models/MovementModel');
const pool = require('../core/db');

class InventoryController extends BaseController {
  constructor() {
    super(inventoryModel);
    this.search = this.search.bind(this);
    this.getLocations = this.getLocations.bind(this);
    this.getSummary = this.getSummary.bind(this);
    this.addInventory = this.addInventory.bind(this);
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

  async addInventory(req, res) {
    try {
      const { sku_id, bin_id, qty } = req.body;
      const parsedQty = parseInt(qty, 10);

      if (!sku_id || !bin_id || !parsedQty || parsedQty <= 0) {
        return this.error(res, 'sku_id, bin_id, and positive qty are required', 400);
      }

      const sku = await skuModel.findById(sku_id);
      if (!sku) return this.error(res, 'SKU not found', 404);

      const bin = await binModel.findById(bin_id);
      if (!bin) return this.error(res, 'Bin not found', 404);

      // Check capacity
      const addedVolume = (sku.volume_cm3 || 0) * parsedQty;
      const addedWeight = (sku.weight_kg || 0) * parsedQty;

      // Get current available capacity
      const sql = `
        SELECT
          b.volume_capacity_cm3 - COALESCE(SUM(i.qty * s.volume_cm3), 0) AS available_volume,
          b.max_weight_kg - COALESCE(SUM(i.qty * s.weight_kg), 0) AS available_weight
        FROM bins b
        LEFT JOIN inventory i ON i.bin_id = b.id AND i.status = 'available'
        LEFT JOIN skus s ON s.id = i.sku_id
        WHERE b.id = $1
        GROUP BY b.id
      `;
      const { rows } = await pool.query(sql, [bin_id]);
      const availVol = rows[0]?.available_volume || bin.volume_capacity_cm3;
      const availWeight = rows[0]?.available_weight || bin.max_weight_kg;

      if (addedVolume > availVol || addedWeight > availWeight) {
        return res.status(409).json({
          success: false,
          requires_new_bin: true,
          message: `Capacity exceeded. Added weight/volume: ${addedWeight}kg / ${addedVolume}cm³. Available: ${availWeight}kg / ${availVol}cm³.`
        });
      }

      // Add to inventory
      const inv = await this.model.findOrCreate(sku_id, bin_id, sku.client_id);
      await this.model.update(inv.id, { qty: inv.qty + parsedQty });

      await movementModel.logMovement({
        inventory_id: inv.id,
        type: 'putaway',
        qty_delta: parsedQty,
        from_bin_id: null,
        to_bin_id: bin_id,
        actor_id: req.user?.id,
        reason: 'Manual Add Inventory',
      });

      this.success(res, { message: 'Inventory added successfully' });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new InventoryController();
