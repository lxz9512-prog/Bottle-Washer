import { cycleMinutes, cycleProgress, cycleSteps, stepSeconds } from './machine-cycle';
import type { SubModeConfig } from './demo-constants';

export interface MachineMaintenance {
  completedWorkCount: number;
  dismissedCleaningReminderAt: number;
  cycleUsageRecorded: boolean;
}

interface MaintenanceCycle extends MachineMaintenance {
  cycleActive: boolean;
  scheduleAt: number | null;
  selectedMode: string | null;
  customConfig: SubModeConfig[] | null;
  elapsedSeconds: number;
}

export const DEFAULT_MAINTENANCE: MachineMaintenance = {
  completedWorkCount: 0,
  dismissedCleaningReminderAt: 0,
  cycleUsageRecorded: false,
};

export function normalizeMaintenance(value: Partial<MachineMaintenance>): MachineMaintenance {
  const completedWorkCount = Number.isSafeInteger(value.completedWorkCount) && value.completedWorkCount! >= 0 ? value.completedWorkCount! : 0;
  const dismissed = Number.isSafeInteger(value.dismissedCleaningReminderAt) && value.dismissedCleaningReminderAt! >= 0 ? value.dismissedCleaningReminderAt! : 0;
  return {
    completedWorkCount,
    dismissedCleaningReminderAt: Math.floor(Math.min(completedWorkCount, dismissed) / 10) * 10,
    cycleUsageRecorded: value.cycleUsageRecorded === true,
  };
}

export function cleaningReminderMilestone(completedWorkCount: number) {
  return Math.floor(completedWorkCount / 10) * 10;
}

export function needsCleaningReminder(value: MachineMaintenance) {
  const milestone = cleaningReminderMilestone(value.completedWorkCount);
  return milestone >= 10 && milestone > value.dismissedCleaningReminderAt;
}

// Settle completion where the device clock writes, even when its screen is closed.
export function updateMaintenance(previous: MaintenanceCycle, next: MaintenanceCycle): MachineMaintenance {
  const maintenance = normalizeMaintenance(next);
  const starting = next.cycleActive && next.scheduleAt === null && (!previous.cycleActive || previous.scheduleAt !== null);
  if (!next.cycleActive || starting) maintenance.cycleUsageRecorded = false;
  if (starting && next.selectedMode === 'self-clean') return { ...DEFAULT_MAINTENANCE };
  if (!next.cycleActive || next.scheduleAt !== null || !next.selectedMode || next.selectedMode === 'self-clean' || maintenance.cycleUsageRecorded) return maintenance;

  const steps = cycleSteps(next.selectedMode, next.customConfig);
  const workingSeconds = cycleMinutes(steps) * 60;
  // Storage does not add another use. A storage-only custom run counts at its end.
  const finished = workingSeconds > 0
    ? next.elapsedSeconds >= workingSeconds
    : steps.some(step => step.enabled && stepSeconds(step) > 0) && cycleProgress(steps, next.elapsedSeconds).complete;
  return finished ? { ...maintenance, completedWorkCount: maintenance.completedWorkCount + 1, cycleUsageRecorded: true } : maintenance;
}
