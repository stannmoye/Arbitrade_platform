import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("\nexport async function createOpportunityOffer(", start);
const implementation = source.slice(start, end);

const pendingStart = source.indexOf("export async function listPendingSettlements(");
const pendingEnd = source.indexOf("\nexport async function manuallySettleTrade(", pendingStart);
const pendingImplementation = source.slice(pendingStart, pendingEnd);


describe("read-only settlement integrity audit", () => {
  const start = source.indexOf("export async function listTradeSettlementIntegrityIssues(");
  const end = source.indexOf("\nexport async function manuallySettleTrade(", start);
  const implementation = source.slice(start, end);

  it("surfaces legacy and inconsistent settlement states without mutating financial records", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain('eq(tradePositions.settlementOutcome,"legacy_unrecorded")');
    expect(implementation).toContain('isNull(tradePositions.settlementReference)');
    expect(implementation).toContain('isNull(tradeSettlementReferenceClaims.tradeId)');
    expect(implementation).toContain('"pending_trade_missing_reward_reservation"');
    expect(implementation).toContain('"pending_trade_reservation_not_reserved"');
    expect(implementation).toContain('"settled_trade_reservation_still_reserved"');
    expect(implementation).toContain(".filter(row=>row.issues.length>0)");
    expect(implementation).not.toContain("tx.update(");
    expect(implementation).not.toContain("tx.insert(");
    expect(implementation).not.toContain("tx.delete(");
  });
});

describe("pending settlement reconciliation visibility", () => {
  it("exposes lifecycle timing and reward-reservation identity for admin reconciliation", () => {
    expect(pendingStart).toBeGreaterThanOrEqual(0);
    expect(pendingEnd).toBeGreaterThan(pendingStart);
    expect(pendingImplementation).toContain("lifecycleStage:tradePositions.lifecycleStage");
    expect(pendingImplementation).toContain("creditAt:tradePositions.creditAt");
    expect(pendingImplementation).toContain("packageSubscriptionId:tradePositions.packageSubscriptionId");
    expect(pendingImplementation).toContain("reservationStatus:tradeRewardReservations.status");
    expect(pendingImplementation).toContain("reservationPackageName:tradeRewardReservations.packageName");
    expect(pendingImplementation).toContain("reservationAmountMinor:tradeRewardReservations.reservedMinor");
    expect(pendingImplementation).toContain("leftJoin(tradeRewardReservations,eq(tradeRewardReservations.tradeId,tradePositions.id))");
  });
});

const referenceClaimsMigration = readFileSync(new URL("../drizzle/0067_trade_settlement_reference_claims.sql", import.meta.url), "utf8");
const migrationJournal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");

describe("settlement reference uniqueness migration", () => {
  it("registers a database-enforced global unique reference claim and one claim per trade", () => {
    expect(referenceClaimsMigration).toContain("PRIMARY KEY (`settlementReference`)");
    expect(referenceClaimsMigration).toContain("UNIQUE KEY `trade_settlement_reference_claim_trade_unique` (`tradeId`)");
    expect(migrationJournal).toContain('"tag": "0067_trade_settlement_reference_claims"');
  });

  it("acquires the unique reference claim before any wallet ledger posting", () => {
    const claim = implementation.indexOf("tx.insert(tradeSettlementReferenceClaims)");
    const firstLedgerPost = implementation.indexOf("tx.insert(balanceLedger)");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(firstLedgerPost).toBeGreaterThan(claim);
    expect(implementation).toContain("Settlement reference has already been used");
  });
});

describe("manual trade settlement idempotency", () => {
  it("enforces the minimum reference length and note limit in the settlement service", () => {
    expect(implementation).toContain("Settlement reference must contain at least 3 characters");
    expect(implementation).toContain("Settlement reference must not exceed 160 characters");
    expect(implementation).toContain("Settlement notes must not exceed 2000 characters");
  });

  it("rejects manual settlement before the trade due timestamp", () => {
    expect(implementation).toContain("const settlementDueAt=trade.creditAt||trade.settlesAt");
    expect(implementation).toContain("Trade is not yet due for settlement confirmation");
    expect(implementation).toContain("new Date(settlementDueAt).getTime()>Date.now()");
  });

  it("locks the trade and treats a matching completed reference/result as a replay", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain('.limit(1).for("update")');
    expect(implementation).toContain('trade.status==="settled"&&trade.settlementStatus==="completed"');
    expect(implementation).toContain("trade.settlementReference===reference");
    expect(implementation).toContain("Number(trade.realizedGrossProfitMinor)!==input.grossProfitMinor");
    expect(implementation).toContain("trade.settlementReference===reference");
  });

  it("fails closed instead of silently clamping an inconsistent locked principal", () => {
    expect(implementation).toContain("const lockedMinor=Number(wallet.lockedMinor)");
    expect(implementation).toContain("!Number.isSafeInteger(lockedMinor)||lockedMinor<principal");
    expect(implementation).toContain("Settlement wallet locked balance is inconsistent with the trade principal");
    expect(implementation).toContain("lockedMinor:sql`${customerBalances.lockedMinor}-${principal}`");
    expect(implementation).not.toContain("GREATEST(${customerBalances.lockedMinor}-${principal},0)");
  });

  it("locks and validates the reward reservation before financial postings", () => {
    const reservationLock = implementation.indexOf("tx.select().from(tradeRewardReservations)");
    const firstLedgerPost = implementation.indexOf("tx.insert(balanceLedger)");
    expect(reservationLock).toBeGreaterThanOrEqual(0);
    expect(firstLedgerPost).toBeGreaterThan(reservationLock);
    expect(implementation).toContain('reservation.status!=="reserved"');
    expect(implementation).toContain("reservation.userId!==trade.userId||reservation.currency!==trade.currency||reservation.tradeId!==trade.id");
    expect(implementation).toContain("Number(reservation.reservedMinor)!==reservedMinor");
    expect(implementation).toContain("Trade has a reserved reward amount but its reservation record is missing");
    expect(implementation).toContain('assertExactlyOneAffectedRow(reservationUpdate,"Trade reward reservation settlement")');
  });

  it("validates the reservation identity and amount before settlement postings", () => {
    expect(implementation).toContain("const reservation=(await tx.select().from(tradeRewardReservations)");
    expect(implementation).toContain("reservation.userId!==trade.userId||reservation.currency!==trade.currency||reservation.tradeId!==trade.id");
    expect(implementation).toContain("Number(reservation.reservedMinor)!==reservedMinor");
    expect(implementation).toContain("Trade has a reserved reward amount but its reservation record is missing");
    expect(implementation).toContain("assertExactlyOneAffectedRow(reservationUpdate,\"Trade reward reservation settlement\")");
  });

  it("validates package subscription ownership and reservation package identity before postings", () => {
    const subscriptionCheck = implementation.indexOf("Trade package subscription identity is inconsistent");
    const firstLedgerPost = implementation.indexOf("tx.insert(balanceLedger)");
    expect(subscriptionCheck).toBeGreaterThanOrEqual(0);
    expect(firstLedgerPost).toBeGreaterThan(subscriptionCheck);
    expect(implementation).toContain("subscription.userId!==trade.userId");
    expect(implementation).toContain("Trade package identity cannot be resolved");
    expect(implementation).toContain("reservation.packageName!==packageName");
    expect(implementation).toContain("Trade reward reservation package does not match the trade subscription");
  });

  it("claims references in a database-unique table before any financial postings", () => {
    const claim = implementation.indexOf("tx.insert(tradeSettlementReferenceClaims)");
    const principal = implementation.indexOf("tx.insert(balanceLedger)");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(principal).toBeGreaterThan(claim);
    expect(implementation).toContain('if(code==="ER_DUP_ENTRY") throw new Error("Settlement reference has already been used")');
  });
});
