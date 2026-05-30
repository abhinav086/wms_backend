const pool = require('../core/db');

const schema = `
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS movements CASCADE;
DROP TABLE IF EXISTS return_lines CASCADE;
DROP TABLE IF EXISTS returns CASCADE;
DROP TABLE IF EXISTS receipt_lines CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS order_lines CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS bins CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- CLIENTS
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- USERS (managers and floor workers)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  role            VARCHAR(50) CHECK (role IN ('manager','worker')) NOT NULL,
  skills          TEXT[] DEFAULT '{}',
  equipment_auth  TEXT[] DEFAULT '{}',
  max_safe_weight NUMERIC(10,2) DEFAULT 25,
  status          VARCHAR(20) DEFAULT 'offline'
                  CHECK (status IN ('available','busy','offline')),
  last_bin_id     UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SKUs (products)
CREATE TABLE skus (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id),
  code             VARCHAR(100) NOT NULL,
  name             VARCHAR(255) NOT NULL,
  length_cm        NUMERIC(10,2),
  width_cm         NUMERIC(10,2),
  height_cm        NUMERIC(10,2),
  weight_kg        NUMERIC(10,2),
  volume_cm3       NUMERIC(14,2) GENERATED ALWAYS AS
                   (length_cm * width_cm * height_cm) STORED,
  handling_classes TEXT[] DEFAULT '{}',
  barcode          VARCHAR(255),
  velocity_class   VARCHAR(1) CHECK (velocity_class IN ('A','B','C')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- BINS (warehouse shelf locations)
CREATE TABLE bins (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(100) NOT NULL UNIQUE,
  x                      INTEGER NOT NULL,
  y                      INTEGER NOT NULL,
  z                      INTEGER DEFAULT 0,
  int_length_cm          NUMERIC(10,2),
  int_width_cm           NUMERIC(10,2),
  int_height_cm          NUMERIC(10,2),
  volume_capacity_cm3    NUMERIC(14,2),
  max_weight_kg          NUMERIC(10,2),
  allowed_handling_classes TEXT[] DEFAULT '{}',
  status                 VARCHAR(20) DEFAULT 'active'
                         CHECK (status IN ('active','inactive','reserved')),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTORY
CREATE TABLE inventory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id),
  sku_id     UUID REFERENCES skus(id),
  bin_id     UUID REFERENCES bins(id),
  qty        INTEGER NOT NULL DEFAULT 0,
  status     VARCHAR(20) DEFAULT 'available'
             CHECK (status IN ('available','allocated','picked','hold','damaged')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sku_id, bin_id, status)
);

-- TASKS
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  VARCHAR(50) NOT NULL
                        CHECK (type IN
                        ('receive','putaway','pick','pack','ship','return')),
  status                VARCHAR(30) DEFAULT 'offered'
                        CHECK (status IN
                        ('offered','accepted','in_progress','done',
                         'declined','expired')),
  priority              INTEGER DEFAULT 5,
  origin_bin_id         UUID REFERENCES bins(id),
  dest_bin_id           UUID REFERENCES bins(id),
  sku_id                UUID REFERENCES skus(id),
  qty                   INTEGER,
  required_equipment    TEXT[] DEFAULT '{}',
  required_handling     TEXT[] DEFAULT '{}',
  required_weight_class NUMERIC(10,2) DEFAULT 0,
  assignee_id           UUID REFERENCES users(id),
  related_receipt_id    UUID,
  related_order_id      UUID,
  related_return_id     UUID,
  override_reason       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  accepted_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ
);

-- ORDERS
CREATE TABLE orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id),
  ship_to    TEXT,
  status     VARCHAR(20) DEFAULT 'created'
             CHECK (status IN
             ('created','allocated','picking','packed','shipped')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES orders(id),
  sku_id        UUID REFERENCES skus(id),
  qty           INTEGER NOT NULL,
  allocated_qty INTEGER DEFAULT 0
);

-- RECEIPTS
CREATE TABLE receipts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id),
  status     VARCHAR(20) DEFAULT 'created'
             CHECK (status IN
             ('created','receiving','putaway','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receipt_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES receipts(id),
  sku_id     UUID REFERENCES skus(id),
  qty        INTEGER NOT NULL
);

-- RETURNS
CREATE TABLE returns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id),
  order_id   UUID REFERENCES orders(id),
  status     VARCHAR(30) DEFAULT 'created'
             CHECK (status IN
             ('created','inspected','dispositioned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE return_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id   UUID REFERENCES returns(id),
  sku_id      UUID REFERENCES skus(id),
  qty         INTEGER NOT NULL,
  disposition VARCHAR(20)
              CHECK (disposition IN ('restock','quarantine','damage'))
);

-- MOVEMENTS (append-only audit log)
CREATE TABLE movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES inventory(id),
  type         VARCHAR(50) NOT NULL,
  qty_delta    INTEGER NOT NULL,
  from_bin_id  UUID REFERENCES bins(id),
  to_bin_id    UUID REFERENCES bins(id),
  actor_id     UUID REFERENCES users(id),
  reason       TEXT,
  ts           TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_skus_barcode ON skus(barcode);
CREATE INDEX idx_skus_client ON skus(client_id);
CREATE INDEX idx_bins_code ON bins(code);
CREATE INDEX idx_bins_coords ON bins(x, y, z);
CREATE INDEX idx_inventory_sku ON inventory(sku_id);
CREATE INDEX idx_inventory_bin ON inventory(bin_id);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_movements_inventory ON movements(inventory_id);
`;

async function runSchema() {
  try {
    console.log('🔧 Creating database schema...');
    await pool.query(schema);
    console.log('✅ Database schema created successfully!');
  } catch (err) {
    console.error('❌ Schema creation failed:', err.message);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  runSchema()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runSchema;
