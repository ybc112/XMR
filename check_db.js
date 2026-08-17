const db = require('./src/services/db');

db.init().then(() => {
  return db.all(`SELECT address, COUNT(*) as cnt FROM events GROUP BY address ORDER BY cnt DESC LIMIT 5`);
}).then(r => {
  console.log('events by address:', r);
  return db.all(`SELECT COUNT(*) as total FROM events`);
}).then(r => {
  console.log('total events:', r[0]);
  process.exit(0);
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
