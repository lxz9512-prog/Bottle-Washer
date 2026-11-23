// The entry is fixed for this document, so modes never share live stores or timers.
export function resolveEntry(hash: string, compact: boolean) {
  const path = hash.replace(/^#/, '').split('?')[0];
  if (/^\/app(?:\/|$)/.test(path)) return { mode: 'app' as const, base: '/app' };
  if (/^\/demo(?:\/|$)/.test(path)) return { mode: 'demo' as const, base: '/demo' };
  if (!path || path === '/') return compact
    ? { mode: 'app' as const, base: '/app' }
    : { mode: 'demo' as const, base: '/demo' };
  return { mode: 'demo' as const, base: '' };
}

export function experienceHash(hash: string, mode: 'app' | 'demo') {
  const route = hash.replace(/^#/, '').replace(/^\/(?:app|demo)(?=\/|\?|$)/, '');
  const [path] = route.split('?');
  const businessRoute = /^\/cleaning-machine(?:\/|$)/.test(path);
  const notifications = mode === 'demo' && path === '/notifications';
  return `#/${mode}${businessRoute || notifications ? route : ''}`;
}

export function switchExperience(mode: 'app' | 'demo') {
  const destination = new URL(window.location.href);
  const current = resolveEntry(destination.hash, window.matchMedia('(max-width: 768px)').matches);
  if (current.mode === mode && current.base === `/${mode}`) return;
  destination.hash = experienceHash(destination.hash, mode);
  if (mode === 'demo') destination.searchParams.set('preview', 'pc');
  else destination.searchParams.delete('preview');
  // Do not notify the current HashRouter about a route from the other experience.
  // The target document initializes its own routes, stores and timers together.
  window.history.pushState(null, '', destination);
  window.location.reload();
}

const compact = window.matchMedia('(max-width: 768px)').matches;
const phone = window.matchMedia('(max-width: 1023px) and (pointer: coarse)').matches;
const url = new URL(window.location.href);
// Shared PC links should not put a second phone frame inside a real phone.
if (phone && url.searchParams.get('preview') !== 'pc' && resolveEntry(url.hash, compact).mode === 'demo') {
  url.hash = experienceHash(url.hash, 'app');
  window.history.replaceState(null, '', url);
}
const entry = resolveEntry(window.location.hash, compact);
export const isApp = entry.mode === 'app';
export const entryBase = entry.base;
export const entryPath = (path = '/') => `${entryBase}${path === '/' ? '' : path}` || '/';

if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${entryPath()}`);
}
document.documentElement.dataset.experience = entry.mode;
const ensureExperience = () => {
  const next = resolveEntry(window.location.hash, window.matchMedia('(max-width: 768px)').matches);
  if (next.mode !== entry.mode || next.base !== entry.base) window.location.reload();
};
window.addEventListener('hashchange', ensureExperience);
window.addEventListener('popstate', ensureExperience);
window.addEventListener('pageshow', event => {
  if (event.persisted) ensureExperience();
});
