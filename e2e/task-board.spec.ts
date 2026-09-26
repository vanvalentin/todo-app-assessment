import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { card, column, createBoard, createTask, signUp } from "./support";

const SCREENSHOT_DIR = ".tmp/phase4b/screens";

/** Presses a card and drags it clear of its column, leaving the button held. */
async function grabCard(
  page: Parameters<typeof card>[0],
  taskName: string,
  from: string,
): Promise<void> {
  const source = await card(page, from, taskName).boundingBox();
  if (source === null) throw new Error("missing drag geometry");
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 24, start.y + 24, { steps: 6 });
}

/** Moves the held card over a column without releasing it. */
async function dragOver(page: Parameters<typeof card>[0], target: string): Promise<void> {
  const box = await column(page, target).boundingBox();
  if (box === null) throw new Error("missing drop geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 15 });
}

test("signs up, creates a board and a task, then moves the task between columns", async ({
  page,
}) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  const taskName = `Prepare launch checklist ${Date.now()}`;
  const initialDueDate = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const editedDueDate = new Date(Date.now() + 45 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  await signUp(page, "journey");
  await createBoard(page, `E2E Board ${Date.now()}`);
  await createTask(page, taskName, { assigneeName: "E2E Runner (Admin)", dueDate: initialDueDate });
  await expect(card(page, "Not Started", taskName)).toBeVisible();
  await expect(
    card(page, "Not Started", taskName).locator("xpath=ancestor::article"),
  ).toContainText("E2E Runner");

  // Hovering a card tints only its block border: the title keeps its type, no underline.
  const hoveredCard = card(page, "Not Started", taskName).locator("xpath=ancestor::article");
  await expect(hoveredCard).toHaveCSS("border-top-color", "rgb(232, 228, 222)");
  await expect(hoveredCard).toHaveCSS("cursor", "pointer");
  await hoveredCard.hover();
  await expect(hoveredCard).toHaveCSS("border-top-color", "rgb(214, 211, 209)");
  await expect(hoveredCard.locator("button")).toHaveCSS("text-decoration-line", "none");

  // Cards carry no overflow menu; a single click opens the full designed task modal.
  await expect(page.getByRole("button", { name: /^Task actions for/ })).toHaveCount(0);
  await card(page, "Not Started", taskName).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Task name")).toHaveValue(taskName);
  await expect(dialog.getByRole("combobox", { name: "Assignee" })).toContainText("E2E Runner");
  await dialog.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "In Progress" }).click();
  await dialog.getByRole("button", { name: /Save changes/ }).click();

  await expect(page.getByText(`Moved “${taskName}” to In Progress.`)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/board-toast.png` });
  await expect(card(page, "In Progress", taskName)).toBeVisible();
  await expect(card(page, "Not Started", taskName)).toHaveCount(0);

  // The move must survive a reload instead of living only in the client cache.
  await page.reload();
  await expect(card(page, "In Progress", taskName)).toBeVisible();

  // A shorter viewport makes the page itself scrollable, so the next checks are
  // meaningful: the page must not move while a card is held.
  await page.setViewportSize({ width: 1280, height: 620 });
  const scrollableBy = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(scrollableBy).toBeGreaterThan(0);

  // Dragging between columns is the pointer path for the same operation, and the
  // column under the held card shows that it will accept the drop.
  const completedColumn = column(page, "Completed");
  const emptyPlaceholder = completedColumn.getByText("No tasks in this column yet.");
  await expect(completedColumn).not.toHaveAttribute("data-over", "true");
  await expect(emptyPlaceholder).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await grabCard(page, taskName, "In Progress");

  // Holding the card at the bottom edge of the screen, outside the board, must not
  // scroll the page or the column row, and the overlay keeps tracking the pointer.
  await page.mouse.move(640, 618, { steps: 12 });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);

  const overlay = page.locator('[data-overlay="true"]');
  await expect(overlay).toBeVisible();
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(Math.abs((overlayBox?.x ?? 0) + (overlayBox?.width ?? 0) / 2 - 640)).toBeLessThan(40);
  expect(Math.abs((overlayBox?.y ?? 0) + (overlayBox?.height ?? 0) / 2 - 618)).toBeLessThan(40);

  // Same at the right edge, past the last column, where the column row would scroll.
  await page.mouse.move(1_278, 300, { steps: 12 });
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => {
    const scroller = Array.from(document.querySelectorAll("main *")).find(
      (element) => getComputedStyle(element).overflowX === "auto",
    );
    return {
      documentScroll: Math.round(window.scrollY),
      rowScroll: scroller instanceof HTMLElement ? Math.round(scroller.scrollLeft) : -1,
    };
  });
  expect(held.documentScroll).toBe(0);
  expect(held.rowScroll).toBe(0);

  await dragOver(page, "Completed");

  await expect(completedColumn).toHaveAttribute("data-over", "true");
  await expect(completedColumn).toHaveCSS("background-color", "rgb(231, 240, 235)");
  await expect(completedColumn).toHaveCSS("border-top-color", "rgb(49, 92, 75)");
  // The inset ring is the non-colour cue, and the hovered column is the only one.
  await expect(completedColumn).toHaveCSS("box-shadow", /rgb\(49, 92, 75\).*inset/);
  await expect(column(page, "Not Started")).not.toHaveAttribute("data-over", "true");
  await expect(emptyPlaceholder).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/board-drop-target.png` });

  await page.mouse.up();
  await expect(completedColumn).not.toHaveAttribute("data-over", "true");
  await expect(page.getByText(`Moved “${taskName}” to Completed.`)).toBeVisible();
  await expect(card(page, "Completed", taskName)).toBeVisible();
  await expect(card(page, "In Progress", taskName)).toHaveCount(0);

  await page.reload();
  await expect(card(page, "Completed", taskName)).toBeVisible();

  // The scroller is the direct parent of the three column sections.
  const scroller = column(page, "Not Started").locator("..");
  expect(await scroller.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
  const measure = async () =>
    scroller.evaluate((element) => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollerOverflow: element.scrollWidth - element.clientWidth,
      controlHeights: Array.from(
        document.querySelectorAll('main input[type="search"], main span[role="presentation"]'),
      ).length,
    }));

  // At the frame width all three columns are visible without a nested scrollbar.
  const wide = await measure();
  expect(wide.pageOverflow).toBeLessThanOrEqual(1);
  expect(wide.scrollerOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/board-1280.png`, fullPage: true });

  // The search field and the filter controls share one control height.
  const controlHeights = await page.evaluate(() => {
    const box = (element: Element | null) =>
      element === null ? 0 : Math.round(element.getBoundingClientRect().height);
    const search = document.querySelector('main input[type="search"]')?.closest("div") ?? null;
    const shells = Array.from(document.querySelectorAll("main select")).map((select) =>
      box(select.parentElement),
    );
    return { search: box(search), shells };
  });
  expect(controlHeights.search).toBeGreaterThan(0);
  for (const height of controlHeights.shells) expect(height).toBe(controlHeights.search);

  // Narrow screens scroll the columns instead of the page.
  await page.setViewportSize({ width: 375, height: 812 });
  const narrow = await measure();
  expect(narrow.pageOverflow).toBeLessThanOrEqual(1);
  expect(narrow.scrollerOverflow).toBeGreaterThan(0);
  await expect(card(page, "Completed", taskName)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/board-375.png`, fullPage: true });

  // Reopen the designed edit modal, change a people/date-era field, persist it,
  // then delete from the same modal. This journey remains seed-independent.
  await card(page, "Completed", taskName).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Low Priority" }).click();
  await editDialog.getByRole("button", { name: "Due date" }).click();
  await page.locator('input[type="date"]').fill(editedDueDate);
  await editDialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText(`Saved “${taskName}”.`)).toBeVisible();

  await page.reload();
  await card(page, "Completed", taskName).click();
  const persistedDialog = page.getByRole("dialog");
  await expect(persistedDialog.getByRole("combobox", { name: "Priority" })).toContainText(
    "Low Priority",
  );
  await expect(persistedDialog.getByRole("button", { name: "Due date" })).not.toContainText(
    "No due date",
  );
  await persistedDialog.getByRole("button", { name: "Delete task" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByText(`Deleted “${taskName}”.`)).toBeVisible();
  await expect(card(page, "Completed", taskName)).toHaveCount(0);
});
