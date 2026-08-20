import { generateKeyPair, exportJWK, exportPKCS8, importPKCS8, importJWK, SignJWT, jwtVerify } from 'jose';
import fs from 'node:fs';

// Loads a persisted EdDSA keypair from keyPath, or generates and persists a new one.
// Used by both Root and Voucher — each holds its own keypair, identified by its own kid.
export async function loadOrCreateKeypair(keyPath, kid) {
  if (fs.existsSync(keyPath)) {
    const { pkcs8, jwk } = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const privateKey = await importPKCS8(pkcs8, 'EdDSA');
    return { privateKey, publicJwk: jwk, kid };
  }
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = 'EdDSA';
  publicJwk.use = 'sig';
  const pkcs8 = await exportPKCS8(privateKey);
  fs.writeFileSync(keyPath, JSON.stringify({ pkcs8, jwk: publicJwk }, null, 2));
  return { privateKey, publicJwk, kid };
}

export async function sign(privateKey, kid, payload, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

export async function verify(jwt, publicJwk) {
  const key = await importJWK(publicJwk, publicJwk.alg);
  return jwtVerify(jwt, key);
}
