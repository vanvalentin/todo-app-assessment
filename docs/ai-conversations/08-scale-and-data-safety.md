# 08 — Scale and data safety

**Goal:** make deletion recoverable, trigger recurrence on completion, add blocked filtering, and keep the board fast with 10,000+ tasks.

---

**Me:**

> Plan for the following:
>
> - Recoverable deletion: data should not be permanently lost when a task is deleted.
> - Completion-triggered recurrence: when a recurring task is marked as completed, the next occurrence should be created automatically based on its schedule.
> - Blocked/unblocked filtering.
> - The system should handle a task list with 10,000+ items without degrading the user experience.

**Agent — plan (condensed):**

| Topic                           | Approach                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recoverable deletion            | **Soft delete.** Deleted tasks disappear from every read but keep their dependencies, attachments and schedule. A guarded operator command restores them.      |
| Completion-triggered recurrence | Completing a recurring task creates the next occurrence **in the same transaction**, using the same unique occurrence key as the worker so it can't duplicate. |
| Blocked/unblocked filter        | A new query parameter in the shared contract, computed in SQL from unsettled prerequisites.                                                                    |
| 10,000+ tasks                   | Server-side filtering, keyset pagination, indexes, and **virtualized columns** in the UI.                                                                      |

**Me:** Execute the plan.

---

**Me:** I'd also like to be able to run a seed script with a large amount of data and users.

**Agent (condensed):** Added `pnpm db:seed:volume`. The default creates 200 users, 21 boards and 15,000 tasks (one board with 10,000) in about 7 seconds. Size flags and `--reset` are available. It's deterministic and idempotent: a second run inserts nothing.

**Me:** Did you set up more than one board or just one?

**Agent:** 21: one large board with all 200 users, and 20 smaller boards with 250 tasks and 3–25 members each.

---

**Me:** Does any of the Markdown contain the task lifecycle diagram? _(then)_ Put it in the README. Commit once done.

**Agent:** Added a state diagram (statuses, dependency gates, archive/restore, soft delete, recurrence on completion) to the README and committed in five scoped commits.
