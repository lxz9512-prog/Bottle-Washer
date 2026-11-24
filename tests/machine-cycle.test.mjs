import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const load = path => ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const constantsUrl = asUrl(load('../client/src/pages/DemoShowcasePage/demo-constants.ts'));
const { DEFAULT_CUSTOM_MODES } = await import(constantsUrl);
const { cycleSteps, cycleMinutes, isCustomMode, cycleProgress, normalizeDuration, lockedCycleSteps, pausedCycleEdits, isRequiredCycleStep } = await import(asUrl(load('../client/src/pages/DemoShowcasePage/machine-cycle.ts').replace('./demo-constants', constantsUrl)));

test('custom starts unchecked and duration ranges match the design', () => {
  assert.ok(DEFAULT_CUSTOM_MODES.every(step => !step.enabled));
  assert.deepEqual(DEFAULT_CUSTOM_MODES.map(({ min, max, duration, step }) => [min, max, duration, step]), [[19, 45, 29, 1], [7, 10, 9, 1], [40, 70, 55, 5], [10, 72, 72, 1]]);
});
test('numeric edits clamp bounds and empty input restores original default', () => {
  const wash = { ...DEFAULT_CUSTOM_MODES[0], duration: 40 };
  assert.deepEqual(normalizeDuration('', wash), { value: 29, invalid: false });
  assert.deepEqual(normalizeDuration('99', wash), { value: 45, invalid: true });
  assert.deepEqual(normalizeDuration('1', wash), { value: 19, invalid: true });
  assert.equal(normalizeDuration('abc', wash).invalid, true);
});
test('progress advances in order, excludes disabled stages and counts keep warm separately', () => {
  const steps = cycleSteps('auto', null);
  assert.equal(cycleProgress(steps, 0).remaining, 93 * 60);
  assert.deepEqual(cycleProgress(steps, 29 * 60).statuses.map(s => s.status), ['completed', 'active', 'pending', 'pending']);
  assert.equal(cycleProgress(steps, 93 * 60).complete, false);
  assert.equal(cycleProgress(steps, 93 * 60).totalRemaining, 72 * 3600);
  assert.equal(cycleProgress(steps, 93 * 60 + 72 * 3600).complete, true);
  assert.deepEqual(cycleProgress(cycleSteps('self-clean', null), 0).statuses.map(s => s.status), ['active', 'off', 'pending', 'off']);
});
test('paused edits lock earlier skipped stages as well as current and completed stages', () => {
  const steps = DEFAULT_CUSTOM_MODES.map((step, index) => ({ ...step, enabled: index > 0 }));
  assert.deepEqual(lockedCycleSteps(steps, 1), { wash: 'off', sterilize: 'active' });
  assert.equal(lockedCycleSteps(steps, 9 * 60).dry, 'active');
  assert.equal(lockedCycleSteps(steps, 9 * 60)['keep-warm'], undefined);
});
test('preset durations exclude storage and sterilize-dry excludes washing', () => {
  assert.equal(cycleMinutes(cycleSteps('auto', null)), 93);
  assert.equal(cycleMinutes(cycleSteps('rapid', null)), 83);
  assert.equal(cycleMinutes(cycleSteps('self-clean', null)), 30);
  assert.equal(cycleMinutes(cycleSteps('sterilize-dry', null)), 64);
  assert.equal(cycleSteps('sterilize-dry', null)[0].enabled, false);
  const changed = cycleSteps('auto', null).map(step => ({ ...step, enabled: step.id !== 'wash', duration: step.id === 'keep-warm' ? 12 : step.duration }));
  assert.equal(cycleMinutes(cycleSteps('auto', changed)), 93);
  assert.equal(cycleSteps('auto', changed)[3].duration, 12);
});
test('preset washing stays enabled even in previously saved preferences', () => {
  for (const mode of ['smart', 'auto', 'rapid', 'intensive', 'self-clean', 'baby', 'bottles', 'food-bowl', 'delicate-wash']) {
    const saved = cycleSteps(mode, null).map(step => ({ ...step, enabled: step.id !== 'wash' && step.enabled }));
    assert.equal(cycleSteps(mode, saved)[0].enabled, true, mode);
  }
  for (const mode of ['custom', 'custom-2', 'custom-3', 'sterilize-dry']) {
    assert.equal(cycleSteps(mode, cycleSteps(mode, null))[0].enabled, false, mode);
  }
});
test('three custom slots use their own parameter snapshot', () => {
  assert.equal(isCustomMode('custom-3'), true);
  assert.equal(isCustomMode('custom-4'), false);
  const custom = DEFAULT_CUSTOM_MODES.map(step => ({ ...step, enabled: step.id === 'wash', duration: step.id === 'wash' ? 35 : step.duration }));
  assert.equal(cycleMinutes(cycleSteps('custom-2', custom)), 35);
  assert.equal(cycleMinutes(cycleSteps('custom-3', null)), 0);
});
test('paused presets only edit future optional selections and storage duration', () => {
  const steps = cycleSteps('auto', null);
  const draft = steps.map(step => ({ ...step, enabled: false, duration: step.min }));
  const edited = pausedCycleEdits('auto', steps, draft, 1);
  assert.deepEqual(edited[0], steps[0]);
  assert.deepEqual(edited.slice(1).map(step => [step.enabled, step.duration]), [[false, 9], [false, 55], [false, 10]]);
  const duringSteam = pausedCycleEdits('auto', steps, draft, 29 * 60);
  assert.deepEqual(duringSteam.slice(0, 2), steps.slice(0, 2));
  const duringStorage = pausedCycleEdits('auto', steps, draft, 93 * 60);
  assert.deepEqual(duringStorage, steps);
});
test('paused edits preserve unavailable preset steps and allow custom future duration edits', () => {
  const steps = cycleSteps('self-clean', null);
  const draft = steps.map(step => ({ ...step, enabled: true, duration: step.max }));
  assert.deepEqual(pausedCycleEdits('self-clean', steps, draft, 1), steps);
  const custom = cycleSteps('custom-2', DEFAULT_CUSTOM_MODES.map(step => ({ ...step, enabled: true, duration: step.max })));
  const edited = pausedCycleEdits('custom-2', custom, custom.map(step => ({ ...step, duration: step.min })), 1);
  assert.deepEqual(edited[0], custom[0]);
  assert.equal(edited[2].duration, 40);
});


test('machine clean fixes wash at 20 min and dry at 10 min, overriding old preferences', () => {
  const legacy = DEFAULT_CUSTOM_MODES.map(step => ({...step, enabled:step.id==='wash'}));
  const steps = cycleSteps('self-clean', legacy);
  assert.deepEqual(steps.filter(step=>step.enabled).map(step=>[step.id,step.duration,step.min,step.max]),[['wash',20,20,20],['dry',10,10,10]]);
  assert.equal(cycleMinutes(steps),30);
  assert.equal(isRequiredCycleStep('self-clean','wash'),true);
  assert.equal(isRequiredCycleStep('self-clean','dry'),true);
  assert.deepEqual(cycleProgress(steps,20*60).statuses.map(step=>step.status),['completed','off','active','off']);
  assert.equal(cycleProgress(steps,20*60).remaining,10*60);
  assert.equal(cycleProgress(steps,30*60).complete,true);
  const edited=steps.map(step=>({...step,enabled:false,duration:999}));
  assert.deepEqual(pausedCycleEdits('self-clean',steps,edited,1),steps);
  assert.deepEqual(pausedCycleEdits('self-clean',legacy,edited,1),steps);
  assert.equal(isRequiredCycleStep('auto','dry'),false);
  assert.equal(isRequiredCycleStep('custom','wash'),false);
  assert.equal(isRequiredCycleStep('sterilize-dry','wash'),false);
});
