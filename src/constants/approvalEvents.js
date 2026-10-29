/**
 * Dispatched when pending approval list or badge should refresh.
 * Optional CustomEvent.detail:
 *   { delta?: number, skipRefresh?: boolean }
 * - delta: optimistic badge adjustment (e.g. -1 on approve)
 * - skipRefresh: apply delta only; do not hit count/list APIs yet
 *   (SQL may not have committed — same reason the left list dismisses locally)
 */
export const EMS_PENDING_APPROVALS_CHANGED = 'ems-pending-approvals-changed';
