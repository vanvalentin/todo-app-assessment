import { expect, test } from "@playwright/test";
import { PASSWORD, createBoard, latestInvitationToken, signUp, uniqueEmail } from "./support";

/**
 * Admin invites a new member with a role, the invitee retrieves the link from
 * Mailpit and accepts it, and a member without manage rights sees a read-only
 * invitation panel instead of the invite form.
 */
test("invites a member by email, the invitee accepts, and joins the board", async ({
  page,
  browser,
}) => {
  const boardName = `E2E Membership Board ${Date.now()}`;
  await signUp(page, "admin");
  await createBoard(page, boardName);
  const boardId = new URL(page.url()).pathname.split("/")[2];

  const inviteeEmail = uniqueEmail("invitee");
  await page.goto(`/boards/${boardId}/members`);
  await page.getByLabel("Email address").fill(inviteeEmail);
  await page.getByLabel("Assigned role").selectOption("CONTRIBUTOR");
  await page.getByRole("button", { name: "Send Invite" }).click();
  await expect(page.getByRole("status").filter({ hasText: inviteeEmail })).toBeVisible();
  await expect(page.getByText(inviteeEmail).first()).toBeVisible();

  const token = await latestInvitationToken(inviteeEmail);

  // A separate browser context: the invitee signs up fresh and accepts.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(`/invitations/${token}`);
  await expect(inviteePage.getByRole("heading", { name: boardName })).toBeVisible();
  await expect(inviteePage.getByText(inviteeEmail).first()).toBeVisible();

  await inviteePage.getByRole("link", { name: "Create an account" }).click();
  await inviteePage.getByLabel("Display Name / Studio Handle").fill("Invited Contributor");
  await inviteePage.getByLabel("Email").fill(inviteeEmail);
  await inviteePage.getByLabel("Password").fill(PASSWORD);
  await inviteePage.locator('button[type="submit"]').click();

  // Signing up with the redirect target returns straight to the invitation, then
  // accepting lands the invitee on the board itself.
  await expect(inviteePage).toHaveURL(new RegExp(`/invitations/${token}`));
  await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(inviteePage).toHaveURL(new RegExp(`/boards/${boardId}$`));
  await expect(inviteePage.getByRole("heading", { name: boardName, level: 1 })).toBeVisible();

  // A contributor (no manage rights) sees a read-only invitation panel, not the form.
  await inviteePage.goto(`/boards/${boardId}/members`);
  await expect(inviteePage.getByRole("heading", { name: "Invitations", level: 2 })).toBeVisible();
  await expect(inviteePage.getByLabel("Email address")).toHaveCount(0);
  await expect(
    inviteePage.getByText("Only board admins and managers can invite members."),
  ).toBeVisible();

  await inviteeContext.close();
});
