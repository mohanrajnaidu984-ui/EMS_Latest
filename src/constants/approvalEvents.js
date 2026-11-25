/**
 * Dispatched when pending approval list or badge should refresh.
 * Optional CustomEvent.detail:
 *   { delta?: number, skipRefresh?: boolean }
 * - delta: immediate badge adjustment after a workflow change
 * - skipRefresh: apply the badge adjustment without requesting fresh data
 */
export const EMS_PENDING_APPROVALS_CHANGED = 'ems-pending-approvals-changed';
