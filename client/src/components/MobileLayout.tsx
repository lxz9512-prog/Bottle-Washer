import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useMachineClock } from '../pages/DemoShowcasePage/useMachineClock';
import { useDarkMode } from '../pages/DemoShowcasePage/useDarkMode';
import { useLocale } from '../pages/DemoShowcasePage/useLocale';
import { RouteBoundary } from '../demo/react';
import './mobile.css';
import './preview.css';
import { resolveMobileViewport } from './mobile-viewport';

export default function MobileLayout() {
  useMachineClock();
  const { darkMode } = useDarkMode();
  const { locale } = useLocale();
  const safeAreaProbe = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode, locale]);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const root = document.documentElement;
    let frame = 0;
    let reservedTop = 0;
    const update = () => {
      const standalone = displayMode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const editing = document.activeElement instanceof HTMLElement && (
        document.activeElement.isContentEditable || document.activeElement.matches('textarea, input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit])')
      );
      const geometry = resolveMobileViewport({
        layoutHeight: window.innerHeight, layoutWidth: window.innerWidth,
        visualHeight: viewport?.height ?? window.innerHeight, visualTop: viewport?.offsetTop ?? 0,
        scale: viewport?.scale ?? 1, standalone, editing,
        screenHeight: window.screen.height, screenWidth: window.screen.width,
        nativeSafeTop: safeAreaProbe.current?.getBoundingClientRect().height ?? 0,
        previousReservedTop: reservedTop,
      });
      reservedTop = geometry.reservedTop;
      root.dataset.appDisplay = standalone ? 'standalone' : 'browser';
      root.style.setProperty('--app-height', `${geometry.height}px`);
      root.style.setProperty('--app-top', `${geometry.top}px`);
      root.style.setProperty('--app-reserved-top', `${reservedTop}px`);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);
    displayMode.addEventListener('change', scheduleUpdate);
    for (const event of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(event, scheduleUpdate);
    for (const event of ['focusin', 'focusout', 'visibilitychange']) document.addEventListener(event, scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      displayMode.removeEventListener('change', scheduleUpdate);
      for (const event of ['resize', 'orientationchange', 'pageshow']) window.removeEventListener(event, scheduleUpdate);
      for (const event of ['focusin', 'focusout', 'visibilitychange']) document.removeEventListener(event, scheduleUpdate);
      delete root.dataset.appDisplay;
      for (const property of ['--app-height', '--app-top', '--app-reserved-top']) root.style.removeProperty(property);
    };
  }, []);
  return <div className="mobile-preview">
    <div ref={safeAreaProbe} className="app-safe-area-probe" aria-hidden="true" />
    <div className="mobile-preview-stage"><main className={`mobile-app ${darkMode ? 'app-dark' : ''}`}><RouteBoundary><Outlet /></RouteBoundary></main></div>
  </div>;
}
