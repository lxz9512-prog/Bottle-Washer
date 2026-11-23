import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('cloud editing authenticates, persists and rejects stale or invalid writes', async () => {
  const bundle = await build({ entryPoints: ['worker/index.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-02-01', d1Databases: ['DB'],
    bindings: { EDIT_PASSWORD_HASH: createHash('sha256').update('test-password').digest('hex'), SESSION_SECRET: 'test-secret-for-session-signatures' },
    serviceBindings: { ASSETS: () => new Response('Demo assets') },
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const statement of readFileSync('worker/migrations/0001_notes.sql', 'utf8').split(';').filter(value => value.trim())) await db.prepare(statement).run();
    const request = (path, method = 'GET', body, cookie, origin) => mf.dispatchFetch(`https://demo.test${path}`, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const endpoint = '/api/notes/pages/devices';
    const initial = await (await request(endpoint)).json();
    assert.equal(initial.revision, null);
    assert.ok(initial.notes.length > 0);
    const update = { notes: initial.notes.map((note, index) => ({ ...note, body: index === 0 ? '已保存的线上说明' : note.body })), revision: null };
    assert.equal((await request(endpoint, 'PUT', update)).status, 401);
    assert.equal((await request('/api/notes/session', 'POST', { password: 'wrong' })).status, 401);
    const login = await request('/api/notes/session', 'POST', { password: 'test-password' });
    assert.equal(login.status, 200);
    const session = login.headers.get('set-cookie');
    assert.match(session, /HttpOnly; SameSite=Strict/);
    assert.match(session, /Secure/);
    const cookie = session.split(';')[0];
    assert.equal((await (await request('/api/notes/session', 'GET', undefined, cookie)).json()).unlocked, true);
    const saved = await (await request(endpoint, 'PUT', update, cookie)).json();
    assert.ok(saved.revision);
    assert.equal(saved.notes[0].body, '已保存的线上说明');
    assert.deepEqual(await (await request(endpoint)).json(), saved, 'independent public reader sees saved data');
    assert.equal((await request(endpoint, 'PUT', update, cookie)).status, 409, 'stale INSERT cannot overwrite');
    const revised = { ...update, revision: saved.revision };
    assert.equal((await request(endpoint, 'PUT', revised, cookie, 'https://other.test')).status, 403);
    assert.equal((await request(endpoint, 'PUT', { ...revised, notes: [] }, cookie)).status, 400);
    const second = await (await request(endpoint, 'PUT', revised, cookie)).json();
    assert.notEqual(second.revision, saved.revision);
    assert.equal((await request(endpoint, 'PUT', revised, cookie)).status, 409, 'stale UPDATE cannot overwrite');
    const forged = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
    assert.equal((await request(endpoint, 'PUT', { ...update, revision: second.revision }, forged)).status, 401);
    const logout = await request('/api/notes/session', 'DELETE', undefined, cookie);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await (await request('/api/notes/session')).json()).unlocked, false);
    assert.equal((await request('/api/notes/pages/unknown')).status, 404);
    assert.equal(await (await request('/')).text(), 'Demo assets');
    for (let index = 0; index < 10; index++) assert.equal((await request('/api/notes/session', 'POST', { password: 'wrong' })).status, 401);
    assert.equal((await request('/api/notes/session', 'POST', { password: 'test-password' })).status, 429);
  } finally { await mf.dispose(); }
});
