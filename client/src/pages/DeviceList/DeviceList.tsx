import React, { useRef, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ChevronRight, LoaderCircle, Pause, Play, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IPhoneFrame from "@client/src/components/IPhoneFrame";
import { cleaningMachineStore } from "../DemoShowcasePage/cleaning-machine-store";
import type { CleaningMachineState } from "../DemoShowcasePage/cleaning-machine-store";
import { OperationState, useDemo, useDemoPage, useOperation } from '../../demo/react';
import { cycleMinutes, cycleProgress, cycleSteps } from '../DemoShowcasePage/machine-cycle';
import { useDeviceCopy } from '../DemoShowcasePage/DeviceUI';
import monitorPreview from '../../assets/monitor-preview.jpg';
import monitorCamera from '../../assets/mobile-home/monitor-camera.png';
import tabHome from '../../assets/mobile-home/tab-home.png';
import tabDevice from '../../assets/mobile-home/tab-device.png';
import tabCommunity from '../../assets/mobile-home/tab-community.png';
import tabMe from '../../assets/mobile-home/tab-me.png';
import './device-home.css';
import { MACHINE_MODELS, getDeviceName, machinePath, type MachineModelId } from '../DemoShowcasePage/machine-models';
import { demoEngine } from '../../demo/engine';

const hasRunningCycle = (state: CleaningMachineState) => state.cycleActive && !state.scheduleAt
  && !cycleProgress(cycleSteps(state.selectedMode, state.customConfig), state.elapsedSeconds).complete;
const controlUnavailable = (state: CleaningMachineState) => ['offline', 'error-df', 'error-af'].includes(state.presentation);

const DeviceList: React.FC = () => {
  useDemoPage('devices');
  useOperation({ operation: 'devices.load', stage: 'devices', label: '查找设备', success: () => {} });
  const { active } = useDemo();
  const { copy } = useDeviceCopy();
  const navigate = useNavigate();
  const machines = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getAllSnapshot);
  const controlTarget = useRef<MachineModelId | null>(null);
  const getControlTarget = () => controlTarget.current ?? MACHINE_MODELS.find(model => hasRunningCycle(cleaningMachineStore.get(model.id)))?.id;
  const control = useOperation({
    operation: 'running.control', stage: 'running', label: '设备列表运行控制',
    ready: () => {
      const id = getControlTarget();
      return !!id && hasRunningCycle(cleaningMachineStore.get(id)) && !controlUnavailable(cleaningMachineStore.get(id));
    },
    success: () => {
      const id = getControlTarget();
      if (!id) return;
      const state = cleaningMachineStore.get(id);
      if (!hasRunningCycle(state) || controlUnavailable(state)) return;
      cleaningMachineStore.set({ isRunning: !state.isRunning, runStartedAt: state.isRunning ? null : Date.now() }, id);
    },
  });
  const toggleDevice = (id: MachineModelId) => {
    const request = demoEngine.getSnapshot().active;
    if (request?.status === 'loading') return;
    if (request?.request.operation === 'running.control' && controlTarget.current !== id) demoEngine.normal();
    controlTarget.current = id;
    cleaningMachineStore.selectModel(id);
    control();
  };
  const deviceStatus = (machineState: CleaningMachineState) => {
    const isDeviceActive = machineState.cycleActive || !!machineState.scheduleAt;
    const steps = cycleSteps(machineState.selectedMode, machineState.customConfig);
    const progress = cycleProgress(steps, machineState.elapsedSeconds);
    const remainingLabel = progress.remaining > 0 ? `${Math.ceil(progress.remaining / 60)} min left` : '';
    const storing = progress.remaining <= 0 && !progress.complete && progress.totalRemaining > 0;
    const storageRemainingLabel = progress.totalRemaining < 3600
      ? `${Math.ceil(progress.totalRemaining / 60)} min left`
      : `${Math.ceil(progress.totalRemaining / 3600)} h left`;
    const formatTime = (date: Date) => date.toLocaleString([], {
      ...(date.toDateString() === new Date().toDateString() ? {} : { month: 'short' as const, day: 'numeric' as const }),
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const lastUsed = machineState.lastUsedAt ? new Date(machineState.lastUsedAt) : null;
    const scheduledCompletion = machineState.scheduleAt
      ? formatTime(new Date(machineState.scheduleAt + cycleMinutes(steps) * 60000))
      : '';
    const statusText = machineState.scheduleAt
      ? copy(`Finishes at ${scheduledCompletion}`, `预计完成 ${scheduledCompletion}`)
      : isDeviceActive
        ? (progress.complete ? 'Done' : storing && machineState.isRunning ? '保管中' : machineState.isRunning ? remainingLabel : 'Paused')
        : lastUsed ? `Last used · ${formatTime(lastUsed)}` : 'Not used yet';
    const statusColor = isDeviceActive
      ? (machineState.isRunning || machineState.scheduleAt ? '#287dcc' : '#b56c15')
      : '#9E9E9E';
    const statusDetail = !machineState.scheduleAt && storing && machineState.isRunning ? storageRemainingLabel : '';
    return { isDeviceActive, statusText, statusColor, statusDetail };
  };

  return (
    <IPhoneFrame background="#fcf9f7">
      <div className="device-home">
        {active?.request.operation === 'running.control' && <div className="device-control-feedback"><OperationState operation="running.control" /></div>}
        <header className="home-header">
          <h1>Clara's Family</h1>
          <motion.button type="button" aria-label="添加设备" whileTap={{ scale: 0.95 }} className="home-add">
            <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
          </motion.button>
        </header>

        <section className="home-content" aria-label="设备列表">
          {active?.request.operation === 'devices.load' ? <OperationState operation="devices.load" replace /> : <>
          <div className="home-card monitor-card">
            <div className="monitor-heading">
              <img className="monitor-icon" src={monitorCamera} alt="Camera" />
              <div className="monitor-meta">
                <p className="monitor-title">Clara's Baby Monitor 01</p>
                <div className="monitor-battery">
                    <svg width="16" height="10" viewBox="0 0 24 14" fill="none">
                      <rect x="0.5" y="0.5" width="20" height="13" rx="2.5" stroke="#7042d8" strokeWidth="1.5" />
                      <rect x="2" y="2" width="15" height="10" rx="1.5" fill="#7042d8" />
                      <path d="M22 5v4a2 2 0 000-4z" fill="#7042d8" fillOpacity="0.5" />
                    </svg>
                    <span>80%</span>
                </div>
              </div>
              <ChevronRight size={20} aria-hidden="true" />
            </div>
            <div className="monitor-preview-frame">
              <img src={monitorPreview} alt="Baby Monitor" className="monitor-preview" />
            </div>
          </div>

          {MACHINE_MODELS.map(model => {
            const machineState = machines[model.id];
            const { isDeviceActive, statusText, statusColor, statusDetail } = deviceStatus(machineState);
            const showControl = hasRunningCycle(machineState);
            const pending = active?.request.operation === 'running.control' && active.status === 'loading' && getControlTarget() === model.id;
            const controlLabel = `${machineState.isRunning ? copy('Pause', '暂停') : copy('Resume', '启动')} ${getDeviceName(model.id)}`;
            return <div
            key={model.id}
            data-model={model.id}
            data-connector="device"
            className={`home-card device-card ${showControl ? 'has-control' : ''}`}
          >
            <motion.button
            type="button"
            className="device-card-open"
            aria-label={copy(`Open ${getDeviceName(model.id)}`, `打开 ${getDeviceName(model.id)}`)}
            whileTap={{ scale: 0.98 }}
            onClick={() => { const screen = isDeviceActive ? machineState.selectedMode === 'smart' ? 'smart-mode' : 'run-control' : 'home'; cleaningMachineStore.set({ activeScreen: screen }, model.id); navigate(machinePath(screen, model.id)); }}
          >
            <span className="device-image">
              <img src={model.image} alt={model.name} />
            </span>
            <span className="device-meta">
              <span className="device-heading">
                <span className="device-title">{getDeviceName(model.id)}</span>
                {!showControl && <ChevronRight size={20} aria-hidden="true" />}
              </span>
              <span className="device-status">
                <span className="device-status-dot" style={{ backgroundColor: statusColor }} />
                <span style={{ color: statusColor }}>{statusText}</span>
                {isDeviceActive && statusDetail && <span className="device-mode">· {statusDetail}</span>}
              </span>
            </span>
            </motion.button>
            {showControl && <motion.button type="button" className="device-quick-control" data-device-control={model.id}
              aria-label={controlLabel} title={controlLabel} aria-busy={pending}
              disabled={active?.status === 'loading' || controlUnavailable(machineState)}
              whileTap={{ scale: 0.92 }} onClick={() => toggleDevice(model.id)}>
              {pending ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : machineState.isRunning ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
            </motion.button>}
          </div>;
          })}
          </>}
        </section>

        <nav className="home-tabs" aria-label="底部导航">
          {[
            { id: 'home', icon: tabHome, label: 'Home' },
            { id: 'device', icon: tabDevice, label: 'Device' },
            { id: 'community', icon: tabCommunity, label: 'Community' },
            { id: 'me', icon: tabMe, label: 'Me' },
          ].map(tab => (
            <button type="button" key={tab.id} className="home-tab" aria-current={tab.id === 'device' ? 'page' : undefined}>
              <img className="home-tab-icon" src={tab.icon} alt="" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </IPhoneFrame>
  );
};

export default DeviceList;
