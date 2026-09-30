import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CONCURRENT_SIGNS,
  releaseSignSlot,
  tryAcquireSignSlot,
} from "../src/services/jobs/pool";

test("a third signature is refused while two are running", () => {
  const acquired: boolean[] = [];
  try {
    for (let i = 0; i < MAX_CONCURRENT_SIGNS + 1; i++) {
      acquired.push(tryAcquireSignSlot());
    }
    assert.deepEqual(acquired, [true, true, false]);
  } finally {
    acquired.filter(Boolean).forEach(() => releaseSignSlot());
  }

  assert.equal(tryAcquireSignSlot(), true);
  releaseSignSlot();
});
