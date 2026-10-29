import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { spawnSync } from "node:child_process";
import { eq, inArray } from "drizzle-orm";
import { closeDbPool, getDb } from "../server/db";
import { ensurePopupDeliveries } from "../server/opportunityLifecycle";
import { COMPANY_REFERENCE_CATALOGUE } from "../server/modules/company-catalogue-reference";
import { buildCompanySpotlightPool, type CompanySpotlightRepeatPolicy } from "../server/modules/company-spotlight-rotation";
import { appSettings, opportunityOffers, opportunityPopupEvents, users } from "../drizzle/schema";

type PopupDelivery = Parameters<typeof ensurePopupDeliveries>[0][number];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Company rotation integration requires DATABASE_URL to target a disposable migrated database.");
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, ""));
if (!/(test|integration|disposable|ci)/i.test(databaseName)) {
  throw new Error(`Refusing to run company rotation integration against non-test database "${databaseName}".`);
}

let db = await getDb();
if (!db) throw new Error("Company rotation integration cannot connect to its disposable database.");
const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const userOpenId = "rotation-integration-" + token;
const mainPackage = "RotationTest-" + token;
const poolPackage = "RotationPool-" + token;
const quotaDay = new Date().toISOString().slice(0, 10);
const stateKeys = [
  "trading.companyRotation.pending." + token,
  "trading.companyRotation.pool." + token,
];
let userId: number | undefined;
const offerIds: number[] = [];
let triggerName: string | undefined;
let triggerConnection: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;

function makeDelivery(
  offerId: number,
  packageName: string,
  countryNames = "",
  repeatPolicy: CompanySpotlightRepeatPolicy = "avoid_until_exhausted",
): PopupDelivery {
  return {
    userId: userId!,
    offerId,
    quotaDay,
    packageName,
    symbol: "ROT-" + String(offerId),
    currency: "USD",
    minimumMinor: 1000,
    expectedRewardBps: 150,
    configuredProfitRateBps: 120,
    configuredDurationSeconds: 600,
    configuredPopupDisplaySeconds: 15,
    packagePolicyVersionSnapshot: 7,
    policyVersion: 7,
    durationSeconds: 600,
    badgeLabel: null,
    packageBadgeLabel: "Rotation Test",
    badgeStyle: "neutral",
    companyRotationEnabled: true,
    companyRotationCountryNames: countryNames,
    companyRotationRepeatPolicy: repeatPolicy,
    balanceAvailableMinor: 1_000_000,
    balanceStatus: "sufficient",
    marketObservedAt: null,
    marketSnapshotJson: null,
  };
}

async function addOffer(index: number): Promise<number> {
  const now = Date.now();
  const inserted = await db!.insert(opportunityOffers).values({
    symbol: "ROT-" + token.slice(0, 6) + "-" + index,
    venueFrom: "Rotation Test Source",
    venueTo: "Rotation Test Target",
    currency: "USD",
    minimumMinor: 1000,
    expectedRewardBps: 150,
    durationSeconds: 600,
    opensAt: new Date(now - 60_000),
    closesAt: new Date(now + 3_600_000),
    rewardAt: new Date(now + 3_600_000),
    status: "open",
  });
  const id = Number(inserted[0].insertId);
  offerIds.push(id);
  return id;
}

async function readEvent(offerId: number) {
  const rows = await db!.select().from(opportunityPopupEvents)
    .where(eq(opportunityPopupEvents.offerId, offerId));
  const matching = rows.filter(row => Number(row.userId) === userId);
  assert.ok(matching.length <= 1, "one customer/offer/quota day must have at most one persisted popup event");
  return matching[0];
}

async function readState(packageName: string) {
  const key = "trading.companyRotation." + userId + "." + packageName;
  const rows = await db!.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
  assert.ok(rows[0], "durable package-scoped rotation cursor must exist");
  const raw = String(rows[0].settingValue);
  return { key, raw, state: JSON.parse(raw) as { requestCount: number; cycleNumber: number; nextIndex: number; poolFingerprint: string; repeatPolicy: string } };
}

function metadataOf(row: NonNullable<Awaited<ReturnType<typeof readEvent>>>) {
  assert.ok(row.companyReferenceMetadataJson, "each rotation-assigned opportunity must persist its company metadata snapshot");
  return JSON.parse(row.companyReferenceMetadataJson) as {
    rotationCycle: number;
    rotationSequence: number;
    poolFingerprint: string;
    repeatPolicy: string;
    countryName: string;
    listingStatus: string;
    referenceOnly: boolean;
  };
}

function assignInFreshProcess(delivery: PopupDelivery) {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/trading-company-rotation-worker-once.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, ROTATION_TEST_DELIVERY_JSON: JSON.stringify(delivery) },
    },
  );
  assert.equal(
    child.status,
    0,
    "fresh worker process must restore the cursor from the database: " + String(child.stderr || child.stdout),
  );
  const output = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  assert.ok(output, "fresh worker must return its persisted event result");
  return JSON.parse(output) as { eventId: number; eventKey: string };
}

try {
  const userInsert = await db.insert(users).values({
    openId: userOpenId,
    name: "Company Rotation Integration",
    email: userOpenId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  userId = Number(userInsert[0].insertId);
  stateKeys[0] = "trading.companyRotation." + userId + "." + mainPackage;
  stateKeys[1] = "trading.companyRotation." + userId + "." + poolPackage;

  const countryNames = new Set(COMPANY_REFERENCE_CATALOGUE.map(row => row.countryName).filter(Boolean));
  assert.ok(countryNames.size > 1, "catalogue must contain multiple country-folder filters");
  const selectedCountry = COMPANY_REFERENCE_CATALOGUE.find(row => row.countryName)?.countryName;
  assert.ok(selectedCountry, "catalogue must provide a valid country-folder label");
  const selectedCountryPool = buildCompanySpotlightPool(selectedCountry);
  const countryCounts = new Map<string, number>();
  for (const row of COMPANY_REFERENCE_CATALOGUE) {
    countryCounts.set(row.countryName, (countryCounts.get(row.countryName) || 0) + 1);
  }
  const smallestCountry = [...countryCounts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
  assert.ok(smallestCountry, "catalogue must provide a bounded pool for exhaustion testing");
  const exhaustionPool = buildCompanySpotlightPool(smallestCountry);
  assert.equal(exhaustionPool.length, countryCounts.get(smallestCountry), "test fixture count must agree with the runtime filter");

  const requiredOffers = 8 + exhaustionPool.length + 1;
  for (let index = 0; index < requiredOffers; index++) await addOffer(index);

  // Two independent worker invocations race on the exact same user:offer:quotaDay.
  // Only one may claim the durable cursor and persist the company snapshot.
  const duplicateDelivery = makeDelivery(offerIds[0]!, mainPackage);
  const duplicateKey = `${userId}:${offerIds[0]}:${quotaDay}`;
  const [duplicateA, duplicateB] = await Promise.all([
    ensurePopupDeliveries([duplicateDelivery]),
    ensurePopupDeliveries([duplicateDelivery]),
  ]);
  assert.equal(duplicateA.get(duplicateKey), duplicateB.get(duplicateKey), "duplicate workers must return the same persisted popup event");
  assert.ok(duplicateA.get(duplicateKey));
  const afterDuplicate = await readState(mainPackage);
  assert.equal(afterDuplicate.state.requestCount, 1, "duplicate delivery must not advance rotation twice");
  const firstEvent = await readEvent(offerIds[0]!);
  assert.ok(firstEvent);
  assert.equal(metadataOf(firstEvent).rotationSequence, 1);

  // Different offers assigned concurrently for the same customer/package are serialized
  // by the cursor row lock, while retaining their own immutable company snapshots.
  await Promise.all([1, 2, 3].map(index =>
    ensurePopupDeliveries([makeDelivery(offerIds[index]!, mainPackage)]),
  ));
  const firstFour: NonNullable<Awaited<ReturnType<typeof readEvent>>>[] = [];
  for (const id of offerIds.slice(0, 4)) {
    const row = await readEvent(id);
    assert.ok(row);
    firstFour.push(row);
  }
  const firstFourCompanyIds = firstFour.map(row => String(row.companyReferenceId));
  assert.equal(new Set(firstFourCompanyIds).size, 4, "avoid-until-exhausted policy must not repeat before traversing the pool");
  const firstFourSequences = firstFour.map(row => metadataOf(row).rotationSequence).sort((a, b) => a - b);
  assert.deepEqual(firstFourSequences, [1, 2, 3, 4], "concurrent distinct opportunities must receive unique sequential rotation positions");
  assert.ok(firstFour.every(row => Boolean(row.companyReferenceOnly) && metadataOf(row).referenceOnly));
  assert.ok(firstFour.every(row => metadataOf(row).listingStatus === "unverified"), "catalogue assignment must remain reference-only and unverified");
  const savedSnapshot = {
    companyReferenceId: firstEvent.companyReferenceId,
    companyDisplayName: firstEvent.companyDisplayName,
    companyLogoUrl: firstEvent.companyLogoUrl,
    companyReferenceMetadataJson: firstEvent.companyReferenceMetadataJson,
  };

  // Changing the filter changes only the next opportunity's scope; existing snapshots stay immutable.
  await ensurePopupDeliveries([makeDelivery(offerIds[4]!, mainPackage, selectedCountry)]);
  const filteredEvent = await readEvent(offerIds[4]!);
  assert.ok(filteredEvent);
  const filteredMetadata = metadataOf(filteredEvent);
  assert.equal(filteredMetadata.countryName, selectedCountry);
  assert.equal(filteredMetadata.rotationSequence, 1);
  assert.equal(filteredMetadata.rotationCycle, 1);
  assert.notEqual(filteredMetadata.poolFingerprint, metadataOf(firstEvent).poolFingerprint);
  const firstEventAfterPolicyChange = await readEvent(offerIds[0]!);
  assert.ok(firstEventAfterPolicyChange);
  assert.deepEqual({
    companyReferenceId: firstEventAfterPolicyChange.companyReferenceId,
    companyDisplayName: firstEventAfterPolicyChange.companyDisplayName,
    companyLogoUrl: firstEventAfterPolicyChange.companyLogoUrl,
    companyReferenceMetadataJson: firstEventAfterPolicyChange.companyReferenceMetadataJson,
  }, savedSnapshot, "editing country filters must not rewrite an already-saved opportunity snapshot");

  // A repeat-policy change invalidates the old cursor, then it begins a new scope at sequence 1.
  await ensurePopupDeliveries([makeDelivery(offerIds[5]!, mainPackage, selectedCountry, "allow_repeats")]);
  const repeatPolicyEvent = await readEvent(offerIds[5]!);
  assert.ok(repeatPolicyEvent);
  assert.equal(metadataOf(repeatPolicyEvent).repeatPolicy, "allow_repeats");
  assert.equal(metadataOf(repeatPolicyEvent).rotationSequence, 1);
  assert.equal((await readState(mainPackage)).state.requestCount, 1);

  // A distinct Node process models a worker restart: only the database cursor survives.
  const restartResult = assignInFreshProcess(makeDelivery(offerIds[6]!, mainPackage, selectedCountry, "allow_repeats"));
  assert.equal(restartResult.eventKey, `${userId}:${offerIds[6]}:${quotaDay}`);
  const afterRestart = await readEvent(offerIds[6]!);
  assert.ok(afterRestart);
  assert.equal(metadataOf(afterRestart).rotationSequence, 2, "a fresh worker process must resume from the persisted cursor");
  assert.equal((await readState(mainPackage)).state.requestCount, 2);

  // Force an insert failure after the cursor update, then prove the transaction rolls
  // back both the candidate event and the cursor advance on MySQL and MariaDB.
  triggerName = "trg_rotation_rollback_" + token;
  triggerConnection = await mysql.createConnection({
    host: parsedDatabaseUrl.hostname,
    port: Number(parsedDatabaseUrl.port || 3306),
    user: decodeURIComponent(parsedDatabaseUrl.username),
    password: decodeURIComponent(parsedDatabaseUrl.password),
    database: databaseName,
  });
  const rollbackOfferId = offerIds[7]!;
  await triggerConnection.query(
    `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON \`opportunity_popup_events\`
     FOR EACH ROW BEGIN
       IF NEW.userId = ${userId} AND NEW.offerId = ${rollbackOfferId} THEN
         SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced rotation transaction rollback integration test';
       END IF;
     END`,
  );
  const cursorBeforeRollback = await readState(mainPackage);
  let rollbackError: unknown;
  try {
    await ensurePopupDeliveries([makeDelivery(rollbackOfferId, mainPackage, selectedCountry, "allow_repeats")]);
  } catch (error) {
    rollbackError = error;
  }
  assert.ok(rollbackError, "the controlled failure trigger must abort opportunity insertion");
  assert.match(String(rollbackError), /forced rotation transaction rollback integration test/i);
  const cursorAfterRollback = await readState(mainPackage);
  assert.equal(cursorAfterRollback.raw, cursorBeforeRollback.raw, "transaction rollback must restore the exact prior rotation cursor");
  assert.equal(await readEvent(rollbackOfferId), undefined, "transaction rollback must not leave a partial opportunity");

  // Exhaust the smallest actual country-folder pool to prove no repeat occurs in cycle 1,
  // and that the next assignment starts cycle 2 under avoid-until-exhausted.
  const poolOfferIds = offerIds.slice(8, 8 + exhaustionPool.length + 1);
  const poolRows: NonNullable<Awaited<ReturnType<typeof readEvent>>>[] = [];
  for (let index = 0; index < exhaustionPool.length; index++) {
    const offerId = poolOfferIds[index]!;
    await ensurePopupDeliveries([makeDelivery(offerId, poolPackage, smallestCountry)]);
    const row = await readEvent(offerId);
    assert.ok(row);
    poolRows.push(row);
    assert.equal(metadataOf(row).rotationSequence, index + 1);
    assert.equal(metadataOf(row).rotationCycle, 1);
  }
  assert.equal(new Set(poolRows.map(row => String(row.companyReferenceId))).size, exhaustionPool.length);
  const overflowOfferId = poolOfferIds[exhaustionPool.length]!;
  await ensurePopupDeliveries([makeDelivery(overflowOfferId, poolPackage, smallestCountry)]);
  const overflowEvent = await readEvent(overflowOfferId);
  assert.ok(overflowEvent);
  assert.equal(metadataOf(overflowEvent).rotationCycle, 2, "repeat is permitted only after the filtered pool has been exhausted");
  assert.equal(metadataOf(overflowEvent).rotationSequence, exhaustionPool.length + 1);

  console.log(JSON.stringify({
    ok: true,
    database: databaseName,
    duplicateWorkers: 2,
    duplicateCursorAdvances: 1,
    concurrentUniqueAssignments: 4,
    snapshotStableAfterPolicyChange: true,
    freshProcessRestoredCursor: true,
    transactionRollbackRestoredCursor: true,
    poolExhaustionSize: exhaustionPool.length,
    cycleAfterExhaustion: metadataOf(overflowEvent).rotationCycle,
  }));
} finally {
  try {
    if (triggerConnection && triggerName) {
      await triggerConnection.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
    }
  } catch (error) {
    console.error("[RotationIntegration] Could not drop temporary rollback trigger:", error instanceof Error ? error.message : "Unknown error");
  }
  try {
    if (userId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.userId, userId));
      if (stateKeys.length) await db.delete(appSettings).where(inArray(appSettings.settingKey, stateKeys));
    }
    if (offerIds.length) await db.delete(opportunityOffers).where(inArray(opportunityOffers.id, offerIds));
    if (userId !== undefined) await db.delete(users).where(eq(users.id, userId));
  } finally {
    await closeDbPool();
    if (triggerConnection) await triggerConnection.end();
  }
}
