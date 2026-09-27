import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  createBoard,
  createTask,
  latestInvitationToken,
  PASSWORD,
  signUp,
  uniqueEmail,
} from "./support";

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

/** Runs the shared axe ruleset and asserts there are no violations on the current page. */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  // Radix dialogs run a 160ms fade/scale-in animation; scanning mid-transition
  // samples partially blended colors and reports false-positive contrast failures.
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations, `${label}: ${JSON.stringify(results.violations, null, 2)}`).toEqual(
    [],
  );
}

/** No horizontal page overflow, except the board's own column scroller. */
async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("accessibility", () => {
  test("login and signup screens", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page, "signup screen");

    // Arrow-key navigation between the sign-up/log-in radio controls.
    const signUpTab = page.getByRole("radio", { name: "Create account" });
    const logInTab = page.getByRole("radio", { name: "Log in" });
    await signUpTab.focus();
    await expect(signUpTab).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(logInTab).toBeFocused();
    await expect(logInTab).toHaveAttribute("aria-checked", "true");

    await page.goto("/login?mode=sign-in");
    await expectNoViolations(page, "login screen");

    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoPageOverflow(page);
    await expectNoViolations(page, "login screen (375px)");
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("boards list, create-board dialog, task board, and task modals", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page, "boards list (empty)");

    const email = uniqueEmail("a11y");
    await page.goto("/login");
    await page.getByLabel("Display Name / Studio Handle").fill("A11y Runner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole("heading", { name: "Boards", level: 1 })).toBeVisible();
    await expectNoViolations(page, "boards list (empty, signed in)");

    // Create-board dialog.
    await page.getByRole("button", { name: "Create New Board" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page, "create-board dialog");
    // Escape closes the dialog and returns focus to the control that opened it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Create New Board" })).toBeFocused();

    const boardName = `A11y Board ${Date.now()}`;
    await createBoard(page, boardName);
    await expectNoViolations(page, "boards list (with one board)");

    await page.goto("/boards");
    await expectNoViolations(page, "boards list (with one board, reloaded)");
    await page.getByRole("link", { name: "Open Board" }).first().click();
    await expect(page.getByRole("heading", { name: boardName, level: 1 })).toBeVisible();

    // New-task modal.
    await page.getByRole("button", { name: "New Task" }).first().click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await expectNoViolations(page, "new-task modal");
    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();

    const taskName = `A11y task ${Date.now()}`;
    await createTask(page, taskName);
    await expectNoViolations(page, "task board with a task");

    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoPageOverflow(page);
    await expectNoViolations(page, "task board (375px)");
    await page.setViewportSize({ width: 1280, height: 900 });

    // Edit-task modal.
    await page.getByRole("heading", { level: 3, name: taskName }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await expectNoViolations(page, "edit-task modal");
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
  });

  test("board settings and members screens", async ({ page }) => {
    await signUp(page, "a11y-settings");
    const boardName = `A11y Settings Board ${Date.now()}`;
    await createBoard(page, boardName);
    const boardId = new URL(page.url()).pathname.split("/")[2];

    await page.goto(`/boards/${boardId}/settings`);
    await expectNoViolations(page, "board settings");
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoPageOverflow(page);
    await expectNoViolations(page, "board settings (375px)");
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/boards/${boardId}/members`);
    await expectNoViolations(page, "board members");
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoPageOverflow(page);
    await expectNoViolations(page, "board members (375px)");
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("invitation page", async ({ page, browser }) => {
    await signUp(page, "a11y-invite");
    const boardName = `A11y Invite Board ${Date.now()}`;
    await createBoard(page, boardName);
    const boardId = new URL(page.url()).pathname.split("/")[2];

    const inviteEmail = uniqueEmail("a11y-invitee");
    await page.goto(`/boards/${boardId}/members`);
    await page.getByLabel("Email address").fill(inviteEmail);
    await page.getByRole("button", { name: "Send Invite" }).click();
    await expect(page.getByRole("status").filter({ hasText: inviteEmail })).toBeVisible();

    const token = await latestInvitationToken(inviteEmail);

    // A signed-out visitor sees the invitation preview and sign-in/sign-up choice.
    const signedOutContext = await browser.newContext();
    const signedOutPage = await signedOutContext.newPage();
    await signedOutPage.goto(`/invitations/${token}`);
    await expect(signedOutPage.getByRole("heading", { name: boardName })).toBeVisible();
    await expectNoViolations(signedOutPage, "invitation preview (signed out)");
    await signedOutContext.close();

    // A not-found token still renders an accessible terminal state.
    await page.goto("/invitations/not-a-real-token");
    await expectNoViolations(page, "invitation not-found state");
  });

  test("reduced motion: task board dialogs skip transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signUp(page, "a11y-motion");
    await createBoard(page, `A11y Motion Board ${Date.now()}`);
    await page.getByRole("button", { name: "New Task" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectNoViolations(page, "new-task modal (reduced motion)");
  });
});
