const BaseController = require('../core/BaseController');
const binModel = require('../models/BinModel');

class MapController extends BaseController {
  constructor() {
    super(binModel);
    this.getLayout = this.getLayout.bind(this);
  }

  async getLayout(req, res) {
    try {
      const bins = await this.model.findAllWithOccupancy();
      
      // Also include SKU search if requested
      const { sku_code } = req.query;
      let highlightBins = [];

      if (sku_code) {
        highlightBins = await this.model.query(`
          SELECT DISTINCT i.bin_id, SUM(i.qty) AS highlight_qty
          FROM inventory i
          JOIN skus s ON s.id = i.sku_id
          WHERE s.code ILIKE $1 AND i.qty > 0
          GROUP BY i.bin_id
        `, [`%${sku_code}%`]);
      }

      this.success(res, {
        bins,
        highlightBins: highlightBins.reduce((acc, hb) => {
          acc[hb.bin_id] = hb.highlight_qty;
          return acc;
        }, {}),
      });
    } catch (err) {
      this.error(res, err.message, 500);
    }
  }
}

module.exports = new MapController();
