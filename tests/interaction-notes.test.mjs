import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpile(readFileSync(new URL('../client/src/demo/interaction-notes.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const { loadNotes, saveNotes, editingSession, unlockEditing, lockEditing, NotesError } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const page = { id: 'devices', title: '设备列表', notes: [{ title: '设备入口', body: '设备列表说明', target: 'device' }] };
const normalizedNotes = page.notes.map((note,index)=>({...note,id:'legacy-'+index}));
const response = (status, body = {}) => Response.json(body, { status });

test('reads UTF-8 cloud notes and preserves the original connector target', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/notes/pages/devices');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    return response(200, { revision: 'current', notes: [{ title: '线上标题', body: '多行正文\n第二行', target: 'untrusted' }] });
  });
  assert.deepEqual(await loadNotes(page), { revision: 'current', notes: [{ id:'legacy-0', title: '线上标题', body: '多行正文\n第二行', target: 'device' }] });
});

test('uses bundled notes supplied by the server and surfaces service failures', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response(200, { notes: page.notes, revision: null }));
  assert.deepEqual(await loadNotes(page), { notes: normalizedNotes, revision: null });
  mock.mock.mockImplementation(async () => response(503, { message: '保存服务暂时不可用' }));
  await assert.rejects(loadNotes(page), error => error instanceof NotesError && error.status === 503 && error.message === '保存服务暂时不可用');
});

test('sends the read revision and propagates conflicts without retrying an overwrite', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'PUT');
    assert.deepEqual(JSON.parse(init.body), { notes: normalizedNotes, revision: 'old-revision' });
    assert.equal(init.headers.Authorization, undefined);
    return response(409, { message: '版本冲突' });
  });
  await assert.rejects(saveNotes(page, page.notes, 'old-revision'), error => error.status === 409);
  assert.equal(mock.mock.callCount(), 1);
});

test('password unlock, session status and lock use the same-origin session endpoint', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return response(200, { unlocked: true });
  });
  assert.equal(await editingSession(), true);
  await unlockEditing('test-password');
  await lockEditing();
  assert.ok(calls.every(call => call.url === '/api/notes/session' && call.init.credentials === 'same-origin'));
  assert.equal(JSON.parse(calls[1].init.body).password, 'test-password');
  assert.equal(calls[2].init.method, 'DELETE');
});

test('validates content before network writes', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not request'); });
  await assert.rejects(saveNotes(page, [{ ...page.notes[0], body: ' ' }], null));
  assert.equal(mock.mock.callCount(), 0);
});

test('additional notes round-trip with no arbitrary connector targets', async t => {
  const notes = [...page.notes, { title: '新增标题', body: '新增正文\n第二行', target: 'untrusted' }];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.notes[1].target, '');
    return response(200, { ...body, revision: 'added' });
  });
  const saved = await saveNotes(page, notes, 'current');
  assert.equal(saved.notes.length, 2);
  assert.deepEqual(saved.notes[1], { id:'legacy-1', title: '新增标题', body: '新增正文\n第二行', target: '' });
});

test('rejects invalid arrays and excessive additions before writing', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not request'); });
  await assert.rejects(saveNotes(page, null, null));
  await assert.rejects(saveNotes(page, Array.from({length:41},()=>page.notes[0]), null));
  assert.equal(mock.mock.callCount(), 0);
});


test('deletion preserves remaining identities and connector targets', async t => {
  const twoNotes={...page,notes:[page.notes[0],{title:'第二项',body:'第二项说明',target:'content'}]};
  const remaining={id:'legacy-1',title:'第二项',body:'第二项说明',target:'content'};
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    const body=JSON.parse(init.body);
    assert.deepEqual(body.notes,[remaining]);
    return response(200,{...body,revision:'deleted-first'});
  });
  assert.deepEqual((await saveNotes(twoNotes,[remaining],'before-delete')).notes,[remaining]);
});

test('empty pages remain empty when saved and read', async t => {
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(init.body)assert.deepEqual(JSON.parse(init.body).notes,[]);
    return response(200,{notes:[],revision:'cleared'});
  });
  assert.deepEqual(await saveNotes(page,[],'before-clear'),{notes:[],revision:'cleared'});
  assert.deepEqual(await loadNotes(page),{notes:[],revision:'cleared'});
});

test('duplicate identifiers cannot be saved', async t => {
  const mock=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Must not request')});
  await assert.rejects(saveNotes(page,[{...page.notes[0],id:'legacy-0'},{...page.notes[0],id:'legacy-0'}],null));
  assert.equal(mock.mock.callCount(),0);
});
