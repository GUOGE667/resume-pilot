import assert from "node:assert/strict";
import test from "node:test";
import { planPageSlices } from "../lib/pdf-pagination.ts";

test("prefers a section boundary and keeps every canvas row", () => {
  const pages = planPageSlices(2300, 1000, [800, 1150, 1650, 2100]);
  assert.deepEqual(pages, [
    { start: 0, end: 800 },
    { start: 800, end: 1650 },
    { start: 1650, end: 2300 },
  ]);
  assert.equal(pages[0].start, 0);
  assert.equal(pages.at(-1).end, 2300);
  for (let index = 1; index < pages.length; index++) assert.equal(pages[index].start, pages[index - 1].end);
  for (const page of pages) assert.ok(page.end - page.start <= 1000);
});

test("falls back to a full page when only an early boundary exists", () => {
  assert.deepEqual(planPageSlices(1900, 1000, [100, 150, Number.NaN, 3000]), [
    { start: 0, end: 1000 },
    { start: 1000, end: 1900 },
  ]);
});

test("handles empty and short documents", () => {
  assert.deepEqual(planPageSlices(0, 1000, []), []);
  assert.deepEqual(planPageSlices(700, 1000, [200]), [{ start: 0, end: 700 }]);
});
