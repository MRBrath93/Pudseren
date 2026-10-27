import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// En falsk database, så vi kan teste begge udfald uden en rigtig forbindelse.
function fakePool(works) {
  return {
    async query() {
      if (works) return { rows: [{ '?column?': 1 }] };
      throw new Error('Ingen forbindelse');
    },
  };
}

describe('GET /api/health', () => {
  it('svarer ok, når databasen svarer', async () => {
    const res = await request(createApp({ pool: fakePool(true) })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, database: true });
  });

  it('svarer 503, når databasen ikke kan nås', async () => {
    const res = await request(createApp({ pool: fakePool(false) })).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, database: false });
  });
});
