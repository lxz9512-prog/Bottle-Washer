import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = ts.transpile(readFileSync(new URL('../client/src/components/mobile-viewport.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext });
const { resolveMobileViewport } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const viewport = patch => ({ layoutHeight: 912, visualHeight: 912, visualTop: 0, scale: 1, standalone: true, editing: false, screenHeight: 912, screenWidth: 420, layoutWidth: 420, nativeSafeTop: 62, previousReservedTop: 0, ...patch });

test('installed app ignores a short or shifted visual viewport when no keyboard is open', () => {
  assert.deepEqual(resolveMobileViewport(viewport({ visualHeight: 816, visualTop: 62 })), { height: 912, top: 0, reservedTop: 0 });
  assert.deepEqual(resolveMobileViewport(viewport({ visualHeight: 0, visualTop: 62 })), { height: 912, top: 0, reservedTop: 0 });
});
test('already-reserved native status bar is not padded a second time', () => {
  assert.deepEqual(resolveMobileViewport(viewport({ layoutHeight: 850, visualHeight: 850 })), { height: 850, top: 0, reservedTop: 62 });
  assert.equal(resolveMobileViewport(viewport({ layoutHeight: 850, visualHeight: 850, screenWidth: 912 })).reservedTop, 0, 'do not infer reserved status bars from a mismatched screen orientation');
});
test('keyboard resizes the app and preserves reserved status-bar spacing', () => {
  assert.deepEqual(resolveMobileViewport(viewport({ visualHeight: 400, visualTop: 30, editing: true })), { height: 400, top: 30, reservedTop: 0 });
  assert.deepEqual(resolveMobileViewport(viewport({ layoutHeight: 850, visualHeight: 400, editing: true, previousReservedTop: 62 })), { height: 400, top: 0, reservedTop: 62 });
  assert.deepEqual(resolveMobileViewport(viewport({ visualHeight: 400, visualTop: 62, editing: false })), { height: 912, top: 0, reservedTop: 0 }, 'blur restores full height even if WebKit retains stale keyboard geometry');
});
test('browser chrome follows its visible viewport, while pinch zoom does not relayout the app', () => {
  assert.deepEqual(resolveMobileViewport(viewport({ standalone: false, visualHeight: 780 })), { height: 780, top: 0, reservedTop: 0 });
  assert.deepEqual(resolveMobileViewport(viewport({ visualHeight: 456, visualTop: 100, scale: 2 })), { height: 912, top: 0, reservedTop: 0 });
});
