// Simulates an accredited Voucher's own site (e.g. an employer intranet or GP portal).
// Serves bob.html (the "get certified" widget) and proves domain ownership back to root
// via /.well-known/ageverify.txt and a homepage meta tag, whichever root asks for.

import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4001;
const app = Fastify({ logger: false });

let currentCode = null; // set via /internal/set-code once voucher.html registers with root

app.post('/internal/set-code', async (req, reply) => {
  currentCode = (req.body ?? {}).code ?? null;
  return { ok: true };
});

app.get('/.well-known/ageverify.txt', async (req, reply) => {
  reply.type('text/plain').send(currentCode ?? '');
});

app.get('/', async (req, reply) => {
  const metaTag = currentCode ? `<meta name="ageverify-verify" content="${currentCode}">` : '';
  reply.type('text/html').send(`<!doctype html><html><head>${metaTag}<title>Acme Corp Staff Portal</title></head>
<body style="font-family:system-ui;padding:2rem">
<h1>Acme Corp — Staff Portal (demo)</h1>
<p>This stands in for a real employer/GP-surgery page that's already behind its own login.</p>
<p><a href="/bob.html">Continue to age certification &rarr;</a></p>
</body></html>`);
});

app.get('/bob.html', async (req, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'bob.html'), 'utf8'));
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Voucher site     http://localhost:${PORT}   (Acme Corp demo — Bob gets certified here)`);
});
