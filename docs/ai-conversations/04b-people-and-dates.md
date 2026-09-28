# 04b — People and dates

**Goal:** assignee and due date on tasks, and the Figma task modal.

---

**Me:** Plan phase 4b. Do not execute yet.

**Agent — open questions (condensed):**

1. Who can set the reporter?
2. Which primitive should the property "pill" menus use?
3. Are due dates calendar dates or instants?

**Me:** 1. A contributor can set anyone as reporter. All good for the other recommendations. Create and edit modal designs: _[screenshots]_. 2. Radix. Icons: you can make your own. Approved plan. Execute it with sub-agents, then independent reviewers.

**Agent (condensed):**

- Contracts → migration (assignee and reporter as **composite foreign keys to board membership**, so you can only assign a board member) → API → seed.
- Due dates are **calendar dates**, not UTC instants, so "due today" doesn't shift with the user's timezone.
- New `TaskModal` with Radix-based property pills, conflict reload and member-field error mapping.
- 16 PostgreSQL integration tests, the migration drift guard and the Chromium journey pass. A GPT reviewer checked the diff.

---

## Review

**Me:** _[screenshot]_ The text input looks off compared to our other inputs (search). Align the styles. Put reporter last in the dropdowns, and add a "show more fields" toggle for the second row.

**Me:** The delete task CTA should be on the same row as save changes. "Created by" can go on its own row above the CTA row.

**Agent:** Restructured the footer, reordered the pills, aligned the title input with the search input, and added the toggle with tests.

**Me:** In terms of UI/UX, the show-more toggle doesn't integrate well. Let's remove it and revert to how it was.

**Agent:** Reverted the toggle, its styles and tests. All pills are shown in one row, with Reporter last.

**Me:** Commit.

**Agent:** Six commits: contracts → db → api → web → e2e → docs.
