const express = require('express');
const router = express.Router();
const skuController = require('../controllers/SKUController');
const authMiddleware = require('../middlewares/auth');

// GET /api/skus — with search/filter
router.get('/', authMiddleware, skuController.search);

// GET /api/skus/barcode/:code
router.get('/barcode/:code', authMiddleware, skuController.findByBarcode);

// GET /api/skus/:id
router.get('/:id', authMiddleware, skuController.getById);

// POST /api/skus
router.post('/', authMiddleware, skuController.create);

// PUT /api/skus/:id
router.put('/:id', authMiddleware, skuController.update);

// DELETE /api/skus/:id
router.delete('/:id', authMiddleware, skuController.delete);

module.exports = router;
