import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const minioRequire = createRequire(apiRequire.resolve("minio"));

test("Minio loads and its query parser decodes through the patched dependency", () => {
  const minio = apiRequire("minio") as { Client: unknown };
  assert.equal(typeof minio.Client, "function");
  const queryString = minioRequire("query-string") as {
    parse(input: string): Record<string, string>;
  };
  assert.equal(queryString.parse("name=Nguy%E1%BB%85n").name, "Nguyễn");
  assert.equal(queryString.parse("value=%41%C3%A5%FF").value, "Aå%FF");
});
