# 03 — Boards and membership

**Goal:** boards, member roles and email invitations, with board-scoped authorization.

---

**Me:** Work on phase 3. You are the main orchestrator: plan it yourself, then launch sub-agents to do the work, then make sure everything works and launch independent reviewers.

**Agent — key decisions (condensed):**

- A **non-member gets `404`**, never `403`, so the API doesn't reveal that a board exists. Every board query is filtered by the caller's membership.
- Roles: `ADMIN`, `MANAGER`, `CONTRIBUTOR`. Any signed-in user can create a board and becomes its `ADMIN` (board and membership created in one transaction).
- Invitation tokens are stored **hashed**, emailed through SMTP (Mailpit locally) and accepted transactionally.
- Backend, then frontend (board list, members and invitations screens, public invitation page), each followed by a reviewer from a different model family.

**Agent — review outcome (condensed):** Reviewers asked for backend/security and frontend/accessibility changes. All six frontend findings were fixed (web tests went from 50 to 59), and the backend fixes were re-verified with PostgreSQL integration tests.

---

## Extending the slice

**Me:** For boards, can we edit the name and description? If so, add the functionality (only ADMIN can do it) and the frontend needed.

**Agent (condensed):**

- `PATCH /api/v1/boards/:boardId` with `{ name, description, version }`.
- `ADMIN` → allowed; other roles → `403 BOARD_ADMIN_REQUIRED`; non-member → `404`.
- **Optimistic concurrency:** a stale `version` returns `409` and the UI offers to reload.
- An accessible edit form with pending, validation, conflict and retry states. The reviewer approved it, and the agent also fixed focus restoration and an OpenAPI regression gap.

**Me:** What happens when someone is invited but doesn't have an account yet?

**Agent (condensed):** The invite goes to an email address, not a user. The public invitation page asks the person to sign up or sign in, and acceptance checks that the signed-in email matches the invited email.

---

## Re-planning

**Me:** Can you review the delivery plan and suggest a path that makes more sense?

**Agent (condensed):** Split the remaining work into smaller slices that each deliver something a user can try:

- **4a** task board (CRUD, drag between statuses) → **4b** people and dates → **4c** finding work (search/filter/sort/archive)
- **5a** description and dependencies → **5b** attachments
- **6** recurring work → **7** release hardening

**Me:** Yes, but no need for the decision note.

**Agent:** Updated the README delivery plan.

---

**Me:** For invitations, we need a way to cancel an invitation instead of only waiting for it to expire. Also there's an alignment issue in the invitation form. _[screenshot]_

**Agent (condensed):**

- **Layout:** the role hint made that field taller, and `align-items: end` pushed the email input down. Fixed by aligning from the top.
- `DELETE /boards/:boardId/invitations/:invitationId` → `204`, idempotent. A manager can't cancel an admin invitation. Cancelling an accepted invitation returns `409 INVITATION_NOT_PENDING`.
- Cancellation and acceptance are transactional, and a **real PostgreSQL race test** covers both happening at the same time.
