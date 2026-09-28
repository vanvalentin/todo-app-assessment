# 05a — Content and dependencies

**Goal:** Markdown descriptions and task dependencies.

---

**Me:** Plan for phase 5a and execute.

**Agent (condensed):** Markdown descriptions with safe rendering. Same-board dependencies that reject self-dependencies and cycles, updated in a transaction with optimistic concurrency and stable `422` Problem Details. An accessible dependency picker with loading, empty, error and limit states.

---

**Me:**

> - Can the Markdown editor have style controls (a third-party package is fine) and only show the "Preview" toggle?
> - Update the dependency logic to follow these rules:
>   - A dependent task cannot move to "In Progress" until all its dependencies are "Completed".
>   - Add an explanation of dependencies in the create and edit modals.
>   - Display the error if the rule is hit.

**Agent:** Added a keyboard-accessible toolbar (heading, bold, italic, list, link, code) and a single Preview toggle. The status gate is enforced in the **service** (not just the UI) with a clear error code, which the modal shows next to the explanation.

**Me:** Should a task that depends on an archived one lose the dependency, or count it as complete? Also fix: a dependent task shouldn't be able to go to Completed if the dependency is still in progress or not started.

**Agent (condensed):** Recommended a middle path: **keep the edge but treat an archived prerequisite as settled**. Archived means abandoned, so it will never be completed, and dropping the edge would lose history. Extended the gate to cover moves to `COMPLETED` as well.

**Me:** Also, the error "That dependency would create a loop" should also appear if I edit an in-progress task with a looping dependency.

**Agent (condensed):** Found an ordering bug: the status gate ran **before** the cycle check, so the wrong error came back. Reordered the checks and added a regression integration test.

**Me:** Commit.

**Agent:** Six commits following the layer order (contracts → db → api → web → e2e → docs).
