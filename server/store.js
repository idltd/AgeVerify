// In-memory only — a restart clears pending registrations and accreditations. Fine for a POC.

export const ENTITLEMENTS = ['over18', 'over21'];

const pending = new Map(); // domain -> verification code
const accredited = new Map(); // domain -> { domain, publicJwk, scope, accreditedAt }
const byKid = new Map(); // voucher kid -> domain

function normalize(domain) {
  return domain.replace(/\/$/, '');
}

export function setPending(domain, code) {
  pending.set(normalize(domain), code);
}

export function getPending(domain) {
  return pending.get(normalize(domain));
}

export function clearPending(domain) {
  pending.delete(normalize(domain));
}

// Accredits a Voucher's domain, registering the subkey it will sign mint-authorization
// assertions with, scoped to the entitlements it's trusted to assert.
export function accredit(domain, { publicJwk, scope }) {
  const record = { domain: normalize(domain), publicJwk, scope, accreditedAt: Date.now() };
  accredited.set(record.domain, record);
  byKid.set(publicJwk.kid, record.domain);
}

export function isAccredited(domain) {
  return accredited.has(normalize(domain || ''));
}

export function getVoucherByKid(kid) {
  const domain = byKid.get(kid);
  return domain ? accredited.get(domain) : undefined;
}

export function listAccredited() {
  return [...accredited.values()];
}
