import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  packageName: varchar("packageName", { length: 40 }).default("Starter").notNull(),
  reportingTimezone: varchar("reportingTimezone", { length: 80 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const customerControls = mysqlTable("customer_controls", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accountStatus: mysqlEnum("accountStatus", ["active", "suspended", "restricted"]).default("active").notNull(),
  tradingEnabled: boolean("tradingEnabled").default(true).notNull(),
  opportunitiesEnabled: boolean("opportunitiesEnabled").default(true).notNull(),
  autoTradeEnabled: boolean("autoTradeEnabled").default(true).notNull(),
  autoTradeAmountMinor: int("autoTradeAmountMinor").default(10000).notNull(),
  autoTradeMinRewardBps: int("autoTradeMinRewardBps").default(0).notNull(),
  autoTradeDailyLimit: int("autoTradeDailyLimit").default(5).notNull(),
  withdrawalsEnabled: boolean("withdrawalsEnabled").default(false).notNull(),
  kycRequired: boolean("kycRequired").default(true).notNull(),
  twoFactorRequired: boolean("twoFactorRequired").default(false).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  riskTier: varchar("riskTier", { length: 24 }).default("standard").notNull(),
  dailyTradeLimitMinor: int("dailyTradeLimitMinor").default(2500000).notNull(),
  adminNote: text("adminNote"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerSessions = mysqlTable("customer_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceLabel: varchar("deviceLabel", { length: 160 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 128 }),
  countryCode: varchar("countryCode", { length: 8 }),
  userAgent: text("userAgent"),
  isCurrent: boolean("isCurrent").default(true).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const riskReports = mysqlTable("risk_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  requestedFor: varchar("requestedFor", { length: 200 }),
  status: mysqlEnum("status", ["requested", "in_review", "ready", "closed"]).default("requested").notNull(),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  ticketNumber: varchar("ticketNumber", { length: 32 }).notNull().unique(),
  customerId: int("customerId").notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  category: varchar("category", { length: 40 }).default("account").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  status: mysqlEnum("status", ["open", "answered", "resolved", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const supportMessages = mysqlTable("support_messages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  authorId: int("authorId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const supportAttachments = mysqlTable("support_attachments", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  messageId: int("messageId"),
  uploadedBy: int("uploadedBy").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerNotifications = mysqlTable("customer_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 120 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const opportunityPackagePolicies = mysqlTable("opportunity_package_policies", {
  id: int("id").autoincrement().primaryKey(),
  packageName: varchar("packageName", { length: 40 }).notNull().unique(),
  maxPopupsPerMinute: int("maxPopupsPerMinute").default(10).notNull(),
  maxVisibleOffers: int("maxVisibleOffers").default(10).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerBalances = mysqlTable("customer_balances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  availableMinor: int("availableMinor").default(0).notNull(),
  lockedMinor: int("lockedMinor").default(0).notNull(),
  promotionalMinor: int("promotionalMinor").default(0).notNull(),
  earnedMinor: int("earnedMinor").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const currencyRegistry = mysqlTable("currency_registry", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  scale: int("scale").default(2).notNull(),
  assetType: mysqlEnum("assetType", ["fiat", "crypto", "token"]).default("fiat").notNull(),
  usdRate: varchar("usdRate", { length: 64 }).default("1").notNull(),
  rateProvider: varchar("rateProvider", { length: 120 }).default("manual").notNull(),
  externalCode: varchar("externalCode", { length: 80 }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const balanceLedger = mysqlTable("balance_ledger", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  amountMinor: int("amountMinor").notNull(),
  entryType: varchar("entryType", { length: 40 }).notNull(),
  reference: varchar("reference", { length: 80 }).notNull(),
  withdrawable: boolean("withdrawable").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const opportunityOffers = mysqlTable("opportunity_offers", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 40 }).notNull(),
  venueFrom: varchar("venueFrom", { length: 80 }).notNull(),
  venueTo: varchar("venueTo", { length: 80 }).notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  minimumMinor: int("minimumMinor").notNull(),
  expectedRewardBps: int("expectedRewardBps").notNull(),
  durationSeconds: int("durationSeconds").notNull(),
  opensAt: timestamp("opensAt").notNull(),
  closesAt: timestamp("closesAt").notNull(),
  rewardAt: timestamp("rewardAt").notNull(),
  status: mysqlEnum("status", ["scheduled", "open", "closed", "settled", "cancelled"]).default("open").notNull(),
  instrumentId: int("instrumentId"),
  marketSnapshotId: int("marketSnapshotId"),
  marketValueUsd: varchar("marketValueUsd", { length: 64 }),
  sector: varchar("sector", { length: 120 }),
  industry: varchar("industry", { length: 160 }),
  listingStatus: varchar("listingStatus", { length: 40 }),
  marketObservedAt: timestamp("marketObservedAt"),
  simulationSeed: varchar("simulationSeed", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export const marketInstruments = mysqlTable("market_instruments", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 240 }).notNull(),
  exchange: varchar("exchange", { length: 80 }),
  country: varchar("country", { length: 80 }),
  sector: varchar("sector", { length: 120 }),
  industry: varchar("industry", { length: 160 }),
  listingStatus: varchar("listingStatus", { length: 40 }).default("active").notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  rawJson: text("rawJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export const marketSnapshots = mysqlTable("market_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  instrumentId: int("instrumentId").notNull(),
  priceUsd: varchar("priceUsd", { length: 64 }),
  marketValueUsd: varchar("marketValueUsd", { length: 64 }),
  volume: varchar("volume", { length: 64 }),
  netChange: varchar("netChange", { length: 64 }),
  percentChange: varchar("percentChange", { length: 64 }),
  observedAt: timestamp("observedAt").notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  rawJson: text("rawJson").notNull(),
});
export const fxRateSnapshots = mysqlTable("fx_rate_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  baseAsset: varchar("baseAsset", { length: 16 }).notNull(),
  quoteAsset: varchar("quoteAsset", { length: 16 }).notNull(),
  rate: varchar("rate", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  sourceDate: varchar("sourceDate", { length: 16 }),
  observedAt: timestamp("observedAt").defaultNow().notNull(),
  rawJson: text("rawJson").notNull(),
});

export const missedOpportunities = mysqlTable("missed_opportunities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  offerId: int("offerId").notNull(),
  symbol: varchar("symbol", { length: 40 }).notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  amountMinor: int("amountMinor").notNull(),
  potentialRewardMinor: int("potentialRewardMinor").notNull(),
  expectedRewardBps: int("expectedRewardBps").notNull(),
  reason: varchar("reason", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["MISSED", "EXECUTED"]).default("MISSED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tradePositions = mysqlTable("trade_positions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  offerId: int("offerId").notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  principalMinor: int("principalMinor").notNull(),
  expectedRewardMinor: int("expectedRewardMinor").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "settled", "cancelled"]).default("confirmed").notNull(),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  settlesAt: timestamp("settlesAt").notNull(),
  settledAt: timestamp("settledAt"),
});

export const assetPrecisions = mysqlTable("asset_precisions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  scale: int("scale").notNull(),
  minimumUnit: varchar("minimumUnit", { length: 64 }).notNull(),
  roundingMode: mysqlEnum("roundingMode", ["half_up", "down", "up", "half_even"]).default("half_up").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 512 }),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tradingTypes = mysqlTable("trading_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  description: text("description"),
  mode: mysqlEnum("mode", ["PRACTICE", "SIMULATION", "RESEARCH", "LIVE"]).default("PRACTICE").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const packages = mysqlTable("packages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  startsAt: timestamp("startsAt"),
  expiresAt: timestamp("expiresAt"),
  maxPopupsPerMinute: int("maxPopupsPerMinute").default(0).notNull(),
  maxActiveInvestments: int("maxActiveInvestments").default(0).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const packageEntitlements = mysqlTable("package_entitlements", {
  id: int("id").autoincrement().primaryKey(),
  packageId: int("packageId").notNull(),
  entitlementKey: varchar("entitlementKey", { length: 120 }).notNull(),
  entitlementValue: varchar("entitlementValue", { length: 512 }).notNull(),
});

export const customerPackageSubscriptions = mysqlTable("customer_package_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  packageId: int("packageId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  expiresAt: timestamp("expiresAt"),
  status: mysqlEnum("status", ["active", "expired", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5Opportunities = mysqlTable("v5_opportunities", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  tradingTypeId: int("tradingTypeId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  practiceMode: mysqlEnum("practiceMode", ["PRACTICE", "SIMULATION", "RESEARCH"]).default("PRACTICE").notNull(),
  currency: varchar("currency", { length: 32 }).notNull(),
  fixedInvestment: varchar("fixedInvestment", { length: 128 }).notNull(),
  grossProfitRate: varchar("grossProfitRate", { length: 128 }).notNull(),
  durationSeconds: int("durationSeconds").notNull(),
  status: mysqlEnum("status", ["DRAFT", "ACTIVE", "PAUSED", "DISABLED", "EXPIRED"]).default("DRAFT").notNull(),
  maxPurchases: int("maxPurchases"),
  currentPurchases: int("currentPurchases").default(0).notNull(),
  eligibilityJson: text("eligibilityJson"),
  startsAt: timestamp("startsAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const v5Purchases = mysqlTable("v5_purchases", {
  id: int("id").autoincrement().primaryKey(),
  opportunityId: int("opportunityId").notNull(),
  userId: int("userId").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "EXPIRED"]).default("PENDING").notNull(),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  successfulAt: timestamp("successfulAt"),
  failureReason: varchar("failureReason", { length: 255 }),
});

export const v5SuccessfulPurchaseKeys = mysqlTable("v5_successful_purchase_keys", {
  id: int("id").autoincrement().primaryKey(),
  opportunityId: int("opportunityId").notNull(),
  userId: int("userId").notNull(),
  purchaseId: int("purchaseId").notNull(),
});

export const v5Wallets = mysqlTable("v5_wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  assetCode: varchar("assetCode", { length: 32 }).notNull(),
  availableAmount: varchar("availableAmount", { length: 128 }).default("0").notNull(),
  lockedAmount: varchar("lockedAmount", { length: 128 }).default("0").notNull(),
  pendingAmount: varchar("pendingAmount", { length: 128 }).default("0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const v5WalletLedger = mysqlTable("v5_wallet_ledger", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull(),
  entryType: varchar("entryType", { length: 40 }).notNull(),
  amount: varchar("amount", { length: 128 }).notNull(),
  assetCode: varchar("assetCode", { length: 32 }).notNull(),
  referenceType: varchar("referenceType", { length: 80 }).notNull(),
  referenceId: varchar("referenceId", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  reversalOfId: int("reversalOfId"),
  precisionSnapshotJson: text("precisionSnapshotJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5IdempotencyKeys = mysqlTable("v5_idempotency_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  keyValue: varchar("keyValue", { length: 160 }).notNull().unique(),
  command: varchar("command", { length: 120 }).notNull(),
  resultJson: text("resultJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5AuditEvents = mysqlTable("v5_audit_events", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  action: varchar("action", { length: 160 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 128 }).notNull(),
  reason: text("reason"),
  reference: varchar("reference", { length: 160 }),
  metadataJson: text("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5FundingPlans = mysqlTable("v5_funding_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  destinationAsset: varchar("destinationAsset", { length: 32 }).notNull(),
  destinationAmount: varchar("destinationAmount", { length: 128 }).notNull(),
  sourcesJson: text("sourcesJson").notNull(),
  status: mysqlEnum("status", ["QUOTED", "APPROVED", "EXECUTED", "FAILED"]).default("QUOTED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5FxQuotes = mysqlTable("v5_fx_quotes", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 120 }).notNull(),
  fromAsset: varchar("fromAsset", { length: 32 }).notNull(),
  toAsset: varchar("toAsset", { length: 32 }).notNull(),
  sourceAmount: varchar("sourceAmount", { length: 128 }).notNull(),
  destinationAmount: varchar("destinationAmount", { length: 128 }).notNull(),
  rate: varchar("rate", { length: 128 }).notNull(),
  fee: varchar("fee", { length: 128 }).notNull(),
  spread: varchar("spread", { length: 128 }).notNull(),
  quotedAt: timestamp("quotedAt").notNull(),
  validUntil: timestamp("validUntil").notNull(),
  status: mysqlEnum("status", ["QUOTED", "EXECUTED", "EXPIRED", "REJECTED"]).default("QUOTED").notNull(),
  reference: varchar("reference", { length: 160 }).notNull(),
});

export const v5Conversions = mysqlTable("v5_conversions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  quoteId: int("quoteId").notNull(),
  fundingPlanId: int("fundingPlanId").notNull(),
  sourceAsset: varchar("sourceAsset", { length: 32 }).notNull(),
  destinationAsset: varchar("destinationAsset", { length: 32 }).notNull(),
  sourceAmount: varchar("sourceAmount", { length: 128 }).notNull(),
  destinationAmount: varchar("destinationAmount", { length: 128 }).notNull(),
  executionRate: varchar("executionRate", { length: 128 }).notNull(),
  fee: varchar("fee", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["PENDING", "COMPLETED", "FAILED", "REVERSED"]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5Investments = mysqlTable("v5_investments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  opportunityId: int("opportunityId").notNull(),
  purchaseId: int("purchaseId").notNull(),
  principalAmount: varchar("principalAmount", { length: 128 }).notNull(),
  assetCode: varchar("assetCode", { length: 32 }).notNull(),
  settlementWalletId: int("settlementWalletId").notNull(),
  settlementAsset: varchar("settlementAsset", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "PENDING_SETTLEMENT", "SETTLED_PROFIT", "SETTLED_ZERO", "SETTLED_LOSS", "FAILED_SETTLEMENT", "CANCELLED", "REVERSED"]).default("ACTIVE").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  settlesAt: timestamp("settlesAt").notNull(),
  tradingTypeSnapshot: varchar("tradingTypeSnapshot", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5Settlements = mysqlTable("v5_settlements", {
  id: int("id").autoincrement().primaryKey(),
  investmentId: int("investmentId").notNull().unique(),
  status: varchar("status", { length: 40 }).notNull(),
  principalAmount: varchar("principalAmount", { length: 128 }).notNull(),
  grossProfit: varchar("grossProfit", { length: 128 }).notNull(),
  fees: varchar("fees", { length: 128 }).notNull(),
  takeHomeProfit: varchar("takeHomeProfit", { length: 128 }).notNull(),
  totalReturned: varchar("totalReturned", { length: 128 }).notNull(),
  resultReference: varchar("resultReference", { length: 160 }),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  settledAt: timestamp("settledAt").defaultNow().notNull(),
});

export const v5Reports = mysqlTable("v5_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reportingDate: varchar("reportingDate", { length: 10 }).notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  periodStartUtc: timestamp("periodStartUtc").notNull(),
  periodEndUtc: timestamp("periodEndUtc").notNull(),
  status: mysqlEnum("status", ["GENERATED", "FAILED"]).default("GENERATED").notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const v5EmailJobs = mysqlTable("v5_email_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reportId: int("reportId").notNull(),
  status: mysqlEnum("status", ["QUEUED", "PROCESSING", "SENT", "FAILED", "RETRYING", "SUPPRESSED"]).notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerTimezoneHistory = mysqlTable("customer_timezone_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  effectiveFrom: timestamp("effectiveFrom").notNull(),
  effectiveUntil: timestamp("effectiveUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerEmailPreferences = mysqlTable("customer_email_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  dailyTradingReports: boolean("dailyTradingReports").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const v5FailedJobs = mysqlTable("v5_failed_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobType: varchar("jobType", { length: 80 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  payloadJson: text("payloadJson").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError").notNull(),
  status: mysqlEnum("status", ["FAILED", "RETRYING", "COMPLETED"]).default("FAILED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stakeProducts = mysqlTable("stake_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  category: mysqlEnum("category", ["CORE_STAKING", "LIQUIDITY", "LENDING", "RESTAKING", "YIELD", "RWA"]).notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  annualRateBps: int("annualRateBps").notNull(),
  durationDays: int("durationDays").notNull(),
  minMinor: int("minMinor").notNull(),
  maxMinor: int("maxMinor").notNull(),
  rewardFrequency: mysqlEnum("rewardFrequency", ["DAILY", "WEEKLY", "MONTHLY"]).notNull(),
  lockDays: int("lockDays").notNull(),
  riskLevel: mysqlEnum("riskLevel", ["LOW", "MODERATE", "ELEVATED", "HIGH"]).notNull(),
  status: mysqlEnum("status", ["AVAILABLE", "PAUSED"]).default("AVAILABLE").notNull(),
  supportsCompounding: boolean("supportsCompounding").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stakePositions = mysqlTable("stake_positions", {
  id: int("id").autoincrement().primaryKey(),
  positionCode: varchar("positionCode", { length: 40 }).notNull().unique(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  principalMinor: int("principalMinor").notNull(),
  rewardMinor: int("rewardMinor").default(0).notNull(),
  rewardCount: int("rewardCount").default(0).notNull(),
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "ACTIVE", "REWARD_ACCRUING", "SETTLING", "COMPLETED", "FAILED", "CANCELLED"]).default("PENDING").notNull(),
  openedAt: timestamp("openedAt").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  maturityAt: timestamp("maturityAt").notNull(),
  completedAt: timestamp("completedAt"),
  nextRewardAt: timestamp("nextRewardAt"),
  originalLedgerReference: varchar("originalLedgerReference", { length: 160 }).notNull(),
});

export const stakeTransactions = mysqlTable("stake_transactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionCode: varchar("transactionCode", { length: 48 }).notNull().unique(),
  userId: int("userId").notNull(),
  positionId: int("positionId").notNull(),
  type: varchar("type", { length: 48 }).notNull(),
  amountMinor: int("amountMinor").notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  ledgerReference: varchar("ledgerReference", { length: 160 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const stakeRewards = mysqlTable("stake_rewards", {
  id: int("id").autoincrement().primaryKey(),
  positionId: int("positionId").notNull(),
  userId: int("userId").notNull(),
  amountMinor: int("amountMinor").notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["CALCULATED", "VALIDATED", "APPROVED", "POSTED", "FAILED"]).notNull(),
  calculatedAt: timestamp("calculatedAt").notNull(),
  postedAt: timestamp("postedAt"),
  ledgerReference: varchar("ledgerReference", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const stakeEvents = mysqlTable("stake_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  positionId: int("positionId").notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  previousState: varchar("previousState", { length: 40 }).notNull(),
  newState: varchar("newState", { length: 40 }).notNull(),
  amountMinor: int("amountMinor").default(0).notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  metadataJson: text("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const transactionConsoleEvents = mysqlTable("transaction_console_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionKey: varchar("sessionKey", { length: 96 }).notNull(),
  userId: int("userId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).default("COMPLETED").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  transactionCode: varchar("transactionCode", { length: 80 }),
  amountMinor: int("amountMinor"),
  asset: varchar("asset", { length: 32 }),
  metadataJson: text("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const consoleActivityPhrases = mysqlTable("console_activity_phrases", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 48 }).notNull(),
  phraseTemplate: varchar("phraseTemplate", { length: 500 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
