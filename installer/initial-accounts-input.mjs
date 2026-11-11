const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInitialAccountInput(env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(env.ADMIN_PASSWORD || "");

  if (!EMAIL_PATTERN.test(adminEmail) || adminEmail.length > 320) {
    throw new Error("A valid ADMIN_EMAIL is required for a fresh installation.");
  }
  if (adminPassword.length < 12 || adminPassword.length > 200) {
    throw new Error("ADMIN_PASSWORD must contain between 12 and 200 characters.");
  }

  return { adminEmail, adminPassword };
}
