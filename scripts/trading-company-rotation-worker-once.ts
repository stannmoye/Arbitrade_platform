import assert from "node:assert/strict";
import { ensurePopupDeliveries } from "../server/opportunityLifecycle";
import { deliveryIdempotencyKey } from "../server/modules/opportunity-delivery-lifecycle";

const raw = process.env.ROTATION_TEST_DELIVERY_JSON;
if (!raw) throw new Error("Fresh rotation worker requires ROTATION_TEST_DELIVERY_JSON.");
const delivery = JSON.parse(raw);
assert.ok(Number.isSafeInteger(Number(delivery.userId)) && Number(delivery.userId) > 0);
const result = await ensurePopupDeliveries([delivery]);
const eventKey = deliveryIdempotencyKey(Number(delivery.userId), Number(delivery.offerId));
const eventId = result.get(eventKey);
if (!eventId) throw new Error("Fresh rotation worker did not recover/create the expected persisted opportunity.");
process.stdout.write(JSON.stringify({ eventId, eventKey }) + "\n");
