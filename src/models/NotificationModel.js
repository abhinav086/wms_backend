const BaseModel = require('../core/BaseModel');

class NotificationModel extends BaseModel {
  constructor() {
    super('notifications');
  }

  async getForUser(role, userId) {
    return this.query(`
      SELECT * FROM notifications 
      WHERE target_role = 'all' 
         OR target_role = $1 
         OR target_user_id = $2
      ORDER BY created_at DESC 
      LIMIT 50
    `, [role, userId]);
  }

  async markAsRead(notificationIds, userId) {
    if (!notificationIds || notificationIds.length === 0) return [];
    
    // Convert to parameterized placeholders (e.g., $1, $2)
    const placeholders = notificationIds.map((_, i) => `$${i + 1}`).join(',');
    
    return this.query(`
      UPDATE notifications 
      SET is_read = true 
      WHERE id IN (${placeholders}) 
        AND (target_user_id = $${notificationIds.length + 1} OR target_role IN ('all', (SELECT role FROM users WHERE id = $${notificationIds.length + 1})))
      RETURNING *
    `, [...notificationIds, userId]);
  }

  async notify(message, type = 'info', targetRole = 'all', targetUserId = null) {
    return this.create({
      message,
      type,
      target_role: targetRole,
      target_user_id: targetUserId
    });
  }
}

module.exports = new NotificationModel();
