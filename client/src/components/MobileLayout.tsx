import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useMachineClock } from '../pages/DemoShowcasePage/useMachineClock';
import { useDarkMode } from '../pages/DemoShowcasePage/useDarkMode';
import { useLocale } from '../pages/DemoShowcasePage/useLocale';
import { RouteBoundary } from '../demo/react';
import './mobile.css';
import './preview.css';

export default function MobileLayout() {
  useMachineClock();
  const { darkMode } = useDarkMode();
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#121212' : '#edf3fa');
  }, [darkMode, locale]);
  useEffect(() => {
    // VisualViewport also follows iOS keyboard resizing and browser chrome changes.
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return <div className="mobile-preview">
    <div className="mobile-preview-stage"><main className={`mobile-app ${darkMode ? 'app-dark' : ''}`}><RouteBoundary><Outlet /></RouteBoundary></main></div>
  </div>;
}
