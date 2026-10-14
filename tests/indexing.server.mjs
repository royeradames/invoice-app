// Run against a serving app: node --test tests/indexing.server.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

const publicRoutes = ["/"];
const recordRoutes = ["/invoices/RT3080"];
const target = new URL(process.env.INDEXING_URL ?? "http://127.0.0.1:4395");

function hasNoindexRobots(html) {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) =>
    /\sname\s*=\s*(?:"robots"|'robots'|robots(?=\s|\/?>))/i.test(tag) &&
    /\scontent\s*=\s*(?:"[^"]*noindex[^"]*"|'[^']*noindex[^']*'|[^\s"'=<>`]*noindex[^\s"'=<>`]*)/i.test(tag)
  );
}

for (const route of publicRoutes) {
  test(`${route} is public and indexable`, async () => {
    const response = await fetch(new URL(route, target), { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get("x-robots-tag") ?? "", /noindex/i);
    assert.equal(hasNoindexRobots(await response.text()), false);
  });
}

for (const route of recordRoutes) {
  test(`${route} keeps saved data out of search`, async () => {
    const response = await fetch(new URL(route, target), { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.equal(hasNoindexRobots(await response.text()), true);
  });
}
