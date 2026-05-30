const express = require('express');
const router = express.Router();
const returnController = require('../controllers/ReturnController');
const authMiddleware = require('../middlewares/auth');

// GET /api/returns
router.get('/', authMiddleware, returnController.getAllReturns);

// GET /api/returns/:id
router.get('/:id', authMiddleware, returnController.getReturnDetail);

// POST /api/returns
router.post('/', authMiddleware, returnController.createReturn);

// POST /api/returns/:id/disposition
router.post('/:id/disposition', authMiddleware, returnController.setDisposition);

module.exports = router;
