const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middlewares/auth');

// GET /api/orders
router.get('/', authMiddleware, orderController.getAllOrders);

// GET /api/orders/:id
router.get('/:id', authMiddleware, orderController.getOrderDetail);

// POST /api/orders
router.post('/', authMiddleware, orderController.createOrder);

// DELETE /api/orders/:id
router.delete('/:id', authMiddleware, orderController.deleteOrder);

module.exports = router;
