import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpile(readFileSync(new URL('../client/src/demo/interaction-notes.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const { loadNotes, saveNotes, NotesError } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const page = { id: 'devices', title: '设备列表', notes: [{ title: '设备入口', body: '设备列表说明', target: 'device' }] };
const response = (status, body = {}) => new Response(JSON.stringify(body), { status });
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');

test('reads UTF-8 cloud notes and preserves the original connector target', async t => {
  t.mock.method(globalThis, 'fetch', async () => response(200, { sha: 'current', content: encoded({ version: 1, pageId: 'devices', notes: [{ title: '线上标题', body: '多行正文\n第二行', target: 'untrusted' }] }) }));
  assert.deepEqual(await loadNotes(page), { sha: 'current', notes: [{ title: '线上标题', body: '多行正文\n第二行', target: 'device' }] });
});

test('uses bundled notes for missing cloud files and surfaces access failures', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => response(404));
  assert.deepEqual(await loadNotes(page), { notes: page.notes, sha: null });
  fetchMock.mock.mockImplementation(async () => response(403));
  await assert.rejects(loadNotes(page), error => error instanceof NotesError && error.status === 403);
});

test('saves with the read SHA and rejects conflicts without overwriting', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'PUT') return response(409);
    return response(200);
  });
  await assert.rejects(saveNotes(page, page.notes, 'old-sha', 'test-token'), error => error.status === 409);
  const write = calls.find(call => call.init.method === 'PUT');
  const body = JSON.parse(write.init.body);
  assert.equal(body.sha, 'old-sha');
  assert.equal(body.branch, 'codex/interaction-notes');
  assert.equal(write.init.headers.Authorization, 'Bearer test-token');
  assert.equal(JSON.parse(Buffer.from(body.content, 'base64').toString()).notes[0].body, '设备列表说明');
  assert.equal(calls.filter(call => call.init.method === 'PUT').length, 1);
});

test('handles concurrent branch creation before saving a new page', async t => {
  let refReads = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/git/ref/heads/main')) return response(200, { object: { sha: 'main-head' } });
    if (url.includes('/git/ref/heads/codex/')) return response(++refReads === 1 ? 404 : 200);
    if (init.method === 'POST') return response(422);
    if (init.method === 'PUT') {
      assert.equal(JSON.parse(init.body).sha, undefined);
      return response(201, { content: { sha: 'saved' } });
    }
    throw new Error('Unexpected request');
  });
  assert.deepEqual(await saveNotes(page, page.notes, null, 'test-token'), { notes: page.notes, sha: 'saved' });
});

test('validates content and credentials before network writes', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not request'); });
  await assert.rejects(saveNotes(page, page.notes, null, ''));
  await assert.rejects(saveNotes(page, [{ ...page.notes[0], body: ' ' }], null, 'test-token'));
  assert.equal(fetchMock.mock.callCount(), 0);
});
