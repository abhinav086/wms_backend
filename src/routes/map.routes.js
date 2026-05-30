const express = require('express');
const router = express.Router();
const mapController = require('../controllers/MapController');
const authMiddleware = require('../middlewares/auth');

// GET /api/map/layout
router.get('/layout', authMiddleware, mapController.getLayout);

module.exports = router;
