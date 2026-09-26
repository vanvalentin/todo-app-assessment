import nodemailer, { type Transporter } from "nodemailer";
import type { Environment } from "../config/env.js";
import type { Logger } from "../logging.js";

export interface InvitationEmailInput {
  readonly to: string;
  readonly boardName: string;
  readonly inviterName: string;
  readonly role: string;
  readonly acceptUrl: string;
  readonly expiresAt: Date;
}

export interface Mailer {
  sendInvitationEmail(input: InvitationEmailInput): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

export function renderInvitationEmail(input: InvitationEmailInput): { text: string; html: string } {
  const expires = input.expiresAt.toISOString();
  const text =
    `${input.inviterName} invited you to join the "${input.boardName}" board on Ksat as ${input.role}.\n\n` +
    `Accept your invitation: ${input.acceptUrl}\n\n` +
    `This invitation expires at ${expires}.`;
  const html =
    `<p>${escapeHtml(input.inviterName)} invited you to join the &quot;${escapeHtml(input.boardName)}&quot; board on Ksat as ${escapeHtml(input.role)}.</p>` +
    `<p><a href="${escapeHtml(input.acceptUrl)}">Accept your invitation</a></p>` +
    `<p>This invitation expires at ${expires}.</p>`;
  return { text, html };
}

/** Nodemailer SMTP mailer; Mailpit locally, any SMTP relay in a real deployment. */
export function createMailer(environment: Environment): Mailer {
  const transporter: Transporter = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
    auth:
      environment.SMTP_USER && environment.SMTP_PASSWORD
        ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }
        : undefined,
  });

  return {
    async sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
      const { text, html } = renderInvitationEmail(input);
      await transporter.sendMail({
        from: environment.MAIL_FROM,
        to: input.to,
        subject: `You're invited to "${input.boardName}" on Ksat`,
        text,
        html,
      });
    },
  };
}

/** Wraps a mailer so delivery failures are logged and reported, never thrown. */
export async function sendInvitationEmailSafely(
  mailer: Mailer,
  logger: Logger,
  input: InvitationEmailInput,
): Promise<"SENT" | "FAILED"> {
  try {
    await mailer.sendInvitationEmail(input);
    return "SENT";
  } catch (error) {
    logger.warn({ err: error, to: input.to }, "Invitation email delivery failed");
    return "FAILED";
  }
}
