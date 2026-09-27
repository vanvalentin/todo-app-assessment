import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Shared helpers for the browser journeys. Every journey starts from a new account. */
export const PASSWORD = "e2e-ksat-password-2027";

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${randomUUID()}@example.test`;
}

/** A brand-new account, so a journey never depends on seed data. */
export async function signUp(page: Page, prefix = "runner"): Promise<string> {
  const email = uniqueEmail(prefix);
  await page.goto("/login");
  await page.getByLabel("Display Name / Studio Handle").fill("E2E Runner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Boards", level: 1 })).toBeVisible();
  return email;
}

export async function createBoard(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Create New Board" }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The Kanban column whose heading carries the given domain status label. */
export function column(page: Page, name: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name, level: 2 }) });
}

/** A task card is identified by its level-3 title inside its column. */
export function card(page: Page, columnName: string, taskName: string) {
  return column(page, columnName).getByRole("heading", { level: 3, name: taskName });
}

export async function createTask(
  page: Page,
  name: string,
  options: { assigneeName?: string; dueDate?: string } = {},
): Promise<void> {
  await page.getByRole("button", { name: "New Task" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task name").fill(name);
  if (options.assigneeName) {
    await dialog.getByRole("combobox", { name: "Assignee" }).click();
    await page.getByRole("option", { name: options.assigneeName }).click();
  }
  if (options.dueDate) {
    await dialog.getByRole("button", { name: "Due date" }).click();
    await page.locator('input[type="date"]').fill(options.dueDate);
  }
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
}

const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? "http://localhost:8025";

interface MailpitMessageSummary {
  ID: string;
  To: ReadonlyArray<{ Address: string }>;
}

interface MailpitMessage {
  Text: string;
}

/**
 * Polls Mailpit's HTTP API (exposed by Compose) for the most recent message sent to
 * `email` and returns the invitation token from its "Accept your invitation" link.
 * Invitation delivery happens asynchronously after the API commit, so this retries.
 */
export async function latestInvitationToken(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_BASE_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (search.ok) {
      const body = (await search.json()) as { messages: MailpitMessageSummary[] };
      const match = body.messages.find((message) =>
        message.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
      );
      if (match) {
        const detail = await fetch(`${MAILPIT_BASE_URL}/api/v1/message/${match.ID}`);
        const parsed = (await detail.json()) as MailpitMessage;
        const linkMatch = /\/invitations\/([A-Za-z0-9_-]{20,})/.exec(parsed.Text);
        if (linkMatch?.[1]) return linkMatch[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No invitation email arrived for ${email} within the deadline.`);
}
