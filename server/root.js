// Root authority: accredits Voucher domains and mints age-certification tokens.
// Never asks how a Voucher knows a user is an adult — only proves the Voucher controls the domain it claims.

import Fastify from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateKeys, getPublicJwk, signToken } from './keys.js';
import { setPending, getPending, clearPending, accredit, isAccredited, listAccredited } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4000;
const app = Fastify({ logger: false });

app.addHook('onRequest', (req, reply, done) => {
  const origin = req.headers.origin;
  if (origin) reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  done();
});
app.options('/*', async (req, reply) => reply.send());

app.get('/', async (req, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'voucher.html'), 'utf8'));
});

// Step 1: a would-be Voucher submits the domain it wants accredited.
app.post('/api/register', async (req, reply) => {
  const { domain } = req.body ?? {};
  if (!domain || !/^https?:\/\//.test(domain)) {
    return reply.code(400).send({ error: 'domain must be a full http(s):// URL' });
  }
  const code = crypto.randomBytes(12).toString('hex');
  setPending(domain, code);
  return {
    code,
    wellKnownUrl: `${domain.replace(/\/$/, '')}/.well-known/ageverify.txt`,
    metaTag: `<meta name="ageverify-verify" content="${code}">`
  };
});

// Step 2: root fetches the domain and checks the code is present (well-known file or homepage meta tag).
app.post('/api/verify', async (req, reply) => {
  const { domain } = req.body ?? {};
  const code = getPending(domain);
  if (!code) return reply.code(400).send({ error: 'no pending registration for this domain' });

  const base = domain.replace(/\/$/, '');
  let ok = false;

  try {
    const res = await fetch(`${base}/.well-known/ageverify.txt`);
    if (res.ok && (await res.text()).trim() === code) ok = true;
  } catch {
    // fall through to meta tag check
  }

  if (!ok) {
    try {
      const res = await fetch(base);
      if (res.ok && (await res.text()).includes(`content="${code}"`)) ok = true;
    } catch {
      // neither method reachable
    }
  }

  if (!ok) {
    return reply.code(400).send({ error: 'verification code not found (checked .well-known/ageverify.txt and homepage meta tag)' });
  }

  accredit(domain);
  clearPending(domain);
  return { accredited: true, domain: domain.replace(/\/$/, '') };
});

app.get('/api/status', async (req, reply) => {
  const domain = req.query.domain ?? '';
  return { accredited: isAccredited(domain) };
});

app.get('/api/vouchers', async () => ({ vouchers: listAccredited() }));

// Bob's certification: only an accredited Voucher origin may mint, proven by the browser's own Origin header.
app.post('/api/mint', async (req, reply) => {
  const origin = req.headers.origin;
  if (!isAccredited(origin)) {
    return reply.code(403).send({ error: 'origin is not an accredited Voucher' });
  }
  const token = await signToken({ iss: origin, over18: true });
  return { token, expiresIn: 3600 };
});

app.get('/.well-known/jwks.json', async () => ({ keys: [getPublicJwk()] }));

await loadOrCreateKeys();
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Root authority   http://localhost:${PORT}   (voucher registration + mint + jwks)`);
});
