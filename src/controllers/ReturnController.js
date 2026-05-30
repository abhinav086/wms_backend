const BaseController = require('../core/BaseController');
const returnModel = require('../models/ReturnModel');
const returnLineModel = require('../models/ReturnLineModel');
const taskModel = require('../models/TaskModel');
const binModel = require('../models/BinModel');
const inventoryModel = require('../models/InventoryModel');
const slotting = require('../algorithms/slotting');

class ReturnController extends BaseController {
  constructor() {
    super(returnModel);
    this.getAllReturns = this.getAllReturns.bind(this);
    this.getReturnDetail = this.getReturnDetail.bind(this);
    this.createReturn = this.createReturn.bind(this);
    this.setDisposition = this.setDisposition.bind(this);
  }

  async getAllReturns(req, res) {
    try {
      const returns = await this.model.findAllWithSummary();
      this.success(res, returns);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getReturnDetail(req, res) {
    try {
      const ret = await this.model.findWithLines(req.params.id);
      if (!ret) return this.error(res, 'Return not found', 404);
      this.success(res, ret);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async createReturn(req, res) {
    try {
      const { client_id, order_id, lines } = req.body;

      if (!lines || !lines.length) {
        return this.error(res, 'Return must have at least one line');
      }

      const ret = await this.model.create({
        client_id: client_id || null,
        order_id: order_id || null,
        status: 'created',
      });

      for (const line of lines) {
        await returnLineModel.create({
          return_id: ret.id,
          sku_id: line.sku_id,
          qty: line.qty,
        });
      }

      // Create a return task
      await taskModel.create({
        type: 'return',
        status: 'offered',
        priority: 4,
        qty: lines.reduce((sum, l) => sum + l.qty, 0),
        related_return_id: ret.id,
      });

      const fullReturn = await this.model.findWithLines(ret.id);
      this.success(res, fullReturn, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async setDisposition(req, res) {
    try {
      const { id } = req.params;
      const { dispositions } = req.body;
      // dispositions: [{ line_id, disposition: 'restock'|'quarantine'|'damage' }]

      if (!dispositions || !dispositions.length) {
        return this.error(res, 'Dispositions array required');
      }

      const ret = await this.model.findById(id);

      for (const d of dispositions) {
        await returnLineModel.update(d.line_id, { disposition: d.disposition });

        const line = await returnLineModel.findById(d.line_id);
        if (!line) continue;

        // If restock, create a putaway task
        if (d.disposition === 'restock') {
          const bestBin = await slotting.findBestBin(line.sku_id, line.qty);
          await taskModel.create({
            type: 'putaway',
            status: 'offered',
            priority: 3,
            sku_id: line.sku_id,
            qty: line.qty,
            dest_bin_id: bestBin ? bestBin.id : null,
            related_return_id: id,
          });
        } else if (d.disposition === 'damage' || d.disposition === 'quarantine') {
          // Find or create QA-01 bin
          let qaBins = await binModel.findAll({ code: 'QA-01' });
          let qaBin = qaBins[0];
          if (!qaBin) {
            qaBin = await binModel.create({
              code: 'QA-01', x: 0, y: 0, z: 0,
              int_length_cm: 200, int_width_cm: 200, int_height_cm: 200,
              volume_capacity_cm3: 8000000, max_weight_kg: 5000,
              allowed_handling_classes: '{general,fragile,heavy,hazardous}',
              status: 'active'
            });
          }
          
          // Add directly to inventory in QA bin
          await inventoryModel.create({
            client_id: ret.client_id,
            sku_id: line.sku_id,
            bin_id: qaBin.id,
            qty: line.qty,
            status: d.disposition === 'damage' ? 'damaged' : 'hold'
          });
        }
      }

      await this.model.update(id, { status: 'dispositioned' });

      const fullReturn = await this.model.findWithLines(id);
      this.success(res, fullReturn);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new ReturnController();
