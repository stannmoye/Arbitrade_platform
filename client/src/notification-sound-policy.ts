export type NotificationSoundKey =
  | "default"
  | "deposit"
  | "credit"
  | "debit"
  | "withdrawal"
  | "trading"
  | "mining"
  | "support"
  | "announcement"
  | "failure";

/**
 * Keep the customer notification category-to-audio mapping deterministic and
 * independently testable. Unknown and future categories safely use the default.
 */
export function notificationSoundKeyForCategory(category?: string | null): NotificationSoundKey {
  switch (category) {
    case "deposit":
      return "deposit";
    case "ledger_credit":
      return "credit";
    case "ledger_debit":
      return "debit";
    case "withdrawal":
      return "withdrawal";
    case "trading":
    case "trading_reward":
      return "trading";
    case "mining":
    case "mining_reward":
      return "mining";
    case "support":
      return "support";
    case "announcement":
    case "promotion":
    case "platform_update":
      return "announcement";
    case "security":
      return "failure";
    default:
      return "default";
  }
}
