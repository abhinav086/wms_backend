require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     WMS Backend API Server               ║');
  console.log(`║     Running on port ${PORT}                 ║`);
  console.log(`║     Environment: ${process.env.NODE_ENV || 'development'}          ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  API:    http://localhost:${PORT}/api`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log('');
});
