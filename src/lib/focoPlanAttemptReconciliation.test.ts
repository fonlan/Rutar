import { describe, expect, it } from "vitest";
import {
  reconcileFocoPlanAgentAttemptsForDisplay,
  type FocoAgentRuntimeResult,
  type FocoPlanSummary,
} from "./focoPlanAttemptReconciliation";

const runningPlan = (status = "running"): FocoPlanSummary => ({
  status: "running",
  phases: [
    {
      status: "running",
      attempts: [
        {
          status: status as FocoPlanSummary["status"],
          agentTaskId: "agent-task-1",
        },
      ],
    },
  ],
});

const runtime = (result: FocoAgentRuntimeResult) => () => result;

describe("foco plan agent attempt reconciliation", () => {
  it("downgrades an orphan running attempt so plan display cannot stay running", () => {
    const plan = reconcileFocoPlanAgentAttemptsForDisplay(
      runningPlan(),
      runtime({ ok: false, code: "not_found" })
    );

    expect(plan.status).toBe("failed");
    expect(plan.phases[0].status).toBe("failed");
    expect(plan.phases[0].attempts[0]).toMatchObject({
      status: "failed",
      statusReason: "Agent task is no longer available; the runtime team may have ended or become invisible.",
    });
  });

  it("keeps a positively queryable running task running", () => {
    const plan = reconcileFocoPlanAgentAttemptsForDisplay(
      runningPlan(),
      runtime({ ok: true, status: "running" })
    );

    expect(plan.status).toBe("running");
    expect(plan.phases[0].status).toBe("running");
    expect(plan.phases[0].attempts[0].status).toBe("running");
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "does not rewrite an already %s attempt",
    (status) => {
      let runtimeCalls = 0;
      const plan = reconcileFocoPlanAgentAttemptsForDisplay(runningPlan(status), () => {
        runtimeCalls += 1;
        return { ok: false, code: "not_found" };
      });

      expect(runtimeCalls).toBe(0);
      expect(plan.phases[0].attempts[0].status).toBe(status);
    }
  );
});
