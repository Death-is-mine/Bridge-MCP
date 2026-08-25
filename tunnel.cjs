const lt = require('localtunnel');
(async () => {
  try {
    const t = await lt({ port: 3000, subdomain: 'bridge-mcp-e2e' });
    const fs = require('fs');
    fs.writeFileSync('D:/Projects/Bridge MCP/tunnel-url.txt', t.url);
    console.log('TUNNEL_URL=' + t.url);
    t.on('close', () => { console.log('closed'); process.exit(0); });
    t.on('error', (err) => console.error('err:', err.message));
    setInterval(() => {}, 60000);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
})();
