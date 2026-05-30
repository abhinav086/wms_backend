const express = require('express');
const router = express.Router();
const taskController = require('../controllers/TaskController');
const authMiddleware = require('../middlewares/auth');

// GET /api/tasks — all tasks (manager view)
router.get('/', authMiddleware, taskController.getAllTasks);

// GET /api/tasks/next?worker_id= — next task for worker
router.get('/next', authMiddleware, taskController.getNextForWorker);

// GET /api/tasks/history?worker_id= — worker task history
router.get('/history', authMiddleware, taskController.getHistoryForWorker);

// GET /api/tasks/:id
router.get('/:id', authMiddleware, taskController.getById);

// POST /api/tasks/:id/accept
router.post('/:id/accept', authMiddleware, taskController.acceptTask);

// POST /api/tasks/:id/decline
router.post('/:id/decline', authMiddleware, taskController.declineTask);

// POST /api/tasks/:id/complete
router.post('/:id/complete', authMiddleware, taskController.completeTask);

module.exports = router;
