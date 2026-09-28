export const actionTypes = ["email", "social", "dismiss"] as const;
export type ActionType = (typeof actionTypes)[number];
export const actionStatuses = ["pending", "approved", "executing", "completed", "failed", "unknown"] as const;
export type ActionStatus = (typeof actionStatuses)[number];

const transitions: Record<ActionStatus, readonly ActionStatus[]> = {
  pending: ["approved"],
  approved: ["pending", "executing"],
  executing: ["completed", "failed", "unknown"],
  completed: [],
  failed: [],
  unknown: [],
};

export function assertTransition(from: ActionStatus, to: ActionStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Cannot transition action from ${from} to ${to}`);
}

export function assertActionType(value: unknown): asserts value is ActionType {
  if (typeof value !== "string" || !actionTypes.includes(value as ActionType)) throw new Error("Unknown action type");
}
