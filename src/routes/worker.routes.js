const express = require('express');
const router = express.Router();
const workerController = require('../controllers/WorkerController');
const authMiddleware = require('../middlewares/auth');

// GET /api/workers
router.get('/', authMiddleware, workerController.getAllWorkers);

// GET /api/workers/:id
router.get('/:id', authMiddleware, workerController.getById);

// POST /api/workers
router.post('/', authMiddleware, workerController.createWorker);

// PUT /api/workers/:id
router.put('/:id', authMiddleware, workerController.updateWorker);

// PATCH /api/workers/:id/status
router.patch('/:id/status', authMiddleware, workerController.toggleStatus);

// DELETE /api/workers/:id
router.delete('/:id', authMiddleware, workerController.delete);

module.exports = router;
