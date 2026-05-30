const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const authMiddleware = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me — protected
router.get('/me', authMiddleware, authController.me);

// POST /api/auth/register — for creating users
router.post('/register', authController.register);

module.exports = router;
