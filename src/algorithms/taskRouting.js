const pool = require('../core/db');
const userModel = require('../models/UserModel');
const binModel = require('../models/BinModel');

/**
 * Task Routing Algorithm
 * 
 * Called by GET /api/tasks/next?worker_id=
 * Determines which pending task to offer a given worker.
 * 
 * Step 1: Hard eligibility gate (SQL filter on equipment, skills, weight)
 * Step 2: Rank eligible tasks by Manhattan distance from worker's last known bin
 * Step 3: Offer lowest-distance, highest-priority task
 */

function manhattanDistance(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

async function findNextTask(workerId) {
  // Get worker details
  const worker = await userModel.findById(workerId);
  if (!worker) return null;

  const workerEquipment = worker.equipment_auth || [];
  const workerSkills = worker.skills || [];
  const workerMaxWeight = parseFloat(worker.max_safe_weight) || 25;

  // Step 0: Check if worker already has an active task (accepted or in_progress)
  // If they refreshed the page, we should return them to their active task!
  const { rows: activeTasks } = await pool.query(`
    SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode,
      ob.code AS origin_bin_code, ob.x AS origin_x, ob.y AS origin_y,
      db.code AS dest_bin_code, db.x AS dest_x, db.y AS dest_y
    FROM tasks t
    LEFT JOIN skus s ON s.id = t.sku_id
    LEFT JOIN bins ob ON ob.id = t.origin_bin_id
    LEFT JOIN bins db ON db.id = t.dest_bin_id
    WHERE t.assignee_id = $1 AND t.status IN ('accepted', 'in_progress')
    ORDER BY t.accepted_at DESC
    LIMIT 1
  `, [workerId]);

  if (activeTasks.length > 0) {
    return activeTasks[0];
  }

  // Step 1: Get all offered tasks
  const { rows: tasks } = await pool.query(`
    SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode,
      ob.code AS origin_bin_code, ob.x AS origin_x, ob.y AS origin_y,
      db.code AS dest_bin_code, db.x AS dest_x, db.y AS dest_y
    FROM tasks t
    LEFT JOIN skus s ON s.id = t.sku_id
    LEFT JOIN bins ob ON ob.id = t.origin_bin_id
    LEFT JOIN bins db ON db.id = t.dest_bin_id
    WHERE t.status = 'offered'
    ORDER BY t.priority DESC, t.created_at ASC
  `);

  if (tasks.length === 0) return null;

  // Step 2: Filter by eligibility
  const eligible = tasks.filter(task => {
    // Check equipment
    const reqEquipment = task.required_equipment || [];
    if (reqEquipment.length > 0) {
      const hasEquipment = reqEquipment.every(e => workerEquipment.includes(e));
      if (!hasEquipment) return false;
    }

    // Check skills/handling
    const reqHandling = task.required_handling || [];
    if (reqHandling.length > 0) {
      const hasSkills = reqHandling.every(h => workerSkills.includes(h));
      if (!hasSkills) return false;
    }

    // Check weight
    const reqWeight = parseFloat(task.required_weight_class) || 0;
    if (reqWeight > workerMaxWeight) return false;

    return true;
  });

  if (eligible.length === 0) return null;

  // Step 3: Rank by proximity to worker's last known position
  let workerX = 1, workerY = 1; // default position
  if (worker.last_bin_id) {
    const workerBin = await binModel.findById(worker.last_bin_id);
    if (workerBin) {
      workerX = workerBin.x;
      workerY = workerBin.y;
    }
  }

  const ranked = eligible.map(task => {
    const taskX = task.origin_x || task.dest_x || 1;
    const taskY = task.origin_y || task.dest_y || 1;
    const distance = manhattanDistance(workerX, workerY, taskX, taskY);
    return { ...task, distance };
  });

  // Sort by priority DESC, then distance ASC
  ranked.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.distance - b.distance;
  });

  return ranked[0];
}

module.exports = { findNextTask };
