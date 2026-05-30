const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/NotificationController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware); // Must be logged in to view notifications

router.get('/', notificationController.getMyNotifications.bind(notificationController));
router.post('/read', notificationController.markRead.bind(notificationController));

module.exports = router;
