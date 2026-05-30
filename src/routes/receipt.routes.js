const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/ReceiptController');
const authMiddleware = require('../middlewares/auth');

// GET /api/receipts
router.get('/', authMiddleware, receiptController.getAllReceipts);

// GET /api/receipts/:id
router.get('/:id', authMiddleware, receiptController.getReceiptDetail);

// POST /api/receipts
router.post('/', authMiddleware, receiptController.createReceipt);

module.exports = router;
