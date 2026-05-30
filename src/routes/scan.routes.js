const express = require('express');
const router = express.Router();
const scanController = require('../controllers/ScanController');
const authMiddleware = require('../middlewares/auth');

// POST /api/scan
router.post('/', authMiddleware, scanController.handleScan);

module.exports = router;
