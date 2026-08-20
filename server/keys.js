import { generateKeyPair, exportJWK, exportPKCS8, importPKCS8, SignJWT } from 'jose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, '.keys.json');
const KID = 'root-1';

let privateKey;
let publicJwk;

export async function loadOrCreateKeys() {
  if (fs.existsSync(KEY_PATH)) {
    const { pkcs8, jwk } = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
    privateKey = await importPKCS8(pkcs8, 'EdDSA');
    publicJwk = jwk;
  } else {
    const { publicKey, privateKey: privKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateKey = privKey;
    publicJwk = await exportJWK(publicKey);
    publicJwk.kid = KID;
    publicJwk.alg = 'EdDSA';
    publicJwk.use = 'sig';
    const pkcs8 = await exportPKCS8(privKey);
    fs.writeFileSync(KEY_PATH, JSON.stringify({ pkcs8, jwk: publicJwk }, null, 2));
  }
  return { privateKey, publicJwk };
}

export function getPublicJwk() {
  return publicJwk;
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: KID })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}
