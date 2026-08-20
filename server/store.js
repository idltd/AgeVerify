// In-memory only — a restart clears pending registrations and accreditations. Fine for a POC.

const pending = new Map(); // domain -> verification code
const accredited = new Map(); // origin -> { domain, accreditedAt }

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

export function accredit(domain) {
  accredited.set(normalize(domain), { domain: normalize(domain), accreditedAt: Date.now() });
}

export function isAccredited(origin) {
  return accredited.has(normalize(origin || ''));
}

export function listAccredited() {
  return [...accredited.values()];
}
