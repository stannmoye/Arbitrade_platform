const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInitialAccountInput(env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(env.ADMIN_PASSWORD || "");
  const customerEmail = String(env.CUSTOMER_EMAIL || "").trim().toLowerCase();
  const customerPassword = String(env.CUSTOMER_PASSWORD || "");

  if (!EMAIL_PATTERN.test(adminEmail) || adminEmail.length > 320) {
    throw new Error("A valid ADMIN_EMAIL is required for a fresh installation.");
  }
  if (!EMAIL_PATTERN.test(customerEmail) || customerEmail.length > 320) {
    throw new Error("A valid CUSTOMER_EMAIL is required for a fresh installation.");
  }
  if (adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }
  if (customerPassword.length < 12) {
    throw new Error("CUSTOMER_PASSWORD must contain at least 12 characters.");
  }
  if (adminEmail === customerEmail) {
    throw new Error("Administrator and customer accounts must use different email addresses.");
  }
  if (adminPassword === customerPassword) {
    throw new Error("Administrator and customer passwords must be different.");
  }

  return { adminEmail, adminPassword, customerEmail, customerPassword };
}
