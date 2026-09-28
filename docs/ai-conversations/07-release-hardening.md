# 07 — Release hardening

**Goal:** remove controls that don't work, polish the UI and make the API easier to explore.

---

**Me:** Plan for phase 7. Don't do a Figma comparison of every screen. Remove any unusable feature or button from the UI. Once planning is done, launch an agent to execute it.

**Me:** Can you also check the edit/create task modal for unused elements?

**Agent:** Removed a "Saved" label that showed up even though nothing had been saved. Everything else in the modal has a purpose.

**Me:** There's a "Create more" checkbox that doesn't seem to do anything in the create task modal.

**Agent (condensed):** It worked (the modal stays open and the form resets), but nothing told the user that a task had been created. Added a confirmation message.

---

**Me:**

> - Focusing inputs adds a thick red border. Make it more subtle and have it cover the input border properly. This happens on the filter dropdown, which tells me we're not using the same dropdown component as the task modal.
> - Swagger: can we group the API calls by feature so the UI is more readable?
> - Put the toast messages above the footer, bottom left.
> - In /boards, remove the "updated by" and author avatar/name from the board cards.
> - The New task CTA in the filter row isn't the same height as the dropdowns. Also put it to the right of the search bar.
> - Remove the Reporter field, as it currently has no use (no notifications).

**Agent (condensed):**

- A thin, border-aligned focus ring from design tokens. The board filters now use the **same Radix Select** as the task modal.
- OpenAPI operations are tagged by feature (Health, Boards, Members, Invitations, Tasks, Attachments), with a test that every route is documented.
- Reporter removed with a **committed migration** plus updated contracts, tests and docs.
- Checked in the browser at desktop and 375 px widths.

**Me:** Commit.

**Agent:** Five commits: web clean-up, tasks/reporter, OpenAPI grouping, e2e journeys, docs.
