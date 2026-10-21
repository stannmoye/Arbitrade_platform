import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const start = app.indexOf("function CustomerNotifications()");
const end = app.indexOf("\nfunction AdminAuth(", start);
const notifications = app.slice(start, end);

describe("customer notification accessibility contract", () => {
  it("exposes labelled and busy notification history with announced transient states", () => {
    expect(notifications).toContain('id="customer-notifications-heading"');
    expect(notifications).toContain('id="customer-notifications-description"');
    expect(notifications).toContain('aria-labelledby="customer-notifications-heading"');
    expect(notifications).toContain('aria-describedby="customer-notifications-description"');
    expect(notifications).toContain('aria-label="Notification history"');
    expect(notifications).toContain("aria-busy={firstPage.isLoading||morePage.isFetching}");
    expect(notifications).toContain('role="status" aria-live="polite"');
  });

  it("gives each read action a contextual accessible name", () => {
    expect(notifications).toContain('aria-label={n.readAt?`${n.title} is already read`:`Mark ${n.title} as read`}');
    expect(notifications).toContain('aria-label={unread?`Mark all ${unread} notifications as read`:"All notifications are read"}');
  });
});
