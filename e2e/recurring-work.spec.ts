import { expect, test } from "@playwright/test";
import { card } from "./support";

const DEMO_BOARD_ID = "01900000-0000-7000-8000-000000000001";
/** Requires the Compose/Vite stack with SEED_DEMO_DATA=true and the seeded demo accounts. */
test("carries recurrence to each occurrence after the original is deleted", async ({ page }) => {
  await page.goto("/login?mode=sign-in");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("ksat-demo-password-2027");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/boards$/);

  await page.goto(`/boards/${DEMO_BOARD_ID}`);
  const taskName = `Recurring carry-over ${Date.now()}`;
  await page.getByRole("button", { name: "New Task" }).first().click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Task name").fill(taskName);
  await createDialog.getByRole("button", { name: "Due date" }).click();
  await page.locator('input[type="date"]').fill("2099-04-19");
  await createDialog.getByRole("combobox", { name: "Repeat" }).click();
  await page.getByRole("option", { name: "Daily" }).click();
  await createDialog.getByRole("button", { name: "Create task" }).click();
  await card(page, "Not Started", taskName).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pause" }).click();
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).not.toBeVisible();

  await card(page, "Not Started", taskName).click();
  const resumedDialog = page.getByRole("dialog");
  await expect(resumedDialog.getByRole("button", { name: "Resume" })).toBeVisible();
  await resumedDialog.getByRole("button", { name: "Resume" }).click();
  await resumedDialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(resumedDialog).not.toBeVisible();

  await expect(
    card(page, "Not Started", taskName)
      .locator("xpath=ancestor::article")
      .getByLabel("Recurring task"),
  ).toBeVisible();

  // Completing the original creates a current occurrence that owns the same repeat schedule.
  await card(page, "Not Started", taskName).click();
  const originalDialog = page.getByRole("dialog");
  await originalDialog.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Completed" }).click();
  await originalDialog.getByRole("button", { name: /Save changes/ }).click();
  const firstOccurrence = card(page, "Not Started", taskName);
  await expect(firstOccurrence).toBeVisible();
  await expect(
    firstOccurrence.locator("xpath=ancestor::article").getByLabel("Recurring task"),
  ).toBeVisible();

  // Removing the completed original must not sever the schedule from the current occurrence.
  await card(page, "Completed", taskName).click();
  const completedOriginal = page.getByRole("dialog");
  await completedOriginal.getByRole("button", { name: "Delete task" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete task" }).click();
  await expect(card(page, "Completed", taskName)).toHaveCount(0);

  await firstOccurrence.click();
  const occurrenceDialog = page.getByRole("dialog");
  await expect(occurrenceDialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await occurrenceDialog.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Completed" }).click();
  await occurrenceDialog.getByRole("button", { name: /Save changes/ }).click();

  const nextOccurrence = card(page, "Not Started", taskName);
  await expect(nextOccurrence).toBeVisible();
  await expect(
    nextOccurrence.locator("xpath=ancestor::article").getByLabel("Recurring task"),
  ).toBeVisible();
});
