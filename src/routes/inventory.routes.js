const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/InventoryController');
const authMiddleware = require('../middlewares/auth');

// GET /api/inventory — search/filter
router.get('/', authMiddleware, inventoryController.search);

// GET /api/inventory/summary
router.get('/summary', authMiddleware, inventoryController.getSummary);

// GET /api/inventory/:sku_id/locations
router.get('/:sku_id/locations', authMiddleware, inventoryController.getLocations);

module.exports = router;
