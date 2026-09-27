import { expect, test } from "@playwright/test";

const DEMO_BOARD_ID = "01900000-0000-7000-8000-000000000001";
const DEMO_TASK_NAME = "Confirm zine fair booth allocation";

/** Requires the Compose/Vite stack with SEED_DEMO_DATA=true and the seeded demo accounts. */
test("pauses and resumes a seeded recurring task without editing its template", async ({
  page,
}) => {
  await page.goto("/login?mode=sign-in");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("ksat-demo-password-2027");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/boards$/);

  await page.goto(`/boards/${DEMO_BOARD_ID}`);
  const task = page.getByRole("button", { name: DEMO_TASK_NAME });
  await expect(task).toBeVisible();
  await task.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pause" }).click();
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: DEMO_TASK_NAME }).click();
  const resumedDialog = page.getByRole("dialog");
  await expect(resumedDialog.getByRole("button", { name: "Resume" })).toBeVisible();
  await resumedDialog.getByRole("button", { name: "Resume" }).click();
  await resumedDialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(resumedDialog).not.toBeVisible();

  await expect(page.getByLabel("Recurring task")).toBeVisible();
});
