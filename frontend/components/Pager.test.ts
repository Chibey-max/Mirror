import { describe, expect, it } from "vitest";
import { pageSlots } from "./Pager";

describe("page slots", () => {
  it("lists every page when there are seven or fewer", () => {
    expect(pageSlots(0, 1)).toEqual([0]);
    expect(pageSlots(2, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps seven slots, with the first and last page, however many pages", () => {
    for (const count of [8, 12, 40]) {
      for (let page = 0; page < count; page++) {
        const slots = pageSlots(page, count);
        expect(slots).toHaveLength(7);
        expect(slots[0]).toBe(0);
        expect(slots[6]).toBe(count - 1);
        expect(slots).toContain(page);
      }
    }
  });

  it("skips runs from the middle with a gap on each side", () => {
    expect(pageSlots(6, 12)).toEqual([0, "gap", 5, 6, 7, "gap", 11]);
    expect(pageSlots(1, 12)).toEqual([0, 1, 2, 3, 4, "gap", 11]);
    expect(pageSlots(10, 12)).toEqual([0, "gap", 7, 8, 9, 10, 11]);
  });
});
