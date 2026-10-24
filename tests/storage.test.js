import test from "node:test";
import assert from "node:assert/strict";
import { createStorage, readJSON } from "../src/storage.js";

test("blocked browser storage supports settings for the current session without crashing", () => {
  const storage = createStorage(() => {
    throw new Error("SecurityError");
  });
  storage.setItem("profile", JSON.stringify({ name: "طالب" }));
  assert.deepEqual(readJSON("profile", null, storage), { name: "طالب" });
  storage.removeItem("profile");
  assert.equal(storage.getItem("profile"), null);
});
test("malformed and incompatible legacy cache does not break initialization", () => {
  for (const value of ["{broken", '{"not":"an array"}', "null"]) {
    assert.deepEqual(readJSON("doctors", [], { getItem: () => value }), []);
  }
});
