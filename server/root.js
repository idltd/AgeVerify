// Root authority: accredits Voucher domains + subkeys, and mints age-certification tokens.
// Never asks how a Voucher knows a user is an adult — only proves the Voucher controls the
// domain it claims. Mints Bob's actual token itself, with its own single key, so a token
// carries no information about which Voucher authorized it.

import Fastify from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateKeypair, sign, verify } from './keys.js';
import { setPending, getPending, clearPending, accredit, isAccredited, getVoucherByKid, listAccredited, ENTITLEMENTS } from './store.js';

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

// Step 2: root fetches the domain and checks the code is present (well-known file or homepage
// meta tag), then registers the Voucher's subkey, scoped to the entitlements it's requesting.
app.post('/api/verify', async (req, reply) => {
  const { domain, publicJwk, scope } = req.body ?? {};
  const code = getPending(domain);
  if (!code) return reply.code(400).send({ error: 'no pending registration for this domain' });
  if (!publicJwk?.kid) return reply.code(400).send({ error: 'publicJwk with kid is required' });
  if (!Array.isArray(scope) || scope.length === 0 || !scope.every(e => ENTITLEMENTS.includes(e))) {
    return reply.code(400).send({ error: `scope must be a non-empty subset of ${ENTITLEMENTS.join(', ')}` });
  }

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

  accredit(domain, { publicJwk, scope });
  clearPending(domain);
  return { accredited: true, domain: domain.replace(/\/$/, ''), scope };
});

app.get('/api/status', async (req, reply) => {
  const domain = req.query.domain ?? '';
  return { accredited: isAccredited(domain) };
});

app.get('/api/vouchers', async () => ({ vouchers: listAccredited().map(({ domain, scope, accreditedAt }) => ({ domain, scope, accreditedAt })) }));

// Bob's certification: Bob's browser presents a short-lived assertion signed by an accredited
// Voucher's own subkey ("my subkey vouches for this bearer, entitlement X"). Root checks the
// signature against the subkey it registered for that kid, then mints Bob's actual token with
// its OWN key — the token carries no Voucher-identifying data, so every accredited Voucher's
// tokens are indistinguishable to whoever later checks them.
app.post('/api/mint', async (req, reply) => {
  const { assertion } = req.body ?? {};
  if (!assertion) return reply.code(400).send({ error: 'no assertion provided' });

  let payload, kid;
  try {
    const header = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url').toString());
    kid = header.kid;
  } catch {
    return reply.code(400).send({ error: 'malformed assertion' });
  }

  const voucher = getVoucherByKid(kid);
  if (!voucher) return reply.code(403).send({ error: 'assertion signed by an unaccredited or unknown subkey' });

  try {
    ({ payload } = await verify(assertion, voucher.publicJwk));
  } catch {
    return reply.code(403).send({ error: 'assertion signature invalid or expired' });
  }

  if (!voucher.scope.includes(payload.entitlement)) {
    return reply.code(403).send({ error: `Voucher is not accredited for entitlement '${payload.entitlement}'` });
  }

  const token = await sign(rootKey.privateKey, rootKey.kid, { entitlement: payload.entitlement }, '1h');
  return { token, expiresIn: 3600 };
});

app.get('/.well-known/jwks.json', async () => ({ keys: [rootKey.publicJwk] }));

const rootKey = await loadOrCreateKeypair(path.join(__dirname, '.keys.json'), 'root-1');
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Root authority   http://localhost:${PORT}   (voucher registration + mint + jwks)`);
});
