const pool = require('../core/db');
const orderLineModel = require('../models/OrderLineModel');
const inventoryModel = require('../models/InventoryModel');
const taskModel = require('../models/TaskModel');
const movementModel = require('../models/MovementModel');

/**
 * Order Allocation Algorithm
 * 
 * Called when POST /api/orders creates a new order.
 * Reserves stock and generates pick tasks.
 * 
 * For each order_line:
 * 1. Find inventory records: sku_id match, status='available', ORDER BY bin proximity to packout
 * 2. Reserve qty (FIFO within each bin) -> update inventory status='allocated'
 * 3. Create a pick Task per bin involved
 * 4. Log movements in movements table
 */

// Pack station / packout zone reference
const PACK_STATION_X = 10;
const PACK_STATION_Y = 1;

async function allocateOrder(orderId) {
  // Get all order lines
  const lines = await orderLineModel.findByOrder(orderId);

  for (const line of lines) {
    let remainingQty = line.qty;

    // Find available inventory for this SKU, ordered by proximity to packout
    const { rows: available } = await pool.query(`
      SELECT i.*, b.x, b.y, b.code AS bin_code,
        ABS(b.x - $2) + ABS(b.y - $3) AS distance
      FROM inventory i
      JOIN bins b ON b.id = i.bin_id
      WHERE i.sku_id = $1 AND i.status = 'available' AND i.qty > 0
      ORDER BY distance ASC, i.qty DESC
    `, [line.sku_id, PACK_STATION_X, PACK_STATION_Y]);

    for (const inv of available) {
      if (remainingQty <= 0) break;

      const allocateQty = Math.min(remainingQty, inv.qty);

      // Reduce available qty
      await inventoryModel.update(inv.id, {
        qty: inv.qty - allocateQty,
      });

      // Create allocated inventory record (or update existing)
      const allocatedInv = await inventoryModel.findOrCreate(line.sku_id, inv.bin_id, null);
      if (allocatedInv.status !== 'allocated') {
        // Create a new allocated record
        await inventoryModel.create({
          sku_id: line.sku_id,
          bin_id: inv.bin_id,
          qty: allocateQty,
          status: 'allocated',
        });
      } else {
        await inventoryModel.update(allocatedInv.id, {
          qty: allocatedInv.qty + allocateQty,
        });
      }

      // Get the pack station bin (or use null)
      const { rows: packBins } = await pool.query(
        'SELECT id FROM bins WHERE x = $1 AND y = $2 LIMIT 1',
        [PACK_STATION_X, PACK_STATION_Y]
      );
      const packBinId = packBins.length > 0 ? packBins[0].id : null;

      // Create pick task
      await taskModel.create({
        type: 'pick',
        status: 'offered',
        priority: 7, // picks are high priority
        origin_bin_id: inv.bin_id,
        dest_bin_id: packBinId,
        sku_id: line.sku_id,
        qty: allocateQty,
        related_order_id: orderId,
      });

      // Log movement
      await movementModel.logMovement({
        inventory_id: inv.id,
        type: 'allocation',
        qty_delta: -allocateQty,
        from_bin_id: inv.bin_id,
        to_bin_id: packBinId,
        reason: `Allocated for order ${orderId}`,
      });

      // Update order line allocated qty
      await orderLineModel.updateAllocated(line.id, allocateQty);

      remainingQty -= allocateQty;
    }
  }
}

module.exports = { allocateOrder };
