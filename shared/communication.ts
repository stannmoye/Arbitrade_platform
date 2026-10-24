export const COMMUNICATION_TEMPLATE_DEFINITIONS = [
  {
    key: "generalSupport",
    label: "General support",
    description: "A general message to begin a support conversation.",
    defaultTitle: "General support enquiry",
    defaultBody: "Hello {{platformName}} Support, my name is {{customerName}} ({{customerEmail}}). I need help with my account.",
  },
  {
    key: "accountAccess",
    label: "Account access",
    description: "Help with sign-in, profile access or account settings.",
    defaultTitle: "Account access help",
    defaultBody: "Hello {{platformName}} Support, I need help accessing my account. My registered email is {{customerEmail}}.",
  },
  {
    key: "walletQuestion",
    label: "Wallet question",
    description: "A question about wallet settings or recorded balances.",
    defaultTitle: "Wallet question",
    defaultBody: "Hello {{platformName}} Support, I have a question about the wallet records linked to my account ({{customerEmail}}).",
  },
  {
    key: "transactionQuestion",
    label: "Transaction question",
    description: "Ask for help reviewing an account activity record.",
    defaultTitle: "Transaction review",
    defaultBody: "Hello {{platformName}} Support, please help me review an account activity record. Reference: {{reference}}. Registered email: {{customerEmail}}.",
  },
  {
    key: "privacyQuestion",
    label: "Privacy enquiry",
    description: "Ask a question about the published notice or a privacy request.",
    defaultTitle: "Privacy enquiry",
    defaultBody: "Hello {{platformName}} Support, I have a privacy enquiry. Please direct me to the appropriate privacy contact. Registered email: {{customerEmail}}.",
  },
  {
    key: "securityConcern",
    label: "Security concern",
    description: "Report a security concern without sending secrets in a message.",
    defaultTitle: "Security concern",
    defaultBody: "Hello {{platformName}} Support, I need help with an account security concern. My registered email is {{customerEmail}}. I will not send passwords or one-time codes in this message.",
  },
] as const;

export type CommunicationTemplateKey = (typeof COMMUNICATION_TEMPLATE_DEFINITIONS)[number]["key"];

export type CommunicationTemplate = {
  enabled: boolean;
  title: string;
  body: string;
};

export type CommunicationSettings = {
  whatsapp: {
    enabled: boolean;
    phoneNumber: string;
    displayName: string;
  };
  templates: Record<CommunicationTemplateKey, CommunicationTemplate>;
  walletProvider: {
    providerName: string;
    accountLabel: string;
    documentationUrl: string;
  };
};

export const DEFAULT_COMMUNICATION_SETTINGS: CommunicationSettings = {
  whatsapp: {
    enabled: false,
    phoneNumber: "",
    displayName: "Arbitrade Support",
  },
  templates: {
    generalSupport: { enabled: true, title: "General support enquiry", body: "Hello {{platformName}} Support, my name is {{customerName}} ({{customerEmail}}). I need help with my account." },
    accountAccess: { enabled: true, title: "Account access help", body: "Hello {{platformName}} Support, I need help accessing my account. My registered email is {{customerEmail}}." },
    walletQuestion: { enabled: true, title: "Wallet question", body: "Hello {{platformName}} Support, I have a question about the wallet records linked to my account ({{customerEmail}})." },
    transactionQuestion: { enabled: true, title: "Transaction review", body: "Hello {{platformName}} Support, please help me review an account activity record. Reference: {{reference}}. Registered email: {{customerEmail}}." },
    privacyQuestion: { enabled: true, title: "Privacy enquiry", body: "Hello {{platformName}} Support, I have a privacy enquiry. Please direct me to the appropriate privacy contact. Registered email: {{customerEmail}}." },
    securityConcern: { enabled: true, title: "Security concern", body: "Hello {{platformName}} Support, I need help with an account security concern. My registered email is {{customerEmail}}. I will not send passwords or one-time codes in this message." },
  },
  walletProvider: {
    providerName: "",
    accountLabel: "",
    documentationUrl: "",
  },
};

export const COMMUNICATION_TEMPLATE_PLACEHOLDERS = [
  "customerName",
  "customerEmail",
  "platformName",
  "date",
  "reference",
] as const;

export type CommunicationTemplateValues = Partial<Record<(typeof COMMUNICATION_TEMPLATE_PLACEHOLDERS)[number], string>>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

export function normalizeWhatsAppNumber(value: string): string {
  const compact = String(value || "").trim().replace(/[\s().-]/g, "");
  return /^\+?[1-9]\d{7,14}$/.test(compact) ? compact.replace(/^\+/, "") : "";
}

export function isValidWhatsAppNumber(value: string): boolean {
  return normalizeWhatsAppNumber(value).length > 0;
}

export function buildWhatsAppContactUrl(phoneNumber: string, message: string): string | null {
  const normalizedPhone = normalizeWhatsAppNumber(phoneNumber);
  if (!normalizedPhone) return null;
  return "https://wa.me/" + normalizedPhone + "?text=" + encodeURIComponent(message);
}

export function isSecureDocumentationUrl(value: string): boolean {
  const candidate = String(value || "").trim();
  if (!candidate) return true;
  if (candidate.length > 500) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function getUnknownMessagePlaceholders(value: string): string[] {
  const allowed = new Set<string>(COMMUNICATION_TEMPLATE_PLACEHOLDERS);
  const found = Array.from(value.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g), match => match[1]);
  return Array.from(new Set(found.filter(key => !allowed.has(key))));
}

export function renderMessageTemplate(template: string, values: CommunicationTemplateValues = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (!COMMUNICATION_TEMPLATE_PLACEHOLDERS.includes(key as (typeof COMMUNICATION_TEMPLATE_PLACEHOLDERS)[number])) return "";
    const value = values[key as keyof CommunicationTemplateValues];
    return typeof value === "string" ? value : "";
  });
}

function normalizeTemplate(value: unknown, fallback: CommunicationTemplate): CommunicationTemplate {
  const raw = asRecord(value);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    title: readString(raw.title, fallback.title, 120),
    body: readString(raw.body, fallback.body, 3000),
  };
}

export function normalizeCommunicationSettings(value: unknown): CommunicationSettings {
  const raw = asRecord(value);
  const whatsapp = asRecord(raw.whatsapp);
  const templates = asRecord(raw.templates);
  const walletProvider = asRecord(raw.walletProvider);
  return {
    whatsapp: {
      enabled: whatsapp.enabled === true,
      phoneNumber: readString(whatsapp.phoneNumber, DEFAULT_COMMUNICATION_SETTINGS.whatsapp.phoneNumber, 24),
      displayName: readString(whatsapp.displayName, DEFAULT_COMMUNICATION_SETTINGS.whatsapp.displayName, 120),
    },
    templates: {
      generalSupport: normalizeTemplate(templates.generalSupport, DEFAULT_COMMUNICATION_SETTINGS.templates.generalSupport),
      accountAccess: normalizeTemplate(templates.accountAccess, DEFAULT_COMMUNICATION_SETTINGS.templates.accountAccess),
      walletQuestion: normalizeTemplate(templates.walletQuestion, DEFAULT_COMMUNICATION_SETTINGS.templates.walletQuestion),
      transactionQuestion: normalizeTemplate(templates.transactionQuestion, DEFAULT_COMMUNICATION_SETTINGS.templates.transactionQuestion),
      privacyQuestion: normalizeTemplate(templates.privacyQuestion, DEFAULT_COMMUNICATION_SETTINGS.templates.privacyQuestion),
      securityConcern: normalizeTemplate(templates.securityConcern, DEFAULT_COMMUNICATION_SETTINGS.templates.securityConcern),
    },
    walletProvider: {
      providerName: readString(walletProvider.providerName, "", 120),
      accountLabel: readString(walletProvider.accountLabel, "", 160),
      documentationUrl: readString(walletProvider.documentationUrl, "", 500),
    },
  };
}

export function validateCommunicationSettings(settings: CommunicationSettings): string[] {
  const errors: string[] = [];
  if (settings.whatsapp.enabled && !isValidWhatsAppNumber(settings.whatsapp.phoneNumber)) {
    errors.push("Enter a valid international WhatsApp number before enabling the contact link.");
  }
  if (settings.whatsapp.enabled && !settings.whatsapp.displayName.trim()) {
    errors.push("Enter a display name before enabling WhatsApp contact.");
  }
  if (!isSecureDocumentationUrl(settings.walletProvider.documentationUrl)) {
    errors.push("Use an HTTPS documentation URL without embedded credentials.");
  }
  for (const definition of COMMUNICATION_TEMPLATE_DEFINITIONS) {
    const template = settings.templates[definition.key];
    if (!template.title.trim()) errors.push(definition.label + " needs a title.");
    if (!template.body.trim()) errors.push(definition.label + " needs a message body.");
    const unknown = getUnknownMessagePlaceholders(template.body);
    if (unknown.length) {
      errors.push(definition.label + " contains unsupported placeholder(s): " + unknown.join(", ") + ".");
    }
  }
  return errors;
}
