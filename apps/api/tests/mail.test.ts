import { describe, expect, it } from "vitest";
import { renderInvitationEmail } from "../src/infrastructure/mail.js";

describe("invitation email rendering", () => {
  it("escapes user-controlled values in the HTML part", () => {
    const rendered = renderInvitationEmail({
      to: "invitee@example.test",
      inviterName: '<img src=x onerror="alert(1)">',
      boardName: "Road & <b>Board</b>",
      role: "<em>CONTRIBUTOR</em>",
      acceptUrl: 'https://example.test/invite?next="unsafe"&mode=accept',
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(rendered.text).toContain('<img src=x onerror="alert(1)">');
    expect(rendered.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(rendered.html).toContain("Road &amp; &lt;b&gt;Board&lt;/b&gt;");
    expect(rendered.html).toContain("&lt;em&gt;CONTRIBUTOR&lt;/em&gt;");
    expect(rendered.html).toContain("next=&quot;unsafe&quot;&amp;mode=accept");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).not.toContain("<em>");
  });
});
