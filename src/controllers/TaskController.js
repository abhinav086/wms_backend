const BaseController = require('../core/BaseController');
const taskModel = require('../models/TaskModel');
const userModel = require('../models/UserModel');
const inventoryModel = require('../models/InventoryModel');
const movementModel = require('../models/MovementModel');
const notificationModel = require('../models/NotificationModel');
const binModel = require('../models/BinModel');
const orderModel = require('../models/OrderModel');
const returnModel = require('../models/ReturnModel');
const returnLineModel = require('../models/ReturnLineModel');
const taskRouting = require('../algorithms/taskRouting');

class TaskController extends BaseController {
  constructor() {
    super(taskModel);
    this.getAllTasks = this.getAllTasks.bind(this);
    this.getNextForWorker = this.getNextForWorker.bind(this);
    this.getPendingForWorker = this.getPendingForWorker.bind(this);
    this.getHistoryForWorker = this.getHistoryForWorker.bind(this);
    this.acceptTask = this.acceptTask.bind(this);
    this.declineTask = this.declineTask.bind(this);
    this.completeTask = this.completeTask.bind(this);
  }

  async getAllTasks(req, res) {
    try {
      const tasks = await this.model.findAllWithDetails(req.query);
      this.success(res, tasks);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getNextForWorker(req, res) {
    try {
      const { worker_id } = req.query;
      if (!worker_id) return this.error(res, 'worker_id query param required');

      const task = await taskRouting.findNextTask(worker_id);
      if (!task) {
        return this.success(res, null);
      }
      this.success(res, task);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getPendingForWorker(req, res) {
    try {
      const { worker_id } = req.query;
      if (!worker_id) return this.error(res, 'worker_id query param required');

      const pool = require('../core/db');
      const { rows: tasks } = await pool.query(`
        SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode, s.weight_kg AS sku_weight_kg,
          ob.code AS origin_bin_code, ob.x AS origin_x, ob.y AS origin_y,
          db.code AS dest_bin_code, db.x AS dest_x, db.y AS dest_y,
          o.ship_to AS order_ship_to
        FROM tasks t
        LEFT JOIN skus s ON s.id = t.sku_id
        LEFT JOIN bins ob ON ob.id = t.origin_bin_id
        LEFT JOIN bins db ON db.id = t.dest_bin_id
        LEFT JOIN orders o ON o.id = t.related_order_id
        WHERE t.assignee_id = $1 AND t.status IN ('offered', 'accepted', 'in_progress')
        ORDER BY 
          CASE WHEN t.status IN ('accepted', 'in_progress') THEN 0 ELSE 1 END,
          t.priority DESC, 
          t.created_at ASC
      `, [worker_id]);

      this.success(res, tasks);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getHistoryForWorker(req, res) {
    try {
      const workerId = req.query.worker_id || req.user.id;
      if (!workerId) return this.error(res, 'worker_id query param required');

      const tasks = await this.model.findWorkerHistory(workerId);
      this.success(res, tasks);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async acceptTask(req, res) {
    try {
      const { id } = req.params;
      const workerId = req.body.worker_id || req.user.id;

      const task = await this.model.findById(id);
      if (!task) return this.error(res, 'Task not found', 404);
      if (task.status !== 'offered') return this.error(res, 'Task is not in offered status');

      const [updated] = await this.model.accept(id, workerId);
      
      // Notify managers
      await notificationModel.notify(
        `Worker ${req.user?.name || workerId} accepted a ${task.type} task`,
        'info',
        'manager'
      );

      // Mark worker as busy
      await userModel.update(workerId, { status: 'busy' });

      // Update order status if picking
      if (task.type === 'pick' && task.related_order_id) {
        await orderModel.update(task.related_order_id, { status: 'picking' });
      }

      this.success(res, updated);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async declineTask(req, res) {
    try {
      const { id } = req.params;
      const task = await this.model.findById(id);
      if (!task) return this.error(res, 'Task not found', 404);

      const [updated] = await this.model.decline(id);

      // Re-create the task as a new offer (re-offer logic)
      await this.model.create({
        type: task.type,
        priority: task.priority,
        origin_bin_id: task.origin_bin_id,
        dest_bin_id: task.dest_bin_id,
        sku_id: task.sku_id,
        qty: task.qty,
        required_equipment: task.required_equipment,
        required_handling: task.required_handling,
        required_weight_class: task.required_weight_class,
        related_receipt_id: task.related_receipt_id,
        related_order_id: task.related_order_id,
        related_return_id: task.related_return_id,
        status: 'offered',
      });

      this.success(res, updated);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async completeTask(req, res) {
    try {
      const { id } = req.params;
      const { override_reason, actual_qty, condition, dest_bin_id } = req.body;
      const workerId = req.body.worker_id || req.user.id;

      const task = await this.model.findById(id);
      if (!task) return this.error(res, 'Task not found', 404);
      if (!['accepted', 'in_progress'].includes(task.status)) {
        return this.error(res, 'Task must be accepted or in_progress to complete');
      }

      const [completed] = await this.model.complete(id, override_reason);

      // Notify managers
      const overrideSuffix = override_reason ? ` with an override: ${override_reason}` : '';
      const notifType = override_reason ? 'warning' : 'success';
      await notificationModel.notify(
        `Worker ${req.user?.name || workerId} completed a ${task.type} task${overrideSuffix}`,
        notifType,
        'manager'
      );

      // Handle post-completion logic based on task type
      let finalDestBin = dest_bin_id || task.dest_bin_id;
      
      // If finalDestBin is provided as a short code (e.g., 'A-03') instead of a UUID, resolve it
      if (finalDestBin && finalDestBin.length < 30) {
        const binRows = await binModel.query("SELECT id FROM bins WHERE code = $1 LIMIT 1", [finalDestBin]);
        if (binRows.length > 0) {
          finalDestBin = binRows[0].id;
        } else {
          return this.error(res, `Override bin code '${finalDestBin}' not found in database`, 400);
        }
      }

      if (task.type === 'receive') {
        // Receive completed. Generate Putaway task.
        const qty = actual_qty || task.qty;
        const slotting = require('../algorithms/slotting');
        const bestBin = await slotting.findBestBin(task.sku_id, qty);
        
        await this.model.create({
          type: 'putaway',
          status: 'offered',
          priority: 6,
          sku_id: task.sku_id,
          qty: qty,
          dest_bin_id: bestBin ? bestBin.id : null,
          required_handling: task.required_handling,
          required_weight_class: task.required_weight_class,
          related_receipt_id: task.related_receipt_id,
        });
      } else if (task.type === 'putaway') {
        // Putaway completed. Update inventory.
        if (finalDestBin && task.sku_id) {
          const qty = actual_qty || task.qty;
          const inv = await inventoryModel.findOrCreate(task.sku_id, finalDestBin, null);
          await inventoryModel.update(inv.id, { qty: inv.qty + qty });

          await movementModel.logMovement({
            inventory_id: inv.id,
            type: task.type,
            qty_delta: qty,
            from_bin_id: task.origin_bin_id,
            to_bin_id: finalDestBin,
            actor_id: workerId,
            reason: override_reason || `${task.type} completed`,
          });
        }
      } else if (task.type === 'pick') {
        // Pick completed. Move allocated inventory to pack station.
        if (task.origin_bin_id && task.sku_id) {
          const qty = actual_qty || task.qty;
          const invRecords = await inventoryModel.query(
            "SELECT * FROM inventory WHERE sku_id = $1 AND bin_id = $2 AND status = 'allocated' LIMIT 1",
            [task.sku_id, task.origin_bin_id]
          );
          if (invRecords.length > 0) {
            const inv = invRecords[0];
            const newQty = Math.max(0, inv.qty - qty);
            await inventoryModel.update(inv.id, { qty: newQty });

            // Move to pack station (finalDestBin) as 'allocated'
            if (finalDestBin) {
              const packInv = await inventoryModel.query(
                "SELECT * FROM inventory WHERE sku_id = $1 AND bin_id = $2 AND status = 'allocated' LIMIT 1",
                [task.sku_id, finalDestBin]
              );
              if (packInv.length > 0) {
                await inventoryModel.update(packInv[0].id, { qty: packInv[0].qty + qty });
              } else {
                await inventoryModel.create({
                  sku_id: task.sku_id, bin_id: finalDestBin, qty: qty, status: 'allocated', client_id: inv.client_id
                });
              }
            }

            await movementModel.logMovement({
              inventory_id: inv.id,
              type: 'pick',
              qty_delta: -qty,
              from_bin_id: task.origin_bin_id,
              to_bin_id: finalDestBin,
              actor_id: workerId,
              reason: override_reason || 'Pick completed',
            });
          }
        }
        
        // Check if all picks for this order are done
        if (task.related_order_id) {
          const pendingPicks = await this.model.query(
            "SELECT id FROM tasks WHERE related_order_id = $1 AND type = 'pick' AND status != 'done'",
            [task.related_order_id]
          );
          
          if (pendingPicks.length === 0) {
            const orderLines = await orderModel.query("SELECT SUM(qty) AS total_qty FROM order_lines WHERE order_id = $1", [task.related_order_id]);
            const totalQty = parseInt(orderLines[0]?.total_qty) || 1;

            // Create a single Pack task for the entire order
            await this.model.create({
              type: 'pack',
              status: 'offered',
              priority: 7,
              sku_id: null,
              qty: totalQty,
              related_order_id: task.related_order_id,
            });
          }
        }
      } else if (task.type === 'pack') {
        // Pack completed. Update order to packed and generate Ship task.
        if (task.related_order_id) {
          await orderModel.update(task.related_order_id, { status: 'packed' });

          const orderLines = await orderModel.query("SELECT SUM(qty) AS total_qty FROM order_lines WHERE order_id = $1", [task.related_order_id]);
          const totalQty = parseInt(orderLines[0]?.total_qty) || 1;

          await this.model.create({
            type: 'ship',
            status: 'offered',
            priority: 8,
            sku_id: null,
            qty: totalQty,
            related_order_id: task.related_order_id,
          });
        }
      } else if (task.type === 'ship') {
        // Ship completed. Update order to shipped and remove allocated inventory from pack station.
        if (task.related_order_id) {
          await orderModel.update(task.related_order_id, { status: 'shipped' });

          // Find all lines for this order and deduct their qty from the allocated stock at the pack station
          const lines = await orderModel.query(
            "SELECT sku_id, qty FROM order_lines WHERE order_id = $1",
            [task.related_order_id]
          );

          // Assuming pack station bin is where they were moved during pick
          // For simplicity, we can just find any 'allocated' inventory for these SKUs and deduct it
          for (const line of lines) {
            const allocatedRecords = await inventoryModel.query(
              "SELECT * FROM inventory WHERE sku_id = $1 AND status = 'allocated' AND qty > 0 ORDER BY qty DESC",
              [line.sku_id]
            );
            
            let remainingToDeduct = line.qty;
            for (const record of allocatedRecords) {
              if (remainingToDeduct <= 0) break;
              const deduct = Math.min(remainingToDeduct, record.qty);
              await inventoryModel.update(record.id, { qty: record.qty - deduct });
              remainingToDeduct -= deduct;

              await movementModel.logMovement({
                inventory_id: record.id,
                type: 'ship',
                qty_delta: -deduct,
                from_bin_id: record.bin_id,
                to_bin_id: null,
                actor_id: workerId,
                reason: `Shipped order ${task.related_order_id}`,
              });
            }
          }
        }
      } else if (task.type === 'return') {
        // Return completed. Handle disposition
        const disposition = condition; // Passed from floor app (restock, damage, quarantine)
        
        if (task.related_return_id) {
          // 1. Update all return lines
          const lines = await returnLineModel.query("SELECT * FROM return_lines WHERE return_id = $1", [task.related_return_id]);
          for (const line of lines) {
            await returnLineModel.update(line.id, { disposition });
            
            if (disposition === 'restock') {
              const slotting = require('../algorithms/slotting');
              const bestBin = await slotting.findBestBin(line.sku_id, line.qty);
              await this.model.create({
                type: 'putaway',
                status: 'offered',
                priority: 6,
                sku_id: line.sku_id,
                qty: line.qty,
                dest_bin_id: bestBin ? bestBin.id : null,
                related_return_id: task.related_return_id,
              });
            } else if (disposition === 'damage' || disposition === 'quarantine') {
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
              const ret = await returnModel.findById(task.related_return_id);
              await inventoryModel.create({
                client_id: ret.client_id,
                sku_id: line.sku_id,
                bin_id: qaBin.id,
                qty: line.qty,
                status: disposition === 'damage' ? 'damaged' : 'hold'
              });
            }
          }
          
          // 2. Update return status
          await returnModel.update(task.related_return_id, { status: 'dispositioned' });
        }
      }

      // Update worker last bin and set to available
      const binToUpdate = finalDestBin || task.origin_bin_id;
      if (binToUpdate) {
        await userModel.update(workerId, { last_bin_id: binToUpdate, status: 'available' });
      } else {
        await userModel.update(workerId, { status: 'available' });
      }

      this.success(res, completed);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new TaskController();
