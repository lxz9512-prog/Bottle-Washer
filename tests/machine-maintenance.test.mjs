import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const load = path => ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const constantsUrl = asUrl(load('../client/src/pages/DemoShowcasePage/demo-constants.ts'));
const cycleUrl = asUrl(load('../client/src/pages/DemoShowcasePage/machine-cycle.ts').replace('./demo-constants', constantsUrl));
const maintenanceUrl = asUrl(load('../client/src/pages/DemoShowcasePage/machine-maintenance.ts').replace('./machine-cycle', cycleUrl));
const { DEFAULT_MAINTENANCE, updateMaintenance, needsCleaningReminder, cleaningReminderMilestone } = await import(maintenanceUrl);
const { cycleSteps } = await import(cycleUrl);
const cycle = patch => ({ ...DEFAULT_MAINTENANCE, cycleActive: false, scheduleAt: null, selectedMode: 'auto', customConfig: null, elapsedSeconds: 0, ...patch });

test('all ten-use milestones reappear after dismissal, including 50, 60 and later uses', () => {
  for (let threshold = 10; threshold <= 200; threshold += 10) {
    const state = cycle({ completedWorkCount: threshold - 1, dismissedCleaningReminderAt: threshold - 10 });
    assert.equal(needsCleaningReminder(state), false);
    const done = { ...state, cycleActive: true, elapsedSeconds: 93 * 60 };
    const maintenance = updateMaintenance(state, done);
    assert.equal(maintenance.completedWorkCount, threshold);
    assert.equal(needsCleaningReminder(maintenance), true);
    const dismissed = { ...maintenance, dismissedCleaningReminderAt: cleaningReminderMilestone(maintenance.completedWorkCount) };
    for (let count = threshold; count < threshold + 10; count++) assert.equal(needsCleaningReminder({ ...dismissed, completedWorkCount: count }), false);
  }
});

test('completed work counts once before storage and survives repeated ticks, pause and stop', () => {
  const before = cycle({ completedWorkCount: 9, cycleActive: true, elapsedSeconds: 93 * 60 - 1 });
  assert.equal(updateMaintenance(before, before).completedWorkCount, 9);
  let current = { ...before, elapsedSeconds: 93 * 60 };
  current = { ...current, ...updateMaintenance(before, current) };
  assert.equal(current.completedWorkCount, 10);
  for (const elapsedSeconds of [93 * 60, 94 * 60, 72 * 3600 + 93 * 60]) {
    const next = { ...current, elapsedSeconds };
    current = { ...next, ...updateMaintenance(current, next) };
    assert.equal(current.completedWorkCount, 10);
  }
  const stopped = { ...current, cycleActive: false, elapsedSeconds: 0 };
  assert.equal(updateMaintenance(current, stopped).completedWorkCount, 10);
  assert.equal(updateMaintenance(current, stopped).cycleUsageRecorded, false);
});

test('unfinished and scheduled work do not count; non-wash and storage-only work count when finished', () => {
  const running = cycle({ completedWorkCount: 9, cycleActive: true, elapsedSeconds: 30 });
  assert.equal(updateMaintenance(running, { ...running, cycleActive: false }).completedWorkCount, 9);
  assert.equal(updateMaintenance(running, { ...running, scheduleAt: 1000, elapsedSeconds: 999999 }).completedWorkCount, 9);
  const sterilize = cycle({ cycleActive: true, selectedMode: 'sterilize-dry', elapsedSeconds: 64 * 60 });
  assert.equal(updateMaintenance(sterilize, sterilize).completedWorkCount, 1);
  const storage = cycle({ cycleActive: true, selectedMode: 'custom', customConfig: cycleSteps('custom', null).map(step => ({ ...step, enabled: step.id === 'keep-warm', duration: 10 })), elapsedSeconds: 0 });
  assert.equal(updateMaintenance(storage, storage).completedWorkCount, 0);
  assert.equal(updateMaintenance(storage, { ...storage, elapsedSeconds: 10 * 3600 }).completedWorkCount, 1);
  const empty = { ...storage, customConfig: cycleSteps('custom', null), elapsedSeconds: 100000 };
  assert.equal(updateMaintenance(empty, empty).completedWorkCount, 0);
});

test('machine clean resets on actual start, even if cancelled; selecting or scheduling does not reset', () => {
  const state = cycle({ completedWorkCount: 60, dismissedCleaningReminderAt: 50 });
  const selected = { ...state, selectedMode: 'self-clean' };
  assert.equal(updateMaintenance(state, selected).completedWorkCount, 60);
  const scheduled = { ...selected, scheduleAt: 12345 };
  assert.equal(updateMaintenance(selected, scheduled).completedWorkCount, 60);
  const running = { ...scheduled, cycleActive: true, scheduleAt: null };
  const reset = { ...running, ...updateMaintenance(scheduled, running) };
  assert.deepEqual(updateMaintenance(scheduled, running), DEFAULT_MAINTENANCE);
  assert.deepEqual(updateMaintenance(reset, { ...reset, cycleActive: false }), DEFAULT_MAINTENANCE);
  assert.deepEqual(updateMaintenance(reset, { ...reset, elapsedSeconds: 30 * 60 }), DEFAULT_MAINTENANCE);
});

function loadStore(isApp, disk = new Map()) {
  const modelUrl = asUrl(`
    let active='bw05s';
    export const MACHINE_MODELS=['bw05s','bw05p','bw05a'].map(id=>({id}));
    export const getMachineModel=()=>({id:active});
    export const activateMachineModel=id=>active=id;
    export const supportsMode=mode=>mode!=='unsupported';
    export const machineLocal={get:(key,fallback,id=active)=>globalThis.__maintenanceDisk.get(id+':'+key)??fallback,set:(key,value,id=active)=>globalThis.__maintenanceDisk.set(id+':'+key,structuredClone(value)),remove:(key,id=active)=>globalThis.__maintenanceDisk.delete(id+':'+key)};
    // ${Math.random()}
  `);
  globalThis.__maintenanceDisk = disk;
  const source = load('../client/src/pages/DemoShowcasePage/cleaning-machine-store.ts')
    .replace('./machine-models', modelUrl)
    .replace('../../runtime', asUrl(`export const isApp=${isApp};`))
    .replace('./machine-maintenance', maintenanceUrl);
  return import(asUrl(source)).then(module => module.cleaningMachineStore);
}

test('device store persists dismissal across reloads and isolates models and resets', async () => {
  for (const isApp of [false, true]) {
    const disk = new Map();
    let store = await loadStore(isApp, disk);
    store.set({ completedWorkCount: 9 });
    store.set({ cycleActive: true, selectedMode: 'auto', isRunning: true });
    store.set({ elapsedSeconds: 93 * 60 });
    assert.equal(store.get().completedWorkCount, 10);
    store.dismissCleaningReminder();
    store.set({ elapsedSeconds: 94 * 60 });
    assert.equal(store.get().completedWorkCount, 10);
    assert.equal(store.get('bw05p').completedWorkCount, 0);
    store = await loadStore(isApp, disk);
    assert.equal(store.get().completedWorkCount, 10);
    assert.equal(needsCleaningReminder(store.get()), false);
    store.reset();
    assert.equal(store.get().completedWorkCount, 10, 'resetting page scenarios preserves maintenance history');
    store.set({ selectedMode: 'self-clean', cycleActive: true, elapsedSeconds: 0, scheduleAt: null });
    assert.equal(store.get().completedWorkCount, 0);
    assert.equal(store.get().dismissedCleaningReminderAt, 0);
    store.reset(true);
    assert.equal(store.get().completedWorkCount, 0);
    assert.equal(disk.has('bw05s:machine-maintenance'), false);
  }
});
