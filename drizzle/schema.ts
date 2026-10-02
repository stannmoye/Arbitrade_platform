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
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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

export const customerBalances = mysqlTable("customer_balances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  currency: varchar("currency", { length: 12 }).notNull(),
  availableMinor: int("availableMinor").default(0).notNull(),
  promotionalMinor: int("promotionalMinor").default(0).notNull(),
  earnedMinor: int("earnedMinor").default(0).notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
