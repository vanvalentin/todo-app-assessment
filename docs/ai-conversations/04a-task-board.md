# 04a — Task board

**Goal:** a Kanban board with task CRUD and status changes by drag and drop.

---

**Me:** Plan for phase 4a. _(then)_ Execute the plan.

**Agent (condensed):**

- `Task` model with a **per-board sequence number** allocated in a transaction, plus a database check constraint on the name.
- Repository queries are always scoped to board membership. Updates carry a `version`, and a stale one returns `409 TASK_VERSION_CONFLICT`.
- Board page with status columns, a create/edit dialog, drag and drop (`@dnd-kit`) with optimistic moves and rollback.

---

## UX review rounds

**Me:**

> - When dragging a task and releasing, the animation goes from the new status back to the old one. The status is correct but the animation isn't right.
> - Board settings: make it a proper button with an icon and just "Settings".
> - The filter dropdowns aren't the same height as the search input.
> - There shouldn't be three dots on task cards. A single click (not a drag) should open the edit modal, and delete/status changes happen from there.
> - Is the "task moved to Completed" notification a placeholder or a feature we asked for?

**Agent (condensed):** The drop animation returned the overlay to the card's **old** slot before the optimistic update rendered, so it was disabled and the card now lands in place. Also added a Settings button with an icon, matching control heights, and click-to-open that tells a click apart from a drag.

**Me:** Move this notification into a toast rather than inside the board UI. The cursor should be a pointer when hovering a task, and hovering shouldn't underline the title; a subtle border colour change is fine.

**Agent:** Added a reusable `Toast` component rendered in a portal (it announces to screen readers and respects reduced motion), and updated the hover styles.

**Me:** When dragging a task over a column, the column background or border should change so the user knows they can drop it.

**Me:** Can you stop the main section from auto-scrolling when dragging a task outside it? The user should be able to drag anywhere on the screen.

**Agent (condensed):** Reproduced it with a probe at a short viewport. `@dnd-kit` auto-scroll walks every scrollable ancestor, including the page, so it's now limited to the columns. The drop target shows an accent background and border.

---

## Developer experience

**Me:** `pnpm run dev` says: No projects matched the filters.

**Agent (condensed):** On Windows, pnpm runs scripts through `cmd.exe`, where single quotes are literal, so `'./apps/*'` matched nothing. Changed it to `pnpm --recursive --parallel run dev`.

**Me:** I get `INVALID_ORIGIN` running the web app on port 5174 and calling sign-up.

**Agent (condensed):** Vite fell back to 5174 because 5173 was taken. Trusted origins are an explicit allow-list, so the fix is to free the configured port rather than widen the list.

**Me:** Where do I get logs for the API? And can we use VS Code's debugger so I can add breakpoints?

**Me:** Considering we use Pino, is there a way for the debugger output to show well-formatted logs?

**Agent (condensed):** Logs go to stdout as JSON. Added a VS Code launch config (`tsx` from `apps/api`) and a **dev-only** `pino-pretty` transport. Production output stays JSON for log aggregators.

---

**Me:** Commit the changes, with multiple commits if that's cleaner. Also add a rule for the agent: when committing, it should structure its commits, avoiding large ones but not making too many either.

**Agent:** Added a _Git hygiene_ section to `AGENTS.md` (commit by area: contracts → db → api → web → tests → docs) and committed in that order.
