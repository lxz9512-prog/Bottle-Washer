import { DEFAULT_CUSTOM_MODES, type SubModeConfig } from './demo-constants';

export function cycleSteps(mode: string | null, custom: SubModeConfig[] | null): SubModeConfig[] {
  if (mode === 'self-clean') return DEFAULT_CUSTOM_MODES.map(step => {
    const duration = step.id === 'wash' ? 20 : step.id === 'dry' ? 10 : step.duration;
    const enabled = step.id === 'wash' || step.id === 'dry';
    return { ...step, enabled, duration, ...(enabled ? { min: duration, max: duration, step: 1 } : {}) };
  });
  if (custom || isCustomMode(mode)) return (custom ?? DEFAULT_CUSTOM_MODES).map(step => ({
    ...step,
    enabled: step.id === 'wash' && !!mode && !isCustomMode(mode) && mode !== 'sterilize-dry' ? true : step.enabled,
  }));
  return DEFAULT_CUSTOM_MODES.map(step => ({
    ...step,
    enabled: mode === 'sterilize-dry' ? step.id !== 'wash' : true,
    duration: step.id === 'wash' && mode === 'rapid' ? 19 : step.duration,
  }));
}

export function isCustomMode(mode: string | null) {
  return ['custom', 'custom-2', 'custom-3'].includes(mode ?? '');
}

export function isRequiredCycleStep(mode: string | null, stepId: string) {
  return mode === 'self-clean'
    ? stepId === 'wash' || stepId === 'dry'
    : stepId === 'wash' && !isCustomMode(mode) && mode !== 'sterilize-dry';
}

export function cycleMinutes(steps: SubModeConfig[]) {
  return steps.reduce((total, step) => total + (step.enabled && step.unit === 'min' ? step.duration : 0), 0);
}

export function stepSeconds(step: SubModeConfig) {
  return step.duration * (step.unit === 'h' ? 3600 : 60);
}

export function cycleProgress(steps: SubModeConfig[], elapsed: number) {
  let cursor = 0;
  const statuses = steps.map(step => {
    if (!step.enabled) return { status: 'off' as const, remaining: 0 };
    const start = cursor;
    cursor += stepSeconds(step);
    return {
      status: elapsed >= cursor ? 'completed' as const : elapsed >= start ? 'active' as const : 'pending' as const,
      remaining: Math.max(0, cursor - Math.max(elapsed, start)),
    };
  });
  const washSeconds = steps.filter(step => step.enabled && step.unit !== 'h').reduce((total, step) => total + stepSeconds(step), 0);
  return { statuses, complete: elapsed >= cursor, remaining: Math.max(0, washSeconds - elapsed), totalRemaining: Math.max(0, cursor - elapsed) };
}

export function normalizeDuration(value: string, step: SubModeConfig) {
  const fallback = DEFAULT_CUSTOM_MODES.find(item => item.id === step.id)?.duration ?? step.duration;
  const parsed = value.trim() === '' ? fallback : Number(value);
  const valid = Number.isFinite(parsed) ? Math.round(parsed) : step.duration;
  return { value: Math.max(step.min, Math.min(step.max, valid)), invalid: !Number.isFinite(parsed) || valid < step.min || valid > step.max };
}

export function lockedCycleSteps(steps: SubModeConfig[], elapsed: number) {
  const { statuses } = cycleProgress(steps, elapsed);
  const current = statuses.findIndex(item => item.status === 'active');
  const last = current < 0 ? steps.length - 1 : current;
  return Object.fromEntries(steps.flatMap((step, index) => index <= last ? [[step.id, statuses[index].status]] : []));
}

export function pausedCycleEdits(mode: string | null, steps: SubModeConfig[], draft: SubModeConfig[], elapsed: number) {
  if (mode === 'self-clean') return cycleSteps(mode, null);
  const locked = lockedCycleSteps(steps, elapsed);
  const custom = isCustomMode(mode);
  const available = cycleSteps(mode, null);
  return steps.map(step => {
    const edit = draft.find(item => item.id === step.id);
    if (!edit || locked[step.id] || (!custom && (step.id === 'wash' || !available.find(item => item.id === step.id)?.enabled))) return { ...step };
    return { ...step, enabled: edit.enabled, duration: custom || step.id === 'keep-warm' ? normalizeDuration(String(edit.duration), step).value : step.duration };
  });
}
