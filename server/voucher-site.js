// Simulates an accredited Voucher's own site (e.g. an employer intranet or GP portal).
// Serves bob.html (the "get certified" widget), proves domain ownership back to root, and
// holds its own signing subkey. It never contacts Root at Bob's click time — it just signs a
// short-lived assertion locally ("my subkey vouches for this bearer") for Bob's browser to
// carry to Root itself. This site never learns whether Bob's assertion was redeemed, or where.

import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateKeypair, sign } from './keys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4001;
const app = Fastify({ logger: false });

app.addHook('onRequest', (req, reply, done) => {
  const origin = req.headers.origin;
  if (origin) reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  done();
});
app.options('/*', async (req, reply) => reply.send());

let currentCode = null; // set via /internal/set-code once voucher.html registers with root
let currentScope = null; // set via /internal/set-scope once root accredits this site

app.post('/internal/set-code', async (req, reply) => {
  currentCode = (req.body ?? {}).code ?? null;
  return { ok: true };
});

app.post('/internal/set-scope', async (req, reply) => {
  currentScope = (req.body ?? {}).scope ?? null;
  return { ok: true };
});

app.get('/.well-known/ageverify.txt', async (req, reply) => {
  reply.type('text/plain').send(currentCode ?? '');
});

app.get('/api/pubkey', async () => ({ publicJwk: voucherKey.publicJwk }));

app.get('/api/scope', async () => ({ scope: currentScope }));

// Bob's browser calls this after passing whatever gate this Voucher runs (login, HR record,
// door check, whatever). Signs a 5-minute assertion with this Voucher's own subkey — Root
// checks that signature, not this server, at mint time.
app.post('/api/authorize', async (req, reply) => {
  const { entitlement } = req.body ?? {};
  if (!currentScope?.includes(entitlement)) {
    return reply.code(400).send({ error: `not accredited for entitlement '${entitlement}'` });
  }
  const assertion = await sign(voucherKey.privateKey, voucherKey.kid, { entitlement }, '5m');
  return { assertion };
});

app.get('/', async (req, reply) => {
  const metaTag = currentCode ? `<meta name="ageverify-verify" content="${currentCode}">` : '';
  reply.type('text/html').send(`<!doctype html><html><head>${metaTag}<title>Acme Corp Staff Portal</title>
<style>
  :root { --bg:#f4f5f9; --card:#fff; --text:#1a1a2e; --muted:#6b7280; --accent:#b69cff; --accent-dark:#8a68f0; --radius:14px; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 3rem 1rem; line-height: 1.5; }
  .card { max-width: 560px; margin: 0 auto; background: var(--card); border-radius: var(--radius); padding: 2.25rem;
    box-shadow: 0 1px 2px rgba(20,20,40,0.04), 0 8px 24px rgba(20,20,40,0.06); border-top: 4px solid var(--accent); }
  h1 { font-size: 1.4rem; margin: 0 0 0.4rem; }
  .lede { color: var(--muted); }
  a.cta { display: inline-block; margin-top: 0.5rem; background: var(--accent-dark); color: #fff; text-decoration: none;
    border-radius: 8px; padding: 0.65rem 1.2rem; font-size: 0.9rem; font-weight: 600; }
  a.cta:hover { opacity: 0.88; }
</style>
</head>
<body>
<div class="card">
<h1>🏢 Acme Corp — Staff Portal (demo)</h1>
<p class="lede">This stands in for a real employer/GP-surgery page that's already behind its own login.</p>
<a class="cta" href="/bob.html">Continue to entitlement certification &rarr;</a>
</div>
</body></html>`);
});

app.get('/bob.html', async (req, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'bob.html'), 'utf8'));
});

const voucherKey = await loadOrCreateKeypair(path.join(__dirname, '.voucher-keys.json'), 'voucher-1');
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Voucher site     http://localhost:${PORT}   (Acme Corp demo — Bob gets certified here)`);
});
