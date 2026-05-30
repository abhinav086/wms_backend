const express = require('express');
const router = express.Router();
const binController = require('../controllers/BinController');
const authMiddleware = require('../middlewares/auth');

// GET /api/bins — with occupancy stats
router.get('/', authMiddleware, binController.getAllWithOccupancy);

// GET /api/bins/:id — with inventory
router.get('/:id', authMiddleware, binController.getByIdWithInventory);

// POST /api/bins
router.post('/', authMiddleware, binController.create);

// PUT /api/bins/:id
router.put('/:id', authMiddleware, binController.update);

// DELETE /api/bins/:id
router.delete('/:id', authMiddleware, binController.delete);

module.exports = router;
