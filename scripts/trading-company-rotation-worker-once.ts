import assert from "node:assert/strict";
import { ensurePopupDeliveries } from "../server/opportunityLifecycle";

const raw = process.env.ROTATION_TEST_DELIVERY_JSON;
if (!raw) throw new Error("Fresh rotation worker requires ROTATION_TEST_DELIVERY_JSON.");
const delivery = JSON.parse(raw);
assert.ok(Number.isSafeInteger(Number(delivery.userId)) && Number(delivery.userId) > 0);
const result = await ensurePopupDeliveries([delivery]);
const eventKey = `${delivery.userId}:${delivery.offerId}:${delivery.quotaDay}`;
const eventId = result.get(eventKey);
if (!eventId) throw new Error("Fresh rotation worker did not recover/create the expected persisted opportunity.");
process.stdout.write(JSON.stringify({ eventId, eventKey }) + "\n");
