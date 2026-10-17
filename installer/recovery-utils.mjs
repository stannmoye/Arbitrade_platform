const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const ANSI_ESCAPE_SEQUENCES = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

/**
 * Makes untrusted marker metadata safe for a single-line terminal display.
 * This is display sanitization only; callers must still validate values before
 * using them to select behavior or file paths.
 */
export function safeDisplayText(value, fallback = "unknown", maxLength = 80) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(ANSI_ESCAPE_SEQUENCES, "").replace(CONTROL_CHARACTERS, "").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, Math.max(1, Math.min(Number(maxLength) || 80, 80)));
}

/**
 * Failure detail may originate in a child process and can contain credentials,
 * connection strings, or user-controlled terminal output. Never echo it.
 */
export function safeFailureDetail(_value) {
  return "See private terminal output.";
}
