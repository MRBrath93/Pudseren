import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers.js';

const pool = { async query() { return { rows: [] }; } };

describe('sikkerheds-headers', () => {
  it('afslører ikke, at serveren kører Express', async () => {
    const app = createApp({ pool, config: testConfig, pruneSessions: false });
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sætter de vigtigste beskyttelses-headers', async () => {
    const app = createApp({ pool, config: testConfig, pruneSessions: false });
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('kræver HTTPS i produktion (HSTS)', async () => {
    const app = createApp({ pool, config: { ...testConfig, isProduction: true }, pruneSessions: false });
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });
});
