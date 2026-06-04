const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/InventoryController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

// GET /api/inventory — search/filter
router.get('/', authMiddleware, inventoryController.search);

// GET /api/inventory/summary
router.get('/summary', authMiddleware, inventoryController.getSummary);

// POST /api/inventory/add — manually add inventory (managers only)
router.post('/add', authMiddleware, roleMiddleware('manager'), inventoryController.addInventory);

// GET /api/inventory/:sku_id/locations
router.get('/:sku_id/locations', authMiddleware, inventoryController.getLocations);

module.exports = router;
