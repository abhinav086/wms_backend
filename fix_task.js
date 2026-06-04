require('dotenv').config();
const pool = require('./src/core/db');

async function fixTask() {
  try {
    const {rows: tasks} = await pool.query("SELECT * FROM tasks WHERE type='putaway'");
    for (let t of tasks) {
      if (!t.dest_bin_id) continue;
      const {rows: qaBin} = await pool.query("SELECT code FROM bins WHERE id=$1", [t.dest_bin_id]);
      if(qaBin[0] && qaBin[0].code.startsWith('QA-')) {
        const {rows: otherBins} = await pool.query("SELECT id FROM bins WHERE code NOT LIKE 'QA-%' LIMIT 1");
        if(otherBins.length > 0) {
          await pool.query("UPDATE tasks SET dest_bin_id=$1 WHERE id=$2", [otherBins[0].id, t.id]);
          console.log('Fixed task', t.id, 'to bin', otherBins[0].id);
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
fixTask();
