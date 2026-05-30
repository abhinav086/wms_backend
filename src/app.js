const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const workerRoutes = require('./routes/worker.routes');
const skuRoutes = require('./routes/sku.routes');
const binRoutes = require('./routes/bin.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const taskRoutes = require('./routes/task.routes');
const orderRoutes = require('./routes/order.routes');
const receiptRoutes = require('./routes/receipt.routes');
const returnRoutes = require('./routes/return.routes');
const mapRoutes = require('./routes/map.routes');
const scanRoutes = require('./routes/scan.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

// Middleware

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Detailed Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    if (Object.keys(req.query).length > 0) {
      console.log(`  Query:`, req.query);
    }
    if (req.body && Object.keys(req.body).length > 0) {
      const safeBody = { ...req.body };
      if (safeBody.password) safeBody.password = '***';
      console.log(`  Body:`, safeBody);
    }
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'WMS API is running', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/bins', binRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/notifications', notificationRoutes);

// Seed route (development only)
if (process.env.NODE_ENV === 'development') {
  const seed = require('./seed');
  app.post('/api/seed', async (req, res) => {
    try {
      await seed();
      res.json({ success: true, message: 'Database seeded successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
});

// Global error handler — MUST be registered LAST
app.use(errorHandler);

module.exports = app;
