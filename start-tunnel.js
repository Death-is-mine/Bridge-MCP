const lt = require('localtunnel');
(async () => {
  try {
    const t = await lt({ port: 3000, subdomain: 'bridge-mcp-test' });
    console.log('URL: ' + t.url);
    t.on('close', () => console.log('tunnel closed'));
    t.on('error', (err) => console.error('tunnel error:', err.message));
    // Keep alive
    setInterval(() => {}, 1000 * 60);
  } catch (e) {
    console.error('FAILED:', e.message);
  }
})();
