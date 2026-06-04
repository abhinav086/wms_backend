const pool = require('../core/db');
const skuModel = require('../models/SKUModel');
const binModel = require('../models/BinModel');

/**
 * Slotting Algorithm — Best-Fit Bin Selection
 * 
 * Called when a putaway task is being generated after a receive.
 * Given a SKU and quantity, returns the recommended bin.
 * 
 * Step 1: Filter bins that physically fit the item (volume + weight + handling)
 * Step 2: Score each surviving bin (volume_fit, velocity_match, proximity)
 * Step 3: Return top-scoring bin
 */

// Packout zone reference point (near the shipping area)
const PACKOUT_X = 10;
const PACKOUT_Y = 1;

function manhattanDistance(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

async function findBestBin(skuId, qty) {
  // Get SKU details
  const sku = await skuModel.findById(skuId);
  if (!sku) return null;

  const unitVolume = (sku.volume_cm3 || 0) * qty;
  const unitWeight = (sku.weight_kg || 0) * qty;
  const handlingClasses = sku.handling_classes || [];

  // Step 1: Filter bins that can physically fit the items
  let sql = `
    SELECT b.*,
      b.volume_capacity_cm3 - COALESCE(SUM(i.qty * s.volume_cm3), 0) AS available_volume,
      b.max_weight_kg - COALESCE(SUM(i.qty * s.weight_kg), 0) AS available_weight
    FROM bins b
    LEFT JOIN inventory i ON i.bin_id = b.id AND i.status = 'available'
    LEFT JOIN skus s ON s.id = i.sku_id
    WHERE b.status = 'active' AND b.code NOT LIKE 'QA-%'
    GROUP BY b.id
    HAVING
      (b.volume_capacity_cm3 - COALESCE(SUM(i.qty * s.volume_cm3), 0)) >= $1 AND
      (b.max_weight_kg - COALESCE(SUM(i.qty * s.weight_kg), 0)) >= $2
  `;
  const params = [unitVolume, unitWeight];

  const { rows: candidateBins } = await pool.query(sql, params);

  if (candidateBins.length === 0) {
    // No existing bins fit the requirements
    // System auto-creation disabled based on user configuration. Manager must manually create bins.
    return null;
  }

  // Filter by handling classes
  let filtered = candidateBins;
  if (handlingClasses.length > 0) {
    filtered = candidateBins.filter(bin => {
      const allowed = bin.allowed_handling_classes || [];
      return handlingClasses.every(hc => allowed.includes(hc));
    });
  }

  if (filtered.length === 0) filtered = candidateBins; // fallback: ignore handling if no match

  // Step 2: Score each surviving bin
  const scored = filtered.map(bin => {
    const availVol = parseFloat(bin.available_volume) || 1;
    
    // Volume fit: tighter = better (higher score when less wasted space)
    const volumeFit = unitVolume > 0 ? 1 - (unitVolume / availVol) : 0.5;
    
    // Velocity match: A-class SKUs should be near packout zone
    let velocityMatch = 0.5; // neutral
    if (sku.velocity_class === 'A') {
      const dist = manhattanDistance(bin.x, bin.y, PACKOUT_X, PACKOUT_Y);
      velocityMatch = 1 / (1 + dist);
    } else if (sku.velocity_class === 'C') {
      // C-class should be far from packout (higher score if further)
      const dist = manhattanDistance(bin.x, bin.y, PACKOUT_X, PACKOUT_Y);
      velocityMatch = dist / 15; // normalize
    }

    // Proximity to packout zone
    const dist = manhattanDistance(bin.x, bin.y, PACKOUT_X, PACKOUT_Y);
    const proximity = 1 / (1 + dist);

    // Weight-based Z-level matching
    // Heavy items (> 10kg) should go to z=0 or z=1
    // Light items (< 5kg) should go to z=3 or z=4
    let zMatch = 0.5;
    const skuWeight = sku.weight_kg || 0;
    if (skuWeight >= 15) {
      // Extremely heavy, MUST be at bottom
      zMatch = bin.z === 0 ? 1 : bin.z === 1 ? 0.7 : 0;
    } else if (skuWeight >= 5) {
      // Medium weight, prefer lower half
      zMatch = bin.z <= 2 ? 0.8 : 0.2;
    } else {
      // Light items, prefer upper half to save bottom space
      zMatch = bin.z >= 3 ? 1 : bin.z === 2 ? 0.7 : 0.2;
    }

    const score = (0.4 * volumeFit) + (0.2 * velocityMatch) + (0.1 * proximity) + (0.3 * zMatch);

    return { ...bin, score, volumeFit, velocityMatch, proximity, zMatch };
  });

  // Step 3: Sort by score descending and return the best
  scored.sort((a, b) => b.score - a.score);

  return scored[0];
}

module.exports = { findBestBin };
