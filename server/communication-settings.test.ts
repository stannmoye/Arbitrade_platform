import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_TEMPLATE_DEFINITIONS,
  DEFAULT_COMMUNICATION_SETTINGS,
  buildWhatsAppContactUrl,
  getUnknownMessagePlaceholders,
  isSecureDocumentationUrl,
  isValidWhatsAppNumber,
  normalizeCommunicationSettings,
  normalizeWhatsAppNumber,
  renderMessageTemplate,
  validateCommunicationSettings,
  type CommunicationSettings,
} from "../shared/communication";
import { validateCommunicationSettingsInput } from "./communicationSettings";

describe("admin communication settings rules", () => {
  it("normalizes international phone numbers and builds safe click-to-chat links", () => {
    expect(normalizeWhatsAppNumber("+234 (801) 234-5678")).toBe("2348012345678");
    expect(isValidWhatsAppNumber("+234 801 234 5678")).toBe(true);
    expect(isValidWhatsAppNumber("support@example.com")).toBe(false);
    expect(buildWhatsAppContactUrl("abc12345678", "hello")).toBeNull();

    const link = buildWhatsAppContactUrl("+234 801 234 5678", "Hi there\nA & B?");
    expect(link).toBe("https://wa.me/2348012345678?text=Hi%20there%0AA%20%26%20B%3F");
    expect(new URL(link as string).hostname).toBe("wa.me");
  });

  it("renders only the supported placeholders without interpreting message text as HTML", () => {
    expect(renderMessageTemplate("Hello {{customerName}} · {{customerEmail}} · {{reference}}", {
      customerName: "<Alex>",
      customerEmail: "alex@example.com",
      reference: "ACT-10",
    })).toBe("Hello <Alex> · alex@example.com · ACT-10");
    expect(renderMessageTemplate("Not recognized: {{secretToken}}")).toBe("Not recognized: ");
    expect(getUnknownMessagePlaceholders("{{customerName}} {{extra}} {{ extra }} {{extra}}")).toEqual(["extra"]);
  });

  it("supplies all six default support templates and validates the baseline", () => {
    expect(COMMUNICATION_TEMPLATE_DEFINITIONS).toHaveLength(6);
    expect(validateCommunicationSettings(DEFAULT_COMMUNICATION_SETTINGS)).toEqual([]);
    expect(Object.keys(DEFAULT_COMMUNICATION_SETTINGS.templates)).toHaveLength(6);
  });

  it("rejects invalid enabled contacts, unknown placeholders and insecure provider documentation", () => {
    const invalid = normalizeCommunicationSettings(DEFAULT_COMMUNICATION_SETTINGS) as CommunicationSettings;
    invalid.whatsapp.enabled = true;
    invalid.whatsapp.phoneNumber = "not-a-number";
    invalid.templates.generalSupport.body += " {{unapprovedField}}";
    invalid.walletProvider.documentationUrl = "http://provider.example/docs";

    const errors = validateCommunicationSettings(invalid);
    expect(errors.join(" ")).toContain("valid international WhatsApp number");
    expect(errors.join(" ")).toContain("unapprovedField");
    expect(errors.join(" ")).toContain("HTTPS");
    expect(isSecureDocumentationUrl("https://provider.example/docs")).toBe(true);
    expect(isSecureDocumentationUrl("https://user:password@provider.example/docs")).toBe(false);
    expect(isSecureDocumentationUrl("http://provider.example/docs")).toBe(false);
  });

  it("normalizes broken or partial persisted JSON without throwing", () => {
    expect(normalizeCommunicationSettings(null).whatsapp.enabled).toBe(false);
    expect(normalizeCommunicationSettings({ templates: { generalSupport: { enabled: false, title: "Help", body: "Hello" } } }).templates.generalSupport)
      .toEqual({ enabled: false, title: "Help", body: "Hello" });
    expect(normalizeCommunicationSettings({ whatsapp: { enabled: "true", phoneNumber: ["invalid"] } }).whatsapp)
      .toEqual({ enabled: false, phoneNumber: "", displayName: "Arbitrade Support" });
  });

  it("validates the API payload and prevents saving an enabled contact without a valid number", () => {
    expect(validateCommunicationSettingsInput(DEFAULT_COMMUNICATION_SETTINGS)).toEqual([]);
    const invalid = normalizeCommunicationSettings(DEFAULT_COMMUNICATION_SETTINGS);
    invalid.whatsapp.enabled = true;
    expect(validateCommunicationSettingsInput(invalid).join(" ")).toContain("valid international WhatsApp number");
    expect(validateCommunicationSettingsInput({ templates: {} }).length).toBeGreaterThan(0);
  });
});

describe("communication settings integration contract", () => {
  async function source(path: string) {
    return readFile(new URL(path, import.meta.url), "utf8");
  }

  it("keeps settings persistence admin-only and customer contact data protected", async () => {
    const router = await source("./routers.ts");
    const service = await source("./communicationSettings.ts");
    expect(router).toContain("updateCommunicationSettings: adminProcedure");
    expect(router).toContain("communicationSettings: adminProcedure.query");
    expect(router).toContain("communicationOptions: protectedProcedure.query");
    expect(service).toContain('getAppSetting("communications.settings")');
    expect(service).toContain('setAppSetting("communications.settings", JSON.stringify(settings), updatedBy)');
    expect(service).not.toMatch(/apiKey|clientSecret|privateKey/i);
  });

  it("exposes the template editor in admin navigation and uses its saved templates in Support Centre", async () => {
    const nav = await source("../client/src/admin-navigation.ts");
    const app = await source("../client/src/App.tsx");
    const component = await source("../client/src/components/AdminCommunicationSettings.tsx");
    expect(nav).toContain('target: "communicationSettings"');
    expect(app).toContain('section==="communicationSettings"');
    expect(app).toContain("trpc.customer.communicationOptions.useQuery");
    expect(app).toContain("buildWhatsAppContactUrl");
    expect(app).toContain('target="_blank" rel="noopener noreferrer"');
    expect(component).toContain("trpc.adminOperations.updateCommunicationSettings.useMutation");
    expect(component).toContain("validateCommunicationSettings(draft)");
    expect(component).toContain("Provider execution is not implemented or enabled by this form");
  });
});
