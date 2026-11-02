import { test } from "node:test";
import * as assert from "node:assert/strict";
import { connectionBudget, nonNegative } from "../database-operations.mts";
const input = {
  maxConnections: 100,
  serverReserved: 3,
  apiPool: 5,
  workerPool: 5,
  apiReplicas: 2,
  workerReplicas: 2,
  apiSurge: 1,
  workerSurge: 1,
  toolConnections: 2,
};
test("budget includes every replica, rolling surge, tooling, server slots and 20% reserve", () => {
  assert.deepEqual(connectionBudget(input), {
    ...input,
    reserve: 20,
    application: 30,
    required: 55,
    available: 100,
    fits: true,
  });
  assert.equal(connectionBudget({ ...input, workerPool: 25 }).fits, false);
  assert.equal(connectionBudget({ ...input, maxConnections: 101 }).reserve, 21);
});
test("zero surge is valid but invalid concurrency strings are rejected", () => {
  assert.equal(nonNegative("0", 1, "SURGE"), 0);
  assert.throws(() => nonNegative("-1", 1, "SURGE"));
  assert.throws(() => nonNegative("2.5", 1, "SURGE"));
});
