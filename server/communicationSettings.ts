import { z } from "zod";
import {
  COMMUNICATION_TEMPLATE_DEFINITIONS,
  DEFAULT_COMMUNICATION_SETTINGS,
  isSecureDocumentationUrl,
  isValidWhatsAppNumber,
  normalizeCommunicationSettings,
  normalizeWhatsAppNumber,
  validateCommunicationSettings,
  type CommunicationSettings,
} from "../shared/communication";
import { getAppSetting, setAppSetting } from "./db";

const templateInput = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  body: z.string().max(3000),
});

export const communicationSettingsInput = z.object({
  whatsapp: z.object({
    enabled: z.boolean(),
    phoneNumber: z.string().max(24),
    displayName: z.string().max(120),
  }),
  templates: z.object({
    generalSupport: templateInput,
    accountAccess: templateInput,
    walletQuestion: templateInput,
    transactionQuestion: templateInput,
    privacyQuestion: templateInput,
    securityConcern: templateInput,
  }),
  walletProvider: z.object({
    providerName: z.string().max(120),
    accountLabel: z.string().max(160),
    documentationUrl: z.string().trim().max(500),
  }),
});

export type CommunicationSettingsInput = z.infer<typeof communicationSettingsInput>;

export function validateCommunicationSettingsInput(value: unknown): string[] {
  const parsed = communicationSettingsInput.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(issue => issue.message);
  const settings = normalizeCommunicationSettings(parsed.data);
  const errors = validateCommunicationSettings(settings);
  if (settings.walletProvider.documentationUrl && !isSecureDocumentationUrl(settings.walletProvider.documentationUrl)) {
    errors.push("Use an HTTPS documentation URL without embedded credentials.");
  }
  if (settings.whatsapp.enabled && !isValidWhatsAppNumber(settings.whatsapp.phoneNumber)) {
    errors.push("Enter a valid international WhatsApp number before enabling the contact link.");
  }
  return Array.from(new Set(errors));
}

export async function getAdminCommunicationSettings(): Promise<CommunicationSettings> {
  const raw = await getAppSetting("communications.settings");
  if (!raw) return normalizeCommunicationSettings(DEFAULT_COMMUNICATION_SETTINGS);
  try {
    return normalizeCommunicationSettings(JSON.parse(raw));
  } catch {
    // A malformed settings row must not break the admin workspace. The next save
    // replaces this single JSON document after the administrator reviews it.
    return normalizeCommunicationSettings(DEFAULT_COMMUNICATION_SETTINGS);
  }
}

export async function saveAdminCommunicationSettings(
  updatedBy: number,
  value: unknown,
): Promise<CommunicationSettings> {
  const parsed = communicationSettingsInput.parse(value);
  const errors = validateCommunicationSettingsInput(parsed);
  if (errors.length) throw new Error(errors[0]);
  const settings = normalizeCommunicationSettings(parsed);
  await setAppSetting("communications.settings", JSON.stringify(settings), updatedBy);
  return settings;
}

export async function getCustomerCommunicationOptions(
  customerName?: string | null,
  customerEmail?: string | null,
) {
  const settings = await getAdminCommunicationSettings();
  const whatsappEnabled = settings.whatsapp.enabled && isValidWhatsAppNumber(settings.whatsapp.phoneNumber);
  const templates = whatsappEnabled
    ? COMMUNICATION_TEMPLATE_DEFINITIONS
        .filter(definition => settings.templates[definition.key].enabled)
        .map(definition => ({
          key: definition.key,
          label: definition.label,
          title: settings.templates[definition.key].title,
          body: settings.templates[definition.key].body,
        }))
    : [];
  return {
    whatsapp: {
      enabled: whatsappEnabled,
      phoneNumber: whatsappEnabled ? normalizeWhatsAppNumber(settings.whatsapp.phoneNumber) : "",
      displayName: settings.whatsapp.displayName,
    },
    templates,
    customerName: (customerName || "").slice(0, 200),
    customerEmail: (customerEmail || "").slice(0, 320),
    platformName: "Arbitrade",
  };
}
