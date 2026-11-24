import { useEffect, useRef, useSyncExternalStore } from 'react';
import { type ModeConfig, type SubModeConfig } from './demo-constants';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { entryPath, isApp } from '../../runtime';
import IPhoneFrame from '../../components/IPhoneFrame';
import HomeScreen from './HomeScreen';
import RunControlScreen from './RunControlScreen';
import CustomModeScreen from './CustomModeScreen';
import SmartModeScreen from './SmartModeScreen';
import SettingsScreen from './SettingsScreen';
import DeviceInfoScreen from './DeviceInfoScreen';
import BabyItemsScreen from './BabyItemsScreen';
import OtherSettingsScreen from './OtherSettingsScreen';
import { cleaningMachineStore } from './cleaning-machine-store';
import { useDarkMode } from './useDarkMode';
import { OperationState, useDemo, useDemoPage, useOperation } from '../../demo/react';
import { demoEngine } from '../../demo/engine';
import ConsumablesScreen from './ConsumablesScreen';
import { loadModePreferences, saveModePreferences } from './mode-preferences';
import { machinePath, supportsMode } from './machine-models';

export default function DemoShowcasePage() {
  const navigate = useNavigate();
  const { darkMode } = useDarkMode();
  const machine = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  const { selectedMode, isRunning, customConfig, lastUsedMode, modeConfig } = machine;
  const { screen: routeScreen } = useParams();
  const location = useLocation();
  const validScreens = ['home', 'custom-mode', 'smart-mode', 'run-control', 'settings', 'other-settings', 'device-info', 'baby-items', 'consumables'];
  const requested = routeScreen && validScreens.includes(routeScreen) ? routeScreen : isApp ? 'home' : machine.activeScreen;
  const requestedScreen = requested === 'smart-mode' && !supportsMode('smart') ? 'home' : requested;
  const controlScreen = selectedMode === 'smart' ? 'smart-mode' : 'run-control';
  const activeScreen = (machine.cycleActive || machine.scheduleAt) && ['home', 'device-control', 'custom-mode'].includes(requestedScreen) ? controlScreen : requestedScreen;
  const consumablesFrom = useRef('home');
  const { active } = useDemo();
  const setScreen = (screen: string) => {
    cleaningMachineStore.set({ activeScreen: screen });
    navigate(machinePath(screen));
  };
  const returnTo = (screen: string) => {
    if (isApp && location.state?.fromScreen === screen) navigate(-1);
    else setScreen(screen);
  };
  const openScreen = (screen: string) => {
    if (screen === 'consumables') consumablesFrom.current = activeScreen;
    cleaningMachineStore.set({ activeScreen: screen });
    navigate(machinePath(screen), { state: { fromScreen: activeScreen } });
  };
  useEffect(() => {
    if (machine.activeScreen !== activeScreen) cleaningMachineStore.set({ activeScreen });
  }, [activeScreen]);
  useDemoPage(activeScreen === 'device-control' ? 'home' : activeScreen);
  useEffect(() => {
    if (isApp) return;
    const change = (event: Event) => setScreen((event as CustomEvent<string>).detail);
    window.addEventListener('bw05s:navigate', change);
    return () => window.removeEventListener('bw05s:navigate', change);
  }, []);
  const commitStart = (config: ModeConfig, delay?: number) => {
    if (!supportsMode(config.modeId)) return;
    cleaningMachineStore.set({ selectedMode: config.modeId, modeConfig: config, customConfig: config.customSteps ?? null,
      lastUsedMode: config.modeId, lastUsedAt: delay ? machine.lastUsedAt : Date.now(), isRunning: !delay, standby: false, cycleActive: !delay,
      scheduleAt: delay ? Date.now() + delay * 60000 : null, elapsedSeconds: 0, runStartedAt: delay ? null : Date.now(),
      activeScreen: config.modeId === 'smart' ? 'smart-mode' : 'run-control' });
    navigate(machinePath(config.modeId === 'smart' ? 'smart-mode' : 'run-control'), { replace: true });
  };
  const control = useOperation({ operation: 'running.control', stage: 'running', label: '运行控制', success: () => {
    const state = cleaningMachineStore.get();
    cleaningMachineStore.set({ isRunning: !state.isRunning, cycleActive: true, runStartedAt: state.isRunning ? null : Date.now() });
  } });
  const stop = () => {
    demoEngine.normal();
    cleaningMachineStore.set({ activeScreen: 'home', selectedMode: null, modeConfig: null, customConfig: null,
      isRunning: false, cycleActive: false, scheduleAt: null, runStartedAt: null, elapsedSeconds: 0, standby: false });
    navigate(machinePath(), { replace: true });
  };
  const back = () => { demoEngine.normal(); navigate(entryPath()); };
  const homeProps = { onNavigate: (config: ModeConfig) => commitStart(config), onSchedule: (config: ModeConfig, minutes: number) => commitStart(config, minutes),
    selectedMode, onSelectMode: (id: string | null) => cleaningMachineStore.set({ selectedMode: id }), lastUsedMode, onSettings: () => openScreen('settings'), onConsumables: () => openScreen('consumables') };
  const updateCycleConfig = (config: SubModeConfig[]) => {
    cleaningMachineStore.set({ customConfig: config, modeConfig: modeConfig ? { ...modeConfig, customSteps: config } : null });
    if (selectedMode) { const preferences = loadModePreferences(); saveModePreferences({ ...preferences, steps: { ...preferences.steps, [selectedMode]: config } }); }
  };
  const runningProps = { isRunning, suspended: !!active, modeConfig, customConfig, onTogglePause: control, onBack: back, onStop: stop, onUpdateCustomConfig: updateCycleConfig, onSettings: () => openScreen('settings'), onConsumables: () => openScreen('consumables') };
  let screen;
  switch (activeScreen) {
    case 'home': case 'device-control': screen = <HomeScreen {...homeProps} />; break;
    case 'custom-mode': screen = <CustomModeScreen {...homeProps} />; break;
    case 'smart-mode': screen = <SmartModeScreen {...runningProps} />; break;
    case 'run-control': screen = <RunControlScreen {...runningProps} selectedMode={selectedMode} />; break;
    case 'settings': screen = <SettingsScreen onBack={() => returnTo(machine.scheduleAt || machine.cycleActive ? controlScreen : 'home')} onBabyItems={() => openScreen('baby-items')} onDeviceInfo={() => openScreen('device-info')} onOtherSettings={() => openScreen('other-settings')} onConsumables={() => openScreen('consumables')} />; break;
    case 'consumables': screen = <ConsumablesScreen onBack={() => returnTo(location.state?.fromScreen ?? consumablesFrom.current)} />; break;
    case 'other-settings': screen = <OtherSettingsScreen onBack={() => returnTo('settings')} />; break;
    case 'device-info': screen = <DeviceInfoScreen onBack={() => returnTo('settings')} />; break;
    case 'baby-items': screen = <BabyItemsScreen onBack={() => returnTo('settings')} />; break;
    default: screen = null;
  }
  const hasDeviceBackground = ['home', 'device-control', 'custom-mode', 'run-control', 'smart-mode'].includes(activeScreen);
  const hasManagedSafeArea = hasDeviceBackground || ['settings', 'consumables'].includes(activeScreen);
  const background = darkMode ? '#121212' : hasDeviceBackground ? 'linear-gradient(180deg,#cce2ff 0%,#edf3fa 25%,#f9f7f5 46%,#f9f7f5 100%)' : '#F5F5F5';
  return <IPhoneFrame statusBarColor={darkMode ? '#FFFFFF' : '#000000'} background={background}>
    <div className="relative h-full flex flex-col" data-mobile-safe-area={hasManagedSafeArea ? 'device' : undefined}>
      {['home', 'custom-mode', 'run-control', 'smart-mode'].includes(activeScreen) && <OperationState operation={['home', 'custom-mode'].includes(activeScreen) ? 'cleaning.start' : 'running.control'} />}
      <div className={`app-page-body flex-1 min-h-0 ${['run-control', 'smart-mode'].includes(activeScreen) ? 'bw-running-state' : ''}`} style={{ paddingBottom: hasManagedSafeArea ? 0 : 32 }}>{screen}</div>
    </div>
  </IPhoneFrame>;
}
