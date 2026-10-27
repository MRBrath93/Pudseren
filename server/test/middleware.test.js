import { describe, expect, it } from 'vitest';
import { requireRole } from '../src/middleware/auth.js';

// Kører middleware med en falsk forespørgsel og returnerer, hvad den svarede.
function run(middleware, user) {
  const result = { status: 200, nextCalled: false, body: null };
  const req = { session: { user } };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  middleware(req, res, () => { result.nextCalled = true; });
  return result;
}

describe('requireRole', () => {
  it('lukker en chef med to-faktor ind', () => {
    const result = run(requireRole('chef'), { role: 'chef', twoFactor: true });
    expect(result.nextCalled).toBe(true);
  });

  it('kræver at chefen slår to-faktor til først', () => {
    const result = run(requireRole('chef'), { role: 'chef', twoFactor: false });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
  });

  it('lukker en medarbejder ind uden to-faktor', () => {
    const result = run(requireRole('medarbejder'), { role: 'medarbejder', twoFactor: false });
    expect(result.nextCalled).toBe(true);
  });

  it('afviser en medarbejder på chefens sider', () => {
    const result = run(requireRole('chef'), { role: 'medarbejder', twoFactor: true });
    expect(result.status).toBe(403);
  });

  it('kræver login', () => {
    const result = run(requireRole('chef'), undefined);
    expect(result.status).toBe(401);
  });
});
