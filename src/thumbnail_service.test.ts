import assert from "node:assert/strict";
import { thumbnailSize } from "./thumbnail_service.ts";

const pending = { assetId: "a", eventId: "e", moderationQueue: "pending" as const, image: "data:image/png;base64,x", filename: "a.png" };
const approved = { ...pending, moderationQueue: "approved" as const };
assert.deepEqual(thumbnailSize(pending), { width: 320, height: 180 });
assert.deepEqual(thumbnailSize(approved), { width: 640, height: 360 });
console.log("thumbnail policy test passed");
