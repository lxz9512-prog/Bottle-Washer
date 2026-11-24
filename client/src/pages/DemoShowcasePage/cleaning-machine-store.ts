import type { SubModeConfig, ModeConfig } from './demo-constants';
import { activateMachineModel, getMachineModel, MACHINE_MODELS, machineLocal, supportsMode, type MachineModelId } from './machine-models';
import { isApp } from '../../runtime';
import { cleaningReminderMilestone, DEFAULT_MAINTENANCE, normalizeMaintenance, updateMaintenance, type MachineMaintenance } from './machine-maintenance';

export interface CleaningMachineState extends MachineMaintenance {
  activeScreen: string;
  selectedMode: string | null;
  isRunning: boolean;
  standby: boolean;
  customConfig: SubModeConfig[] | null;
  lastUsedMode: string | null;
  lastUsedAt: number | null;
  modeConfig: ModeConfig | null;
  cycleActive: boolean;
  scheduleAt: number | null;
  elapsedSeconds: number;
  runStartedAt: number | null;
  presentation: 'normal' | 'offline' | 'error-df' | 'error-af' | 'filter-soon' | 'filter-expired';
}

const DEFAULT_STATE: CleaningMachineState = {
  ...DEFAULT_MAINTENANCE,
  activeScreen: 'home',
  selectedMode: null,
  isRunning: true,
  standby: false,
  customConfig: null,
  lastUsedMode: null,
  lastUsedAt: null,
  modeConfig: null,
  cycleActive: false,
  scheduleAt: null,
  elapsedSeconds: 0,
  runStartedAt: null,
  presentation: 'normal',
};

function sanitize(state: CleaningMachineState, id: MachineModelId): CleaningMachineState {
  if ((state.selectedMode && !supportsMode(state.selectedMode, id)) || (state.modeConfig && !supportsMode(state.modeConfig.modeId, id))) {
    state = { ...DEFAULT_STATE, ...normalizeMaintenance(state), lastUsedAt: state.lastUsedAt, cycleUsageRecorded: false };
  }
  if (state.lastUsedMode && !supportsMode(state.lastUsedMode, id)) state = { ...state, lastUsedMode: null };
  if (state.activeScreen === 'smart-mode' && !supportsMode('smart', id)) state = { ...state, activeScreen: 'home' };
  if (id === 'bw05a' && state.presentation.startsWith('filter-')) state = { ...state, presentation: 'normal' };
  return state;
}
let states = Object.fromEntries(MACHINE_MODELS.map(({ id }) => {
  const saved = isApp ? machineLocal.get<Partial<CleaningMachineState>>('machine', {}, id) : {};
  const maintenance = machineLocal.get<Partial<MachineMaintenance>>('machine-maintenance', saved, id);
  const initial = sanitize({ ...DEFAULT_STATE, ...saved, ...normalizeMaintenance({ ...saved, ...maintenance }), presentation: 'normal' }, id);
  const state = { ...initial, ...updateMaintenance(initial, initial) };
  if (isApp) machineLocal.set('machine', state, id);
  saveMaintenance(state, id);
  return [id, state];
})) as Record<MachineModelId, CleaningMachineState>;
let listeners: Array<() => void> = [];

function saveMaintenance(state: MachineMaintenance, id: MachineModelId) {
  machineLocal.set('machine-maintenance', {
    completedWorkCount: state.completedWorkCount,
    dismissedCleaningReminderAt: state.dismissedCleaningReminderAt,
  }, id);
}

export const cleaningMachineStore = {
  getSnapshot: () => states[getMachineModel().id],
  getAllSnapshot: () => states,
  selectModel(id: MachineModelId) {
    if (getMachineModel().id === id) return;
    activateMachineModel(id);
    listeners.forEach(fn => fn());
  },
  get(id: MachineModelId = getMachineModel().id): CleaningMachineState {
    return { ...states[id] };
  },

  set(partial: Partial<CleaningMachineState>, id: MachineModelId = getMachineModel().id) {
    const previous = states[id];
    const next = sanitize({ ...previous, ...partial }, id);
    const state = { ...next, ...updateMaintenance(previous, next) };
    states = { ...states, [id]: state };
    if (isApp) machineLocal.set('machine', state, id);
    if (state.completedWorkCount !== previous.completedWorkCount || state.dismissedCleaningReminderAt !== previous.dismissedCleaningReminderAt) saveMaintenance(state, id);
    listeners.forEach(fn => fn());
  },

  dismissCleaningReminder() {
    this.set({ dismissedCleaningReminderAt: cleaningReminderMilestone(this.get().completedWorkCount) });
  },

  isDeviceActive(): boolean {
    const state = states[getMachineModel().id];
    return state.cycleActive || state.scheduleAt !== null;
  },

  reset(all = false) {
    const ids = all ? MACHINE_MODELS.map(model => model.id) : [getMachineModel().id];
    for (const id of ids) {
      const maintenance = all ? DEFAULT_MAINTENANCE : normalizeMaintenance(states[id]);
      states = { ...states, [id]: { ...DEFAULT_STATE, ...maintenance, cycleUsageRecorded: false } };
      if (isApp) machineLocal.set('machine', states[id], id);
      if (all) machineLocal.remove('machine-maintenance', id);
    }
    listeners.forEach(fn => fn());
  },

  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },
};
