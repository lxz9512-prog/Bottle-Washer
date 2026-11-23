import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { entryBase, isApp, resolveEntry } from './runtime';
import NotFound from './pages/NotFound/NotFound';
import DeviceList from './pages/DeviceList/DeviceList';
import MachineRoute from './pages/DemoShowcasePage/MachineRoute';
import NotificationsDemoPage from './pages/NotificationsDemoPage/NotificationsDemoPage';

const ExperienceLayout = isApp ? lazy(() => import('./components/MobileLayout')) : lazy(() => import('./components/Layout'));

const RoutesComponent = () => {
  const location = useLocation();
  const destination = resolveEntry(`#${location.pathname}`, window.matchMedia('(max-width: 768px)').matches);
  const changingExperience = destination.base !== entryBase || (destination.mode === 'app') !== isApp;
  useEffect(() => {
    if (changingExperience) window.location.reload();
  }, [changingExperience]);
  if (changingExperience) return <main role="status" aria-label="正在切换预览版本" />;
  return (
    <Suspense fallback={<main role="status" aria-label="Loading" />}><Routes>
      <Route path={entryBase || '/'} element={<ExperienceLayout />}>
        <Route index element={<DeviceList />} />
        <Route path="cleaning-machine/models/:model/:screen?" element={<MachineRoute />} />
        <Route path="cleaning-machine/:screen?" element={<MachineRoute />} />
        {!isApp && <Route path="notifications" element={<NotificationsDemoPage />} />}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes></Suspense>
  );
};

export default RoutesComponent;
