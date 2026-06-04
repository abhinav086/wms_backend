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
    SELECT t.*, s.name AS sku_name, s.code AS sku_code, s.barcode AS sku_barcode, s.weight_kg AS sku_weight_kg,
      ob.code AS origin_bin_code, ob.x AS origin_x, ob.y AS origin_y,
      db.code AS dest_bin_code, db.x AS dest_x, db.y AS dest_y,
      o.ship_to AS order_ship_to
    FROM tasks t
    LEFT JOIN skus s ON s.id = t.sku_id
    LEFT JOIN bins ob ON ob.id = t.origin_bin_id
    LEFT JOIN bins db ON db.id = t.dest_bin_id
    LEFT JOIN orders o ON o.id = t.related_order_id
    WHERE t.assignee_id = $1 AND t.status IN ('accepted', 'in_progress')
    ORDER BY t.accepted_at DESC
    LIMIT 1
  `, [workerId]);

  if (activeTasks.length > 0) {
    return activeTasks[0];
  }

  // Step 1: Get all offered tasks
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
    const reqHandling = (task.required_handling || []).filter(h => h !== 'general');
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

async function runAutoAssignerCycle() {
  try {
    // 1. Get all unassigned offered tasks with coordinates
    const { rows: unassignedTasks } = await pool.query(`
      SELECT t.*, 
        ob.x AS origin_x, ob.y AS origin_y,
        db.x AS dest_x, db.y AS dest_y
      FROM tasks t
      LEFT JOIN bins ob ON ob.id = t.origin_bin_id
      LEFT JOIN bins db ON db.id = t.dest_bin_id
      WHERE t.status = 'offered' AND t.assignee_id IS NULL
      ORDER BY t.priority DESC, t.created_at ASC
    `);
    if (unassignedTasks.length === 0) return [];

    // 2. Get all available or busy workers
    const { rows: workers } = await pool.query(`
      SELECT * FROM users WHERE role = 'worker' AND status IN ('available', 'busy')
    `);
    if (workers.length === 0) return [];

    // 3. Get pending task counts for workers
    const { rows: taskCounts } = await pool.query(`
      SELECT assignee_id, COUNT(*) as count 
      FROM tasks 
      WHERE status IN ('offered', 'accepted', 'in_progress') AND assignee_id IS NOT NULL
      GROUP BY assignee_id
    `);
    const workerLoads = {};
    workers.forEach(w => workerLoads[w.id] = 0);
    taskCounts.forEach(tc => workerLoads[tc.assignee_id] = parseInt(tc.count));

    // 3.5. Get all bins for coordinate lookups
    const { rows: allBins } = await pool.query('SELECT id, x, y FROM bins');
    const binMap = {};
    allBins.forEach(b => binMap[b.id] = b);

    const assignments = [];

    // 4. Try to assign each task
    for (const task of unassignedTasks) {
      const taskX = task.origin_x || task.dest_x || 1;
      const taskY = task.origin_y || task.dest_y || 1;
      // Filter eligible workers
      const eligible = workers.filter(worker => {
        // Check equipment
        const reqEquipment = task.required_equipment || [];
        const workerEquipment = worker.equipment_auth || [];
        if (reqEquipment.length > 0 && !reqEquipment.every(e => workerEquipment.includes(e))) return false;

        // Check skills
        const reqHandling = (task.required_handling || []).filter(h => h !== 'general');
        const workerSkills = worker.skills || [];
        if (reqHandling.length > 0 && !reqHandling.every(h => workerSkills.includes(h))) return false;

        // Check weight
        const reqWeight = parseFloat(task.required_weight_class) || 0;
        const workerMaxWeight = parseFloat(worker.max_safe_weight) || 25;
        if (reqWeight > workerMaxWeight) return false;

        return true;
      });

      if (eligible.length > 0) {
        // Calculate distance for each worker
        eligible.forEach(w => {
          let workerX = 1, workerY = 1;
          if (w.last_bin_id && binMap[w.last_bin_id]) {
            workerX = binMap[w.last_bin_id].x;
            workerY = binMap[w.last_bin_id].y;
          }
          w.distance = Math.abs(workerX - taskX) + Math.abs(workerY - taskY);
        });

        // Pick nearest worker, fallback to least load if tied
        eligible.sort((a, b) => {
          if (a.distance !== b.distance) return a.distance - b.distance;
          return workerLoads[a.id] - workerLoads[b.id];
        });
        const chosenWorker = eligible[0];

        await pool.query('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [chosenWorker.id, task.id]);
        workerLoads[chosenWorker.id]++;
        console.log(`✅ Auto-assigned task ${task.id} to worker ${chosenWorker.name}`);

        // Notify managers
        const notificationModel = require('../models/NotificationModel');
        await notificationModel.notify(
          `Task ${task.type.toUpperCase()} auto-assigned to ${chosenWorker.name}`,
          'info',
          'manager'
        );

        assignments.push({ taskId: task.id, workerName: chosenWorker.name });
      }
    }
    return assignments;
  } catch (err) {
    console.error('Auto-Assigner error:', err);
    return [];
  }
}

async function startAutoAssigner() {
  console.log('🔄 Task Auto-Assigner started...');
  setInterval(runAutoAssignerCycle, 5000);
}

module.exports = { findNextTask, startAutoAssigner, runAutoAssignerCycle };
