// Simulates a relying site checking Bob's certification. Verification happens server-side
// (not just in the browser) so the age gate can't be bypassed via devtools.

import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importJWK, jwtVerify } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4002;
const ROOT_URL = 'http://localhost:4000';
const app = Fastify({ logger: false });

let cachedJwks = null;
let cachedAt = 0;

async function getRootPublicKey() {
  if (!cachedJwks || Date.now() - cachedAt > 5 * 60 * 1000) {
    const res = await fetch(`${ROOT_URL}/.well-known/jwks.json`);
    cachedJwks = await res.json();
    cachedAt = Date.now();
  }
  const jwk = cachedJwks.keys[0];
  return importJWK(jwk, jwk.alg);
}

app.get('/', async (req, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'bouncer.html'), 'utf8'));
});

app.post('/api/check', async (req, reply) => {
  const { token } = req.body ?? {};
  if (!token) return reply.code(400).send({ ok: false, error: 'no token provided' });

  try {
    const key = await getRootPublicKey();
    const { payload } = await jwtVerify(token, key);
    if (!payload.over18) {
      return { ok: false, error: 'token does not assert over-18' };
    }
    return { ok: true, issuer: payload.iss, expiresAt: payload.exp * 1000 };
  } catch (err) {
    return { ok: false, error: 'invalid or expired token' };
  }
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Bouncer site     http://localhost:${PORT}   (relying-site demo — checks Bob's token)`);
});
