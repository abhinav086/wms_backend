const BaseController = require('../core/BaseController');
const receiptModel = require('../models/ReceiptModel');
const receiptLineModel = require('../models/ReceiptLineModel');
const taskModel = require('../models/TaskModel');
const skuModel = require('../models/SKUModel');
const notificationModel = require('../models/NotificationModel');

class ReceiptController extends BaseController {
  constructor() {
    super(receiptModel);
    this.getAllReceipts = this.getAllReceipts.bind(this);
    this.getReceiptDetail = this.getReceiptDetail.bind(this);
    this.createReceipt = this.createReceipt.bind(this);
    this.deleteReceipt = this.deleteReceipt.bind(this);
  }

  async getAllReceipts(req, res) {
    try {
      const receipts = await this.model.findAllWithSummary();
      this.success(res, receipts);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getReceiptDetail(req, res) {
    try {
      const receipt = await this.model.findWithLines(req.params.id);
      if (!receipt) return this.error(res, 'Receipt not found', 404);
      this.success(res, receipt);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async createReceipt(req, res) {
    try {
      const { client_id, lines } = req.body;

      if (!lines || !lines.length) {
        return this.error(res, 'Receipt must have at least one line');
      }

      const slotting = require('../algorithms/slotting');
      for (const line of lines) {
        const bin = await slotting.findBestBin(line.sku_id, line.qty);
        if (!bin) {
          const sku = await skuModel.findById(line.sku_id);
          return res.status(409).json({
            success: false,
            requires_new_bin: true,
            message: `Warehouse bins do not have enough capacity to hold ${line.qty} units of ${sku ? sku.name : 'SKU'}. Please create a new high-capacity bin first.`
          });
        }
      }

      const receipt = await this.model.create({
        client_id: client_id || null,
        status: 'created',
      });

      for (const line of lines) {
        await receiptLineModel.create({
          receipt_id: receipt.id,
          sku_id: line.sku_id,
          qty: line.qty,
        });

        // Get SKU info for handling classes
        const sku = await skuModel.findById(line.sku_id);

        // Create a receive task for each line
        await taskModel.create({
          type: 'receive',
          status: 'offered',
          priority: 5,
          sku_id: line.sku_id,
          qty: line.qty,
          required_handling: sku ? sku.handling_classes : [],
          required_weight_class: sku ? sku.weight_kg * line.qty : 0,
          related_receipt_id: receipt.id,
        });
      }

      const fullReceipt = await this.model.findWithLines(receipt.id);
      
      // Run auto-assigner synchronously to immediately assign newly created tasks
      const { runAutoAssignerCycle } = require('../algorithms/taskRouting');
      const assignments = await runAutoAssignerCycle();
      
      let message = `New Inbound Receipt created! ${lines.length} items waiting at the dock.`;
      if (assignments.length > 0) {
        const uniqueWorkers = [...new Set(assignments.map(a => a.workerName))];
        message += ` Tasks were immediately auto-assigned to: ${uniqueWorkers.join(', ')}.`;
      }
      
      // Notify workers there are new receive tasks
      await notificationModel.notify(message, 'info', 'worker');

      this.success(res, { ...fullReceipt, message }, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async deleteReceipt(req, res) {
    try {
      const receiptId = req.params.id;
      await this.model.query("DELETE FROM tasks WHERE related_receipt_id = $1", [receiptId]);
      await this.model.query("DELETE FROM receipt_lines WHERE receipt_id = $1", [receiptId]);
      await this.model.delete(receiptId);
      this.success(res, { message: 'Receipt deleted successfully' });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new ReceiptController();
