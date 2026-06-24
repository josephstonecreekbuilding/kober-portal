const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY3Mjg5NDA4MywiYWFpIjoxMSwidWlkIjoxMDM2MzA0NzAsImlhZCI6IjIwMjYtMDYtMThUMjI6MzI6MDkuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjM1MTE0OTQ3LCJyZ24iOiJ1c2UxIn0.BNSJvxNMVlUcwRuIVnMbrE_euqSwgYWKVhlL8NYpy84';

  // ── PHOTO PROXY ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const photoUrl = req.query && req.query.photo ? decodeURIComponent(req.query.photo) : null;
    if (!photoUrl || !photoUrl.includes('monday.com')) {
      return res.status(400).end('Invalid photo URL');
    }

    return new Promise((resolve) => {
      const url = new URL(photoUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers: {
          'Authorization': token,
          'User-Agent': 'Mozilla/5.0'
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        // Follow redirects
        if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
          const redirectUrl = proxyRes.headers['location'];
          if (redirectUrl) {
            const rUrl = new URL(redirectUrl);
            const rOptions = {
              hostname: rUrl.hostname,
              path: rUrl.pathname + (rUrl.search || ''),
              method: 'GET',
              headers: { 'User-Agent': 'Mozilla/5.0' }
            };
            https.request(rOptions, (rRes) => {
              res.setHeader('Content-Type', rRes.headers['content-type'] || 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.writeHead(200);
              rRes.pipe(res);
              rRes.on('end', resolve);
            }).on('error', (e) => { res.status(502).end(e.message); resolve(); }).end();
            return;
          }
        }
        res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.writeHead(proxyRes.statusCode);
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
      });

      proxyReq.on('error', (e) => {
        res.status(502).end(e.message);
        resolve();
      });
      proxyReq.end();
    });
  }

  // ── GRAPHQL PROXY ────────────────────────────────────────────────────────────
  const query = req.body && req.body.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const payload = JSON.stringify({ query });

  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const r = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });

  try {
    return res.status(200).json(JSON.parse(result));
  } catch(e) {
    return res.status(500).json({ error: 'Parse error', raw: result.slice(0, 300) });
  }
};
