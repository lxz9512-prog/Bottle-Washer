import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Clock3, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { ModeIcon } from './ModeIcon';
import { type ModeConfig, type SubModeConfig } from './demo-constants';
import { DeviceSurface, DeviceHeader, DeviceProduct, DeviceSheet, MachineCleaningReminder, CustomEditor, ScheduleSheet, StepIcon, useDeviceCopy, useDeviceUnavailable } from './DeviceUI';
import { usePhoneToast } from './usePhoneToast';
import { useOperation } from '../../demo/react';
import { entryPath } from '../../runtime';
import { cycleMinutes, cycleSteps, isCustomMode, isRequiredCycleStep } from './machine-cycle';
import { loadModePreferences, saveModePreferences } from './mode-preferences';
import { supportsMode } from './machine-models';

interface HomeScreenProps {
  onNavigate: (config: ModeConfig) => void;
  selectedMode: string | null;
  onSelectMode: (modeId: string | null) => void;
  lastUsedMode: string | null;
  onSettings?: () => void;
  onConsumables?: () => void;
  onSchedule: (config: ModeConfig, minutes: number) => void;
  initialCustom?: boolean;
}

export default function HomeScreen({ onNavigate, selectedMode, onSelectMode, lastUsedMode, onSettings, onConsumables, onSchedule, initialCustom = false }: HomeScreenProps) {
  const navigate = useNavigate();
  const { t, copy } = useDeviceCopy();
  const unavailable = useDeviceUnavailable();
  const { showToast, ToastElement } = usePhoneToast();
  const [preferences, setPreferences] = useState(loadModePreferences);
  const [sheet, setSheet] = useState<'options' | 'schedule' | null>(initialCustom ? 'options' : null);
  const [option, setOption] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [switchDirection, setSwitchDirection] = useState(1);
  const pendingStart = useRef<(() => void) | null>(null);
  useEffect(() => { if (initialCustom) onSelectMode('custom'); }, [initialCustom]);
  useEffect(() => { if (unavailable) { setSheet(null); setClosing(false); pendingStart.current = null; } }, [unavailable]);
  useEffect(() => saveModePreferences(preferences), [preferences]);
  const defaults: Record<string, string> = {
    smart: t('mode.smart'), auto: t('mode.standard'), rapid: t('mode.rapid'), intensive: copy('Intensive Wash', '强力洗'), 'self-clean': copy('Machine Clean', '机器清洁'),
    'sterilize-dry': copy('Sterilize & Dry', '消毒&烘干'), baby: t('mode.breast.pump'), bottles: t('mode.teethers'),
    'food-bowl': t('mode.baby.dish'), 'delicate-wash': t('mode.adaptive.material'), custom: t('mode.custom'),
    'custom-2': copy('Custom 2', '自定义2'), 'custom-3': copy('Custom 3', '自定义3'),
  };
  const name = (id: string) => isCustomMode(id) ? preferences.names[id]?.trim() || defaults[id] : defaults[id];
  const rename = (id: string, value: string) => {
    if (isCustomMode(id)) setPreferences(current => ({ ...current, names: { ...current.names, [id]: value } }));
  };
  const nameInput = (id: string) => <div className="bw-mode-name-field"><input disabled={unavailable} className="bw-mode-name" aria-label={`${defaults[id]} ${copy('name', '名称')}`} maxLength={24} value={preferences.names[id] ?? defaults[id]} onChange={event => rename(id, event.target.value)} onBlur={event => { rename(id, event.target.value.trim() || defaults[id]); event.currentTarget.scrollLeft = 0; }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); event.currentTarget.blur(); } }} /></div>;
  const stepsFor = (id: string) => cycleSteps(id, preferences.steps[id] ?? null);
  const steps = selectedMode ? stepsFor(selectedMode) : [];
  const updateSteps = (next: SubModeConfig[]) => setPreferences(current => ({ ...current, steps: { ...current.steps, [selectedMode!]: next } }));
  const groups = [
    { title: t('group.recommended'), modes: ['smart'] },
    { title: t('group.daily'), modes: ['auto', 'rapid', 'intensive', 'sterilize-dry', 'self-clean'] },
    { title: t('group.delicate'), modes: ['baby', 'bottles', 'food-bowl', 'delicate-wash'] },
    { title: t('group.custom'), modes: preferences.customIds },
  ].map(group => ({ ...group, custom: group.modes === preferences.customIds, modes: group.modes.filter(id => supportsMode(id)) })).filter(group => group.modes.length > 0);
  const needsOptions = ['baby', 'bottles', 'food-bowl', 'delicate-wash'].includes(selectedMode ?? '');
  const options = selectedMode === 'baby' ? ['1', '2'] : selectedMode === 'bottles' ? ['1-5', '6-10', '11-15'] : selectedMode === 'food-bowl' ? ['1', '1+'] : ['Plastic', 'Silicone', 'Glass'];
  const optionLabel = (value: string) => selectedMode === 'food-bowl'
    ? value === '1' ? copy('1 set', '1套') : copy('More than 1 set', '1套以上')
    : value === 'Plastic' ? copy('Plastic', '塑料') : value === 'Silicone' ? copy('Silicone', '硅胶') : value === 'Glass' ? copy('Glass', '玻璃') : value;
  const ready = supportsMode(selectedMode) && cycleMinutes(steps) > 0 && (!needsOptions || !!option);
  const config = (): ModeConfig => ({ modeId: selectedMode!, modeLabel: name(selectedMode!), customSteps: steps,
    ...(selectedMode === 'baby' ? { breastPumpSets: Number(option) } : {}),
    ...(selectedMode === 'bottles' ? { teetherRange: option! } : {}),
    ...(selectedMode === 'food-bowl' ? { babyDishCount: option! } : {}),
    ...(selectedMode === 'delicate-wash' ? { materialType: option! } : {}),
  });
  const animateStart = (minutes?: number) => { const savedConfig = config(); pendingStart.current = () => minutes ? onSchedule(savedConfig, minutes) : onNavigate(savedConfig); setClosing(true); };
  const start = useOperation({ operation: 'cleaning.start', stage: 'cleaning', label: '启动清洗', ready: () => ready, edit: () => {}, success: () => animateStart() });
  const select = (id: string) => { if (!supportsMode(id)) return; onSelectMode(id); setOption(null); setClosing(false); setSheet('options'); };
  const modes = groups.flatMap(group => group.modes);
  const switchMode = (direction: number) => { setSwitchDirection(direction); select(modes[(modes.indexOf(selectedMode!) + direction + modes.length) % modes.length]); };
  const close = () => { setSheet(null); setClosing(false); const pending = pendingStart.current; pendingStart.current = null; pending?.(); };
  const storage = steps.find(step => step.id === 'keep-warm');
  const cleaning = steps.filter(step => step.id !== 'keep-warm');
  const custom = isCustomMode(selectedMode);
  const stepLabels: Record<string, string> = { wash: t('step.wash'), sterilize: t('step.steam'), dry: t('step.dry') };
  return <DeviceSurface>
    {ToastElement}
    <DeviceHeader onBack={() => navigate(entryPath())} onSettings={onSettings} />
    <MachineCleaningReminder />
    <div className="bw-scroll" data-connector="content">
      <DeviceProduct onConsumables={onConsumables} />
      {groups.map(group => <section className="bw-mode-group" key={group.title}><h2>{group.title}</h2><div className="bw-mode-grid">
        {group.modes.map(id => <div key={id} data-mode={id} className={`bw-mode-card ${sheet && selectedMode === id ? 'selected' : ''}`}>
          <button disabled={unavailable} className="bw-mode-open" aria-label={name(id)} aria-haspopup="dialog" aria-expanded={!!sheet && selectedMode === id} onClick={() => select(id)}><ModeIcon mode={id} /><span className="bw-card-name">{name(id)}</span><span className="bw-card-duration">{id === 'smart' ? copy('Auto-adjusts', '自动调节') : copy(`${cycleMinutes(stepsFor(id))} min`, `${cycleMinutes(stepsFor(id))} 分钟`)}</span></button>
          {lastUsedMode === id && <span className="bw-recent">{copy('Recent', '最近')}</span>}
        </div>)}
        {group.custom && preferences.customIds.length < 3 && <button className="bw-add-mode" aria-label={copy('Add custom mode', '添加自定义模式')} disabled={unavailable} onClick={() => { const id = ['custom-2', 'custom-3'].find(value => !preferences.customIds.includes(value))!; setPreferences(current => ({ ...current, customIds: [...current.customIds, id] })); select(id); }}><Plus size={22} /></button>}
      </div></section>)}
    </div>
    {sheet === 'options' && selectedMode && <DeviceSheet title={name(selectedMode)} heading={<div className="bw-mode-switch" data-mode-id={selectedMode}>
      <button className="bw-icon" title={copy('Previous mode', '上一个模式')} aria-label={copy('Previous mode', '上一个模式')} disabled={closing || unavailable} onClick={() => switchMode(-1)}><ChevronLeft size={22} /></button>
      <div className={`bw-mode-switch-title bw-mode-enter ${switchDirection < 0 ? 'bw-mode-enter-previous' : ''}`} key={selectedMode}>{custom ? nameInput(selectedMode) : <h2>{name(selectedMode)}</h2>}</div>
      <button className="bw-icon" title={copy('Next mode', '下一个模式')} aria-label={copy('Next mode', '下一个模式')} disabled={closing || unavailable} onClick={() => switchMode(1)}><ChevronRight size={22} /></button>
    </div>} onClose={close} closeRequested={closing} footer={<><button className="bw-secondary" disabled={!ready || closing} onClick={() => setSheet('schedule')}><Clock3 size={17} />{copy('Delay Start', '定时启动')}</button><button className="bw-primary" aria-label="开始清洗" disabled={!ready || closing || unavailable} onClick={start}><Play size={16} fill="currentColor" />{copy('Start', '启动')}</button></>}>
      <div key={selectedMode} className={`bw-mode-enter ${switchDirection < 0 ? 'bw-mode-enter-previous' : ''}`}>
      <p className="bw-cycle-duration">{copy(`Cleaning cycle · ${cycleMinutes(steps)} min`, `清洗周期时长 · ${cycleMinutes(steps)} 分钟`)}</p>
      {needsOptions && <><p className="bw-sheet-context">{selectedMode === 'delicate-wash' ? copy('Material', '材质') : copy('Quantity', '数量')}</p><div className="bw-options">{options.map(value => <button key={value} className={option === value ? 'selected' : ''} aria-pressed={option === value} onClick={() => setOption(value)}>{optionLabel(value)}</button>)}</div></>}
      <div className="bw-cycle-section">{custom ? <CustomEditor steps={cleaning} onChange={next => updateSteps([...next, ...steps.filter(step => step.id === 'keep-warm')])} onInvalid={() => showToast(copy('Value out of range. Retry.', '数值超出范围，请重试。'))} /> : <div className="bw-preset-steps">{cleaning.filter(step => cycleSteps(selectedMode, null).find(original => original.id === step.id)?.enabled).map(step => <button key={step.id} role="checkbox" aria-checked={step.enabled} disabled={isRequiredCycleStep(selectedMode, step.id)} className={`bw-preset-step ${step.enabled ? 'selected' : ''} ${isRequiredCycleStep(selectedMode, step.id) ? 'required' : ''}`} onClick={() => updateSteps(steps.map(item => item.id === step.id ? { ...item, enabled: !item.enabled } : item))}><span className="bw-check">{step.enabled && <Check size={12} />}</span><StepIcon id={step.id} /><span className="bw-preset-label">{stepLabels[step.id]}</span><strong>{step.duration} {copy('min', '分钟')}</strong></button>)}</div>}</div>
      {storage && (custom || selectedMode !== 'self-clean') && <section className="bw-storage-section"><p>{copy('Automatic storage after cleaning; not included in cycle time', '清洗结束后自动保管，不计入清洗时长')}</p><CustomEditor steps={[storage]} onChange={next => updateSteps([...cleaning, ...next])} onInvalid={() => showToast(copy('Value out of range. Retry.', '数值超出范围，请重试。'))} /></section>}
      </div>
    </DeviceSheet>}
    {sheet === 'schedule' && selectedMode && <ScheduleSheet modeLabel={name(selectedMode)} closeRequested={closing} onClose={() => { if (pendingStart.current) close(); else setSheet('options'); }} onSave={minutes => animateStart(minutes)} />}
  </DeviceSurface>;
}
