const BaseController = require('../core/BaseController');
const orderModel = require('../models/OrderModel');
const orderLineModel = require('../models/OrderLineModel');
const inventoryModel = require('../models/InventoryModel');
const allocation = require('../algorithms/allocation');
const notificationModel = require('../models/NotificationModel');

class OrderController extends BaseController {
  constructor() {
    super(orderModel);
    this.getAllOrders = this.getAllOrders.bind(this);
    this.getOrderDetail = this.getOrderDetail.bind(this);
    this.createOrder = this.createOrder.bind(this);
    this.deleteOrder = this.deleteOrder.bind(this);
  }

  async getAllOrders(req, res) {
    try {
      const orders = await this.model.findAllWithSummary();
      this.success(res, orders);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async getOrderDetail(req, res) {
    try {
      const order = await this.model.findWithLines(req.params.id);
      if (!order) return this.error(res, 'Order not found', 404);
      this.success(res, order);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async createOrder(req, res) {
    try {
      const { client_id, ship_to, lines } = req.body;

      if (!lines || !lines.length) {
        return this.error(res, 'Order must have at least one line');
      }

      // Check inventory levels strictly
      const summary = await inventoryModel.getSummary();
      for (const line of lines) {
        const inv = summary.find(s => s.sku_id === line.sku_id);
        if (!inv || line.qty > inv.available_qty) {
          return this.error(res, `Cannot order ${line.qty} of SKU ${inv ? inv.sku_code : line.sku_id}. Only ${inv ? inv.available_qty : 0} available.`);
        }
      }

      // Create the order
      const order = await this.model.create({
        client_id: client_id || null,
        ship_to: ship_to || '',
        status: 'created',
      });

      // Create order lines
      for (const line of lines) {
        await orderLineModel.create({
          order_id: order.id,
          sku_id: line.sku_id,
          qty: line.qty,
          allocated_qty: 0,
        });
      }

      // Run allocation algorithm
      try {
        await allocation.allocateOrder(order.id);
        await this.model.update(order.id, { status: 'allocated' });
      } catch (allocErr) {
        console.error('Allocation warning:', allocErr.message);
        // Order still created, just not fully allocated
      }

      const fullOrder = await this.model.findWithLines(order.id);
      this.success(res, fullOrder, 201);
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }

  async deleteOrder(req, res) {
    try {
      const orderId = req.params.id;
      await this.model.query("DELETE FROM tasks WHERE related_order_id = $1", [orderId]);
      await this.model.query("DELETE FROM order_lines WHERE order_id = $1", [orderId]);
      await this.model.delete(orderId);
      this.success(res, { message: 'Order deleted successfully' });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new OrderController();
