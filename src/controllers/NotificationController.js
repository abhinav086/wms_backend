const BaseController = require('../core/BaseController');
const notificationModel = require('../models/NotificationModel');

class NotificationController extends BaseController {
  constructor() {
    super(notificationModel);
  }

  async getMyNotifications(req, res) {
    try {
      const user = req.user; // populated by auth middleware
      const notifications = await this.model.getForUser(user.role, user.id);
      return this.success(res, notifications);
    } catch (err) {
      return this.error(res, err.message, 500);
    }
  }

  async markRead(req, res) {
    try {
      const { notification_ids } = req.body;
      if (!Array.isArray(notification_ids)) {
        return this.error(res, 'notification_ids must be an array', 400);
      }
      const updated = await this.model.markAsRead(notification_ids, req.user.id);
      return this.success(res, updated, 'Notifications marked as read');
    } catch (err) {
      return this.error(res, err.message, 500);
    }
  }
}

module.exports = new NotificationController();
