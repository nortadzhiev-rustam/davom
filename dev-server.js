'use strict';
// Runs the app in a normal browser without Electron (for development).
// Data goes to ./dev-data. Usage: npm run dev
const path = require('path');
const { Store } = require('./server/store');
const { createAppServer } = require('./server/server');

const dataDir = process.env.DAVOM_DATA || path.join(__dirname, 'dev-data');
const store = new Store(dataDir);
const server = createAppServer({
  store,
  publicDir: path.join(__dirname, 'public'),
  version: require('./package.json').version + '-dev',
  dataDir,
  openDataDir: () => console.log('Data folder:', dataDir),
});
server.start().then(() => console.log(`Davom running at ${server.url()} (data: ${dataDir})`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.close();
    process.exit(0);
  });
}
