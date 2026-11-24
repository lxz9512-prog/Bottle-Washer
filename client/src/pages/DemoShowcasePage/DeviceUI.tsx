import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Settings, Check, Minus, Plus, X, Clock3, WifiOff, CircleAlert, Droplets, Wind, Waves, ShieldCheck } from 'lucide-react';
import { useDarkMode } from './useDarkMode';
import { useLocale } from './useLocale';
import { cleaningMachineStore } from './cleaning-machine-store';
import { useSyncExternalStore } from 'react';
import { normalizeDuration } from './machine-cycle';
import type { SubModeConfig } from './demo-constants';
import './device-ui.css';
import { getDeviceName, getMachineModel } from './machine-models';
import { needsCleaningReminder } from './machine-maintenance';

export function useDeviceCopy() {
  const { locale, t } = useLocale();
  return { t, copy: (en: string, zh: string) => locale === 'en' ? en : zh };
}

export function useDeviceUnavailable() {
  const { presentation } = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  return ['offline', 'error-df', 'error-af'].includes(presentation);
}

export function DeviceSurface({ children }: { children: ReactNode }) {
  const { darkMode } = useDarkMode();
  const { presentation } = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  return <div className={`bw-device ${darkMode ? 'bw-dark' : ''} ${presentation === 'offline' ? 'bw-disabled' : ''}`}>{children}<DeviceFeedback key={presentation} /></div>;
}

function DeviceFeedback() {
  const { presentation } = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  const { copy } = useDeviceCopy();
  const model = getMachineModel();
  const [panel, setPanel] = useState<'connecting' | 'failed' | 'support' | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (panel !== 'connecting') return;
    const timer = window.setTimeout(() => setPanel('failed'), 1800);
    return () => window.clearTimeout(timer);
  }, [panel]);
  const clear = () => cleaningMachineStore.set({ presentation: 'normal' });
  const reconnect = () => setPanel('connecting');
  if (presentation === 'normal') return null;
  if (presentation.startsWith('error-')) return <div data-screen-overlay className="bw-overlay bw-confirm-overlay"><div className="bw-backdrop" /><section className="bw-confirm" role="dialog" aria-modal="true" aria-label={copy('Error Message', '故障提示')}><h2>{panel === 'support' ? copy('Contact Support', '联系支持') : copy('Error Message', '故障提示')}</h2><p className="bw-sheet-context">{panel === 'support' ? copy(`Please contact customer support through your purchase channel and provide the ${model.name} model and AF error code.`, `请通过购买渠道联系客服，并提供 ${model.name} 型号及 AF 故障代码。`) : `[${presentation === 'error-df' ? 'DF' : 'AF'}] ${copy('An error has occurred with the device. Please check it.', '设备发生故障，请检查设备。')}`}</p><button className="bw-stop" onClick={presentation === 'error-df' || panel === 'support' ? clear : () => setPanel('support')}>{presentation === 'error-df' || panel === 'support' ? copy('OK', '好的') : copy('Contact Us', '联系我们')}</button></section></div>;
  return <>
    {!dismissed && <div className="bw-feedback-banner" role="status">{presentation === 'offline' ? <WifiOff size={16} /> : <CircleAlert size={16} />}<div><p>{presentation === 'offline' ? copy('Device offline. Please reconnect the device.', '设备已离线，请重新连接。') : presentation === 'filter-soon' ? copy('The water softener filter is about to expire. Please replace it promptly.', '软水滤芯即将到期，请及时更换。') : copy('The water softener filter has expired. Please replace it as soon as possible.', '软水滤芯已到期，请尽快更换。')}</p>{presentation === 'offline' && <button onClick={reconnect}>{copy('Reconnect Now', '立即重连')}</button>}</div><button className="bw-dismiss" aria-label={copy('Dismiss notice', '关闭提醒')} onClick={() => setDismissed(true)}><X size={13} /></button></div>}
    {panel && <DeviceSheet title={panel === 'support' ? copy('Contact Support', '联系支持') : copy('Cleaning Machine', '清洗机')} onClose={() => setPanel(null)}>
      {panel === 'support' ? <><p className="bw-support-details">{copy(`Please include the device model ${model.name} and error code when contacting customer support through your purchase channel.`, `请通过购买渠道联系客服，并提供设备型号 ${model.name} 及故障代码。`)}</p><button className="bw-primary" onClick={() => setPanel(null)}>{copy('OK', '好的')}</button></> : <><p className="bw-sheet-context">{copy('Ensure your device is powered on and close to your phone.', '请确保设备已开机，并靠近手机。')}</p>{panel === 'connecting' ? <><img className="bw-connection-product" src={model.image} alt={model.name} /><button className="bw-primary" disabled>{copy('Connecting…', '连接中…')}</button></> : <><h3 className="bw-sheet-context">{copy('Connection Unsuccessful', '连接失败')}</h3><p className="bw-support-details">{copy('Restart the device, turn Bluetooth off and on again, restart the app, and check your internet connection.', '请重启设备、重新开启蓝牙、重启 App，并检查网络连接。')}</p><button className="bw-primary" onClick={() => { clear(); setPanel(null); }}>{copy('Reconnect', '重新连接')}</button><button className="bw-text-button" onClick={() => setPanel('support')}>{copy('Contact Support', '联系支持')}</button></>}</>}
    </DeviceSheet>}
  </>;
}

export function DeviceHeader({ onBack, onSettings, title }: { onBack: () => void; onSettings?: () => void; title?: string }) {
  const { copy } = useDeviceCopy();
  return <header className="bw-header">
    <button className="bw-icon" title={copy('Back', '返回')} aria-label={copy('Back', '返回')} onClick={onBack}><ChevronLeft size={24} /></button>
    <h1>{title ?? getDeviceName()}</h1>
    {onSettings ? <button className="bw-icon" title={copy('Settings', '设备设置')} aria-label={copy('Settings', '设备设置')} onClick={onSettings}><Settings size={24} /></button> : <span />}
  </header>;
}

export function MachineCleaningReminder() {
  const machine = useSyncExternalStore(cleaningMachineStore.subscribe, cleaningMachineStore.getSnapshot);
  const { copy } = useDeviceCopy();
  if (!needsCleaningReminder(machine) || machine.presentation !== 'normal') return null;
  return <div className="bw-feedback-banner bw-cleaning-reminder" role="status" data-cleaning-reminder data-connector="reminder">
    <CircleAlert size={20} aria-hidden="true" />
    <p>{copy(`Used ${machine.completedWorkCount} times. Run Machine Clean to clean your device.`, `已使用${machine.completedWorkCount}次，建议使用机器清洁模式对设备进行一次清洁`)}</p>
    <button className="bw-dismiss" aria-label={copy('Dismiss cleaning reminder', '关闭机器清洁提醒')} onClick={() => cleaningMachineStore.dismissCleaningReminder()}><X size={16} /></button>
  </div>;
}

export function DeviceProduct({ onConsumables }: { onConsumables?: () => void }) {
  const { copy } = useDeviceCopy();
  const model = getMachineModel();
  const supplies = [{ id: 'water', count: 36, max: 60, Icon: Droplets }, { id: 'hepa', count: 216, max: 360, Icon: Wind }].filter(item => (model.consumables as readonly string[]).includes(item.id));
  return <div className={`bw-product ${onConsumables ? 'bw-product-with-supplies' : ''}`}><img src={model.image} alt={model.name} />
    {onConsumables && <button className="bw-supply-bars" onClick={onConsumables} title={copy('Consumables', '耗材管理')} aria-label={copy(`Consumables: ${supplies.map(item => `${item.id === 'water' ? 'water softener' : 'HEPA'} ${item.count}`).join(', ')}`, `耗材管理：${supplies.map(item => `${item.id === 'water' ? '软水滤芯' : 'HEPA'}剩余${item.count}`).join('，')}`)}>{supplies.map(({ id, count, max, Icon }) => <span key={id} className={`bw-supply-bar ${id}`}><strong>{count}</strong><span className="bw-supply-track"><span style={{ height: `${count / max * 100}%` }} /></span><Icon size={16} /></span>)}</button>}
  </div>;
}

export function DeviceSheet({ title, onClose, children, heading, footer, closeRequested = false }: { title: string; onClose: () => void; children: ReactNode; heading?: ReactNode; footer?: ReactNode; closeRequested?: boolean }) {
  const { copy } = useDeviceCopy();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const didDrag = useRef(false);
  const finishClose = useRef(onClose);
  finishClose.current = onClose;
  const dismiss = () => setClosing(true);
  useEffect(() => { if (closeRequested) setClosing(true); }, [closeRequested]);
  useEffect(() => {
    if (!closing) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => finishClose.current(), reducedMotion ? 0 : closeRequested ? 300 : 240);
    return () => window.clearTimeout(timer);
  }, [closing, closeRequested]);
  useLayoutEffect(() => {
    const overlay = overlayRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(overlay.parentElement!.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previousInert = siblings.map(element => element.inert);
    const scroller = overlay.parentElement!.querySelector<HTMLElement>('.bw-scroll');
    const overflow = scroller?.style.overflowY ?? '';
    // Focus an animated sheet without letting the browser scroll the phone or its stage.
    siblings.forEach(element => { element.inert = true; });
    if (scroller) scroller.style.overflowY = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      if (scroller) scroller.style.overflowY = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={overlayRef} data-screen-overlay data-mode-overlay className={`bw-overlay ${closing ? 'bw-sheet-closing' : ''} ${closeRequested ? 'bw-sheet-starting' : ''}`}>
    <button className="bw-backdrop" aria-label={copy('Dismiss', '收起面板')} onClick={dismiss} tabIndex={-1} />
    <section role="dialog" aria-modal="true" aria-label={title} className={`bw-sheet ${dragStart.current !== null ? 'bw-dragging' : ''}`} style={dragY && !closing ? { transform: `translateY(${dragY}px)` } : undefined} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
      }
    }}>
      <button ref={closeRef} className="bw-sheet-handle" aria-label={copy('Collapse panel', '收起浮窗')} onClick={() => { if (!didDrag.current) dismiss(); }} onPointerDown={event => { dragStart.current = event.clientY; didDrag.current = false; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (dragStart.current === null) return; const delta = Math.max(0, event.clientY - dragStart.current); if (delta > 4) didDrag.current = true; setDragY(delta); }} onPointerUp={() => { if (dragY >= 90) dismiss(); dragStart.current = null; setDragY(0); }} onPointerCancel={() => { dragStart.current = null; setDragY(0); }}><span /></button>
      <div className="bw-sheet-content"><div className="bw-sheet-heading">{heading ?? <h2>{title}</h2>}</div>{children}</div>
      {footer && <div className="bw-sheet-footer">{footer}</div>}
    </section>
  </div>;
}

export function StepIcon({ id }: { id: string }) {
  const Icon = id === 'wash' ? Droplets : id === 'sterilize' ? Waves : id === 'dry' ? Wind : ShieldCheck;
  return <Icon size={17} aria-hidden="true" />;
}

export function CustomEditor({ steps, onChange, locked = {}, required = [], durationEditable = () => true, onInvalid }: {
  steps: SubModeConfig[]; onChange: (steps: SubModeConfig[]) => void;
  locked?: Record<string, string>; required?: string[]; durationEditable?: (step: SubModeConfig) => boolean; onInvalid: () => void;
}) {
  const { t, copy } = useDeviceCopy();
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const labels: Record<string, string> = { wash: t('step.wash'), sterilize: t('step.steam'), dry: t('step.dry'), 'keep-warm': t('step.keep.warm') };
  const update = (id: string, patch: Partial<SubModeConfig>) => onChange(steps.map(step => step.id === id ? { ...step, ...patch } : step));
  return <div className="bw-custom-steps">{steps.map(step => <div key={step.id} className={`bw-custom-row ${step.enabled ? 'selected' : ''} ${locked[step.id] ? 'locked' : ''} ${required.includes(step.id) ? 'required' : ''} ${invalidId === step.id ? 'invalid' : ''}`}>
    <button className="bw-step-toggle" role="checkbox" aria-checked={step.enabled} disabled={!!locked[step.id] || required.includes(step.id)} onClick={() => update(step.id, { enabled: !step.enabled })}>
      <span className="bw-check">{step.enabled && <Check size={12} />}</span><StepIcon id={step.id} /><span>{labels[step.id]}</span>
    </button>
    {locked[step.id] ? <span className="bw-step-state">{locked[step.id]}</span> : !durationEditable(step) ? <span className="bw-fixed-duration">{step.duration} {step.unit === 'h' ? 'h' : copy('min', '分钟')}</span> : step.enabled && <div className="bw-stepper">
      <button title={copy('Decrease duration', '减少时长')} aria-label={`${labels[step.id]} ${copy('decrease', '减少')}`} disabled={step.duration <= step.min} onClick={() => update(step.id, { duration: Math.max(step.min, step.duration - step.step) })}><Minus size={14} /></button>
      <input key={`${step.id}:${step.duration}`} aria-label={`${labels[step.id]} ${copy('duration', '时长')}`} type="text" inputMode="numeric" defaultValue={step.duration} onBlur={event => {
        const result = normalizeDuration(event.target.value, step);
        event.target.value = String(result.value);
        update(step.id, { duration: result.value });
        setInvalidId(result.invalid ? step.id : null);
        if (result.invalid) onInvalid();
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      <small>{step.unit}</small>
      <button title={copy('Increase duration', '增加时长')} aria-label={`${labels[step.id]} ${copy('increase', '增加')}`} disabled={step.duration >= step.max} onClick={() => update(step.id, { duration: Math.min(step.max, step.duration + step.step) })}><Plus size={14} /></button>
    </div>}
  </div>)}</div>;
}

export function ScheduleSheet({ modeLabel, scheduledAt, onSave, onDelete, onClose, closeRequested }: {
  modeLabel: string; scheduledAt?: number | null; onSave: (minutes: number) => void; onDelete?: () => void; onClose: () => void; closeRequested?: boolean;
}) {
  const { copy } = useDeviceCopy();
  const [editing, setEditing] = useState(!scheduledAt);
  const [choice, setChoice] = useState<number | 'custom' | null>(null);
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(0);
  const delay = choice === 'custom' ? hours * 60 + minutes : choice ?? 0;
  return <DeviceSheet title={editing ? copy('Delay Start', '定时启动') : copy('Scheduled Start', '预约启动')} onClose={onClose} closeRequested={closeRequested}>
    {editing ? <>
      <p className="bw-sheet-context">{copy(`${modeLabel} will start after the selected time.`, `${modeLabel}将在所选时间后启动。`)}</p>
      <div className="bw-options bw-time-options">{([60, 180, 360, 'custom'] as const).map(value => <button key={value} aria-pressed={choice === value} className={choice === value ? 'selected' : ''} onClick={() => setChoice(value)}>{value === 'custom' ? copy('Custom', '自定义') : `${value / 60}h`}</button>)}</div>
      {choice === 'custom' && <div className="bw-time-picker">
        <select aria-label={copy('Hours', '小时')} value={hours} onChange={event => setHours(Number(event.target.value))}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')} h</option>)}</select><span>:</span>
        <select aria-label={copy('Minutes', '分钟')} value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')} min</option>)}</select>
      </div>}
      <button className="bw-primary" disabled={delay <= 0} onClick={() => onSave(delay)}>{scheduledAt ? copy('Update Schedule', '更新预约') : copy('Confirm Schedule', '确认预约')}</button>
      {scheduledAt && <button className="bw-text-button" onClick={onClose}>{copy('Cancel', '取消')}</button>}
    </> : <>
      <Clock3 className="bw-schedule-symbol" size={42} />
      <p className="bw-sheet-context">{copy(`${modeLabel} will start at`, `${modeLabel}将启动于`)} {new Date(scheduledAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
      <button className="bw-primary" onClick={() => setEditing(true)}>{copy('Change Schedule', '修改预约')}</button>
      <button className="bw-text-button bw-danger" onClick={onDelete}>{copy('Delete Schedule', '删除预约')}</button>
    </>}
  </DeviceSheet>;
}
