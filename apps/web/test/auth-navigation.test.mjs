import assert from "node:assert/strict";
import test from "node:test";
import {
  createLoginUrl,
  getLoginDestination,
} from "../src/features/auth/auth-navigation.ts";

test("workspace return URLs preserve the query string and fragment", () => {
  for (const target of [
    "/",
    "/dashboard",
    "/user?search=agent%40example.com",
    "/dead-letter?queue=email-sync#failed-job",
    "/?conversationId=conversation-1#message-2",
  ]) {
    assert.equal(getLoginDestination(target), target);
    const login = new URL(createLoginUrl(target), "https://omnidesk.test");
    assert.equal(login.pathname, "/login");
    assert.equal(getLoginDestination(login.searchParams.get("returnTo")), target);
  }
});

test("missing, external and malformed destinations return to the inbox", () => {
  for (const target of [
    null,
    "",
    "https://example.com/dashboard",
    "//example.com/dashboard",
    "//omnidesk.invalid/dashboard",
    "javascript:alert(1)",
    "/\\example.com",
    "/dashboard\n",
    "/dashboard\t",
    "/\u0000dashboard",
    "%2F%2Fexample.com",
    "/%2fexample.com",
    "/%5cexample.com",
    " /dashboard",
  ]) {
    assert.equal(getLoginDestination(target), "/", String(target));
  }
});

test("public and unknown routes cannot create an authentication redirect loop", () => {
  for (const target of [
    "/login",
    "/login?returnTo=/dashboard",
    "/auth/reset-password?token=example",
    "/forgot-password",
    "/missing",
    "/dashboard/../login",
  ]) {
    assert.equal(getLoginDestination(target), "/");
    assert.equal(createLoginUrl(target), "/login");
  }
});

test("the inbox uses a clean login URL and other destinations are encoded once", () => {
  assert.equal(createLoginUrl("/"), "/login");
  assert.equal(createLoginUrl("/dashboard"), "/login?returnTo=%2Fdashboard");
  const target = "/user?search=agent%2Btest%40example.com#details";
  const params = new URL(createLoginUrl(target), "https://omnidesk.test").searchParams;
  assert.equal(params.get("returnTo"), target);
});
