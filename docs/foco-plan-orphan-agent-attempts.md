# Plan Panel orphan Agent attempt diagnosis

## Scope

This phase is diagnostic only. The app repository in this worktree is Rutar; it does not contain the Foco Plan panel, Agent runtime, or durable plan store implementation. The relevant behavior is therefore in the host runtime exposed through the Foco tools, not in `src/` or `src-tauri/`.

Searches performed in this worktree found no Plan/Agent implementation symbols such as `agentTaskId`, `attempt.status`, `get_plans`, or Plan panel rendering code. `get_plans(view=all)` also returns no durable plans visible to this isolated task context.

## Data Lifecycle

The stuck UI state is a lifecycle mismatch:

- Plan status is durable Plan state, read by the Plan panel from the Plan store.
- Phase status is durable phase progress derived from the Plan store and its steps/attempts.
- Attempt status is durable attempt metadata attached to a phase. For Agent-backed attempts it also stores runtime identity such as `teamId`, `agentTaskId`, and `attemptId`.
- Agent task status is runtime state, queried through `agent_get_task` for the current visible team.

The important boundary is the Plan read/sync path. A durable attempt can say `running` even after the runtime task is no longer queryable because the task belonged to an old team, the team is no longer visible, or the runtime task record was pruned/lost.

## Reproduction Shape

The current task confirms the live path: `agent_get_task(agent-task-1782953680830-93)` returns `status=running` in visible team `agent-team-1782953680778-92`.

The orphan path is the same durable shape with a runtime miss: `agent_get_task(agent-task-orphan-repro-not-found)` returns `code=not_found` for the visible team. A Plan attempt that still has `status=running` and an `agentTaskId` that produces that response is orphaned and must not keep rendering as actively running.

Team invisibility should be treated the same as task not found for Plan display purposes: the durable Plan reader cannot prove the task is still running, and the user cannot act on or inspect it in the current runtime context.

## Minimal Fix Point

Use backend Plan read/reconciliation as the smallest reliable fix point.

Reasoning:

- UI-only downgrade avoids the spinner but leaves stale durable state behind, so active/all views and later sessions can disagree.
- Scheduler cleanup is useful but unreliable for old records because the scheduler may never see attempts from invisible teams or lost runtimes.
- Read-time Plan reconciliation is lazy, cheap, and covers both active and all Plan panel queries without rewriting Agent or Plan architecture.

Recommended rule:

1. When listing or reading plans, inspect attempts with `status=running` and an Agent `agentTaskId`.
2. Query the corresponding Agent runtime only if the team/task is visible to the current runtime context.
3. If the runtime returns a terminal status, mirror that terminal result into the durable attempt.
4. If the runtime returns `not_found`, team-invisible, or another explicit non-queryable runtime identity error, downgrade the attempt to a durable non-running state with a reason.
5. Leave attempts as `running` only when the runtime query positively reports a live running/waiting/queued state.

## Orphan Semantics

Do not add a new status unless the existing Plan attempt enum already has `interrupted`, `orphaned`, or `unknown`.

Preferred existing-state mapping:

- Use `interrupted` or `orphaned` if already present.
- Otherwise use `failed` with a specific reason such as `Agent task is no longer available; the runtime team may have ended or become invisible.`
- Do not use `cancelled` unless the user or runtime explicitly cancelled the task. Cancellation implies intent; an orphaned runtime is loss of observability/recovery.

Display copy should distinguish this from a normal command failure. Suggested UI label: `Interrupted`. Suggested detail: `Agent task is no longer available; it may have belonged to an old or hidden team.`

This preserves normal running behavior because only attempts that cannot be positively reconciled to a live runtime task are downgraded.

## Phase 3 Validation Notes

The isolated worktree still does not contain the Foco host/runtime implementation, so Phase 3 keeps the check as an executable status-machine spec rather than wiring unused production code into Rutar UI paths.

Added coverage in `src/lib/focoPlanAttemptReconciliation.test.ts` for the agreed boundary:

- `running` attempt + Agent runtime `not_found` becomes non-running at attempt, phase, and plan display levels, with the orphan reason preserved.
- Positively queryable live Agent task status keeps the attempt, phase, and plan `running`.
- Existing terminal attempt states `completed`, `failed`, and `cancelled` are not queried or rewritten.

The simulated orphan response is the same boundary shape as an old task/team that the Plan reader cannot query. Expected user-visible meaning remains: this is an interrupted/orphaned runtime observation, not a user cancellation or a confirmed command failure.
