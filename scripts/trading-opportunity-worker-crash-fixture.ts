import { claimOpportunityExecutionAttempt, closeDbPool } from "../server/db";

const userId = Number(process.env.WORKER_TEST_USER_ID);
const eventId = Number(process.env.WORKER_TEST_EVENT_ID);
const offerId = Number(process.env.WORKER_TEST_OFFER_ID);

if (![userId, eventId, offerId].every((value) => Number.isSafeInteger(value) && value > 0)) {
  throw new Error("Worker crash fixture received invalid test identifiers.");
}

const claim = await claimOpportunityExecutionAttempt(
  userId,
  { deliveryEventId: eventId, offerId, tradeRetryDelaySeconds: 30 },
  5,
);
if (!claim.claimed || !claim.executionLeaseToken) {
  await closeDbPool();
  process.stdout.write("NOT_CLAIMED\n");
  process.exit(2);
}

// The parent integration test kills this process after reading the durable lease token.
// Keeping the process alive simulates a worker that disappears after claiming but before
// completing the financial effect.
process.stdout.write("CLAIMED:" + claim.executionLeaseToken + "\n");
setInterval(() => {}, 60_000);
