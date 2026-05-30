const BaseController = require('../core/BaseController');
const userModel = require('../models/UserModel');
const taskModel = require('../models/TaskModel');
const binModel = require('../models/BinModel');
const skuModel = require('../models/SKUModel');

class ScanController extends BaseController {
  constructor() {
    super(userModel);
    this.handleScan = this.handleScan.bind(this);
  }

  async handleScan(req, res) {
    try {
      const { barcode, task_id, worker_id } = req.body;

      if (!barcode) return this.error(res, 'Barcode is required');

      const result = {
        barcode,
        type: null,
        data: null,
        valid: false,
        message: '',
      };

      // Try to identify the barcode — could be SKU or Bin
      const skuResults = await skuModel.findByBarcode(barcode);
      if (skuResults.length > 0) {
        result.type = 'sku';
        result.data = skuResults[0];
        result.valid = true;
        result.message = `SKU found: ${skuResults[0].name}`;
      }

      if (!result.valid) {
        // Check if it's a bin code
        const bins = await binModel.query(
          'SELECT * FROM bins WHERE code = $1', [barcode]
        );
        if (bins.length > 0) {
          result.type = 'bin';
          result.data = bins[0];
          result.valid = true;
          result.message = `Bin found: ${bins[0].code}`;
        }
      }

      if (!result.valid) {
        result.message = 'Barcode not recognized';
        return this.success(res, result);
      }

      // Update worker's last bin if scanning a bin
      if (worker_id && result.type === 'bin') {
        await userModel.update(worker_id, { last_bin_id: result.data.id });
      }

      // Validate against current task if task_id provided
      if (task_id) {
        const task = await taskModel.findById(task_id);
        if (task) {
          if (result.type === 'sku' && task.sku_id === result.data.id) {
            result.message += ' — matches current task SKU ✓';
          } else if (result.type === 'bin') {
            if (task.origin_bin_id === result.data.id) {
              result.message += ' — matches task origin bin ✓';
            } else if (task.dest_bin_id === result.data.id) {
              result.message += ' — matches task destination bin ✓';
            }
          }

          // Update task to in_progress if it was accepted
          if (task.status === 'accepted') {
            await taskModel.update(task_id, { status: 'in_progress' });
          }
        }
      }

      this.success(res, result);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new ScanController();
