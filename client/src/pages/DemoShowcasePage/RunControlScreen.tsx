import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Clock3, Play, Pause, Square, Pencil } from 'lucide-react';
import type { SubModeConfig, ModeConfig } from './demo-constants';
import { DeviceSurface, DeviceHeader, DeviceProduct, DeviceSheet, CustomEditor, ScheduleSheet, useDeviceCopy, useDeviceUnavailable } from './DeviceUI';
import { usePhoneToast } from './usePhoneToast';
import { cleaningMachineStore } from './cleaning-machine-store';
import { cycleSteps, cycleProgress, lockedCycleSteps, isCustomMode, pausedCycleEdits, isRequiredCycleStep } from './machine-cycle';

interface RunControlScreenProps {
  suspended?: boolean;
  isRunning: boolean;
  selectedMode: string | null;
  customConfig?: SubModeConfig[] | null;
  modeConfig?: ModeConfig | null;
  onTogglePause: () => void;
  onBack: () => void;
  onStop: () => void;
  onUpdateCustomConfig?: (config: SubModeConfig[]) => void;
  onSettings?: () => void;
  onConsumables?: () => void;
}

export default function RunControlScreen({ suspended = false, isRunning, selectedMode, customConfig, modeConfig, onTogglePause, onBack, onStop, onUpdateCustomConfig, onSettings, onConsumables }: RunControlScreenProps) {
  const { t, copy } = useDeviceCopy();
  const unavailable = useDeviceUnavailable();
  const { showToast, ToastElement } = usePhoneToast();
  const machine = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  const [showStop, setShowStop] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [draft, setDraft] = useState<SubModeConfig[] | null>(null);
  useEffect(() => {
    if (unavailable) { setShowStop(false); setShowSchedule(false); setDraft(null); }
  }, [unavailable]);
  const steps = cycleSteps(selectedMode, customConfig ?? null);
  const progress = cycleProgress(steps, machine.scheduleAt ? 0 : machine.elapsedSeconds);
  const remainingLabel = progress.remaining > 0 ? t('min.left', { min: Math.ceil(progress.remaining / 60) }) : copy(`${Math.ceil(progress.totalRemaining / 60)} min of storage left`, `保管剩余 ${Math.ceil(progress.totalRemaining / 60)} 分钟`);
  const labels: Record<string, string> = { wash: t('step.wash'), sterilize: t('step.steam'), dry: t('step.dry'), 'keep-warm': t('step.keep.warm') };
  const modeLabels: Record<string, string> = { smart: t('mode.smart'), auto: t('mode.standard'), rapid: t('mode.rapid'), 'self-clean': t('mode.self.clean'), baby: t('mode.breast.pump'), bottles: t('mode.teethers'), 'food-bowl': t('mode.baby.dish'), 'delicate-wash': t('mode.adaptive.material'), custom: t('mode.custom') };
  const modeLabel = modeConfig?.modeLabel ?? modeLabels[selectedMode ?? 'smart'] ?? t('mode.smart');
  const locked = Object.fromEntries(Object.entries(lockedCycleSteps(steps, machine.elapsedSeconds)).map(([id, status]) => [id, status === 'completed' ? t('step.done') : status === 'off' ? t('off') : t('status.in.progress')]));
  const custom = isCustomMode(selectedMode);
  const editableSteps = draft?.filter(step => custom || cycleSteps(selectedMode, null).find(item => item.id === step.id)?.enabled);
  useEffect(() => {
    if (progress.complete && machine.cycleActive && machine.isRunning) cleaningMachineStore.set({ isRunning: false, runStartedAt: null });
  }, [progress.complete, machine.cycleActive, machine.isRunning]);
  const removeSchedule = () => { setShowSchedule(false); onStop(); };
  return <DeviceSurface>
    {ToastElement}
    <DeviceHeader onBack={onBack} onSettings={onSettings} />
    <div className="bw-scroll" data-connector="content">
      <DeviceProduct onConsumables={onConsumables} />
      <div className="bw-run-time"><Clock3 size={11} />{machine.scheduleAt ? copy('Scheduled', '等待启动') : progress.complete ? t('step.done') : !isRunning ? t('status.paused') : remainingLabel}</div>
      <div className="bw-progress" aria-busy={suspended}>
        <header className="bw-progress-heading">
          <h2 className="bw-run-title">{machine.scheduleAt ? copy(`${modeLabel} scheduled to start at`, `${modeLabel}预约启动于`) : modeLabel}{machine.scheduleAt && ` ${new Date(machine.scheduleAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`}</h2>
        </header>
        {suspended ? <div className="bw-loading">{steps.map(step => <div key={step.id} className="bw-skeleton-line" />)}</div> : steps.map((step, index) => {
          const status = machine.scheduleAt ? step.enabled ? 'pending' : 'off' : progress.statuses[index].status;
          const remaining = Math.ceil(progress.statuses[index].remaining);
          const value = status === 'completed' ? t('step.done') : status === 'off' ? t('off') : status === 'active' && step.unit !== 'h' ? `${Math.ceil(remaining / 60)}min` : `${step.duration}${step.unit === 'h' ? 'h' : 'min'}`;
          return <div key={step.id} className={`bw-progress-row ${status}`}><span className="bw-progress-dot">{status === 'completed' && <Check size={11} />}</span><span>{labels[step.id]}</span><span>{value}</span></div>;
        })}
        {!isRunning && !machine.scheduleAt && !progress.complete && <button disabled={unavailable} className="bw-progress-edit" onClick={() => setDraft(steps.map(step => ({ ...step })))}><Pencil size={14} />{copy('Edit', '编辑')}</button>}
      </div>
    </div>
    <div className="bw-dock" inert={showStop || showSchedule || !!draft || unavailable}>
      <button className={`bw-icon ${machine.scheduleAt ? 'is-scheduled' : ''}`} aria-label={machine.scheduleAt ? copy('Manage schedule', '管理预约') : t('stop')} title={machine.scheduleAt ? copy('Manage schedule', '管理预约') : t('stop')} onClick={() => machine.scheduleAt ? setShowSchedule(true) : setShowStop(true)}>{machine.scheduleAt ? <Clock3 size={19} /> : <Square size={13} fill="currentColor" />}</button>
      <button className="bw-primary" data-connector="action" aria-label={machine.scheduleAt ? copy('Cancel Schedule', '取消预约') : '暂停或继续清洗'} onClick={machine.scheduleAt ? removeSchedule : progress.complete ? onStop : onTogglePause}>
        {!machine.scheduleAt && (isRunning && !progress.complete ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />)}
        {machine.scheduleAt ? copy('Cancel Schedule', '取消预约') : progress.complete ? copy('Done', '完成') : isRunning ? t('pause') : t('continue')}
      </button>
    </div>
    {showStop && <div data-screen-overlay className="bw-overlay bw-confirm-overlay"><button className="bw-backdrop" aria-label={t('cancel')} onClick={() => setShowStop(false)} /><section className="bw-confirm" role="dialog" aria-modal="true" aria-label={t('stop')}><h2>{copy('Washing unfinished. Confirm stop?', '清洗尚未完成，确认停止？')}</h2><button className="bw-stop" onClick={onStop}>{t('stop')}</button><button onClick={() => setShowStop(false)}>{t('cancel')}</button></section></div>}
    {draft && <DeviceSheet title={modeLabel} onClose={() => setDraft(null)}><CustomEditor steps={editableSteps!} onChange={next => setDraft(draft.map(step => next.find(item => item.id === step.id) ?? step))} locked={locked} required={steps.filter(step => isRequiredCycleStep(selectedMode, step.id)).map(step => step.id)} durationEditable={step => custom || step.id === 'keep-warm'} onInvalid={() => showToast(copy('Value out of range. Retry.', '数值超出范围，请重试。'))} /><button className="bw-primary" onClick={() => { onUpdateCustomConfig?.(pausedCycleEdits(selectedMode, steps, draft, machine.elapsedSeconds)); setDraft(null); }}>{copy('Done', '完成')}</button></DeviceSheet>}
    {showSchedule && <ScheduleSheet modeLabel={modeLabel} scheduledAt={machine.scheduleAt} onClose={() => setShowSchedule(false)} onDelete={removeSchedule} onSave={minutes => { cleaningMachineStore.set({ scheduleAt: Date.now() + minutes * 60000 }); setShowSchedule(false); showToast(copy('Schedule updated', '预约已更新')); }} />}
  </DeviceSurface>;
}
