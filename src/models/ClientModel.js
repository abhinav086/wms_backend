const BaseModel = require('../core/BaseModel');

class ClientModel extends BaseModel {
  constructor() {
    super('clients');
  }
  // Standard CRUD only — no custom methods needed
}

module.exports = new ClientModel();
