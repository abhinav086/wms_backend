const express = require('express');
const router = express.Router();
const systemController = require('../controllers/SystemController');
const authMiddleware = require('../middlewares/auth');

const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

// Only managers can wipe the system
router.post('/wipe', authMiddleware, requireRole('manager'), systemController.wipeData);

module.exports = router;
