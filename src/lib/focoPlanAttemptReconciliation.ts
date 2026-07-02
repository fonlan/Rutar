export type FocoPlanAttemptStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "orphaned"
  | "unknown";

export type FocoAgentRuntimeStatus =
  | "queued"
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type FocoAgentRuntimeResult =
  | { ok: true; status: FocoAgentRuntimeStatus }
  | { ok: false; code: "not_found" | "team_not_visible" | "runtime_unavailable" };

export type FocoPlanAttempt = {
  status: FocoPlanAttemptStatus;
  agentTaskId?: string;
  statusReason?: string;
};

export type FocoPlanPhase = {
  status: FocoPlanAttemptStatus;
  attempts: FocoPlanAttempt[];
};

export type FocoPlanSummary = {
  status: FocoPlanAttemptStatus;
  phases: FocoPlanPhase[];
};

const ORPHAN_AGENT_ATTEMPT_REASON =
  "Agent task is no longer available; the runtime team may have ended or become invisible.";

const liveAgentStatuses = new Set<FocoAgentRuntimeStatus>(["queued", "waiting", "running"]);
const terminalStatuses = new Set<FocoPlanAttemptStatus>(["completed", "failed", "cancelled"]);

export function reconcileFocoPlanAgentAttemptsForDisplay(
  plan: FocoPlanSummary,
  getRuntimeTask: (agentTaskId: string) => FocoAgentRuntimeResult
): FocoPlanSummary {
  const phases = plan.phases.map((phase) => {
    const attempts = phase.attempts.map((attempt) => {
      if (terminalStatuses.has(attempt.status) || attempt.status !== "running" || !attempt.agentTaskId) {
        return attempt;
      }

      const runtimeTask = getRuntimeTask(attempt.agentTaskId);
      if (runtimeTask.ok && liveAgentStatuses.has(runtimeTask.status)) {
        return attempt;
      }

      if (runtimeTask.ok) {
        switch (runtimeTask.status) {
          case "completed":
          case "failed":
          case "cancelled":
            return { ...attempt, status: runtimeTask.status };
          default:
            return attempt;
        }
      }

      return { ...attempt, status: "failed" as const, statusReason: ORPHAN_AGENT_ATTEMPT_REASON };
    });

    return { ...phase, attempts, status: deriveStatusFromAttempts(attempts) };
  });

  return { ...plan, phases, status: deriveStatusFromPhases(phases) };
}

function deriveStatusFromPhases(phases: FocoPlanPhase[]): FocoPlanAttemptStatus {
  if (phases.some((phase) => phase.status === "running")) return "running";
  if (phases.some((phase) => phase.status === "failed")) return "failed";
  if (phases.every((phase) => phase.status === "completed")) return "completed";
  if (phases.every((phase) => phase.status === "cancelled")) return "cancelled";
  return phases[0]?.status ?? "pending";
}

function deriveStatusFromAttempts(attempts: FocoPlanAttempt[]): FocoPlanAttemptStatus {
  // ponytail: this executable spec models one-attempt phases; replace with host Plan status rules when this moves into Foco runtime.
  const latestAttempt = attempts[attempts.length - 1];
  return latestAttempt?.status ?? "pending";
}
