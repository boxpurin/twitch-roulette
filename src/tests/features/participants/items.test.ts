import { describe, expect, it } from "vitest";
import { itemsReducer } from "../../../features/participants/items";

describe("roulette items", () => {
  it("adds trimmed names without changing existing items", () => {
    const original = [{ id: "1", name: "最初" }];
    expect(
      itemsReducer(original, { type: "add", id: "2", name: "  次の項目  " }),
    ).toEqual([
      { id: "1", name: "最初" },
      { id: "2", name: "次の項目" },
    ]);
    expect(original).toEqual([{ id: "1", name: "最初" }]);
  });

  it("rejects blank names on add and edit", () => {
    expect(itemsReducer([], { type: "add", id: "1", name: " \n　" })).toEqual(
      [],
    );
    expect(
      itemsReducer([{ id: "1", name: "項目" }], {
        type: "rename",
        id: "1",
        name: "　",
      }),
    ).toEqual([{ id: "1", name: "項目" }]);
  });

  it("edits only the selected ID even when names match", () => {
    const items = [
      { id: "1", name: "同名" },
      { id: "2", name: "同名" },
    ];
    expect(
      itemsReducer(items, { type: "rename", id: "2", name: " 編集後 " }),
    ).toEqual([
      { id: "1", name: "同名" },
      { id: "2", name: "編集後" },
    ]);
  });

  it("removes only the selected ID and permits an empty list", () => {
    const items = [
      { id: "1", name: "同名" },
      { id: "2", name: "同名" },
    ];
    const remaining = itemsReducer(items, { type: "remove", id: "1" });
    expect(remaining).toEqual([{ id: "2", name: "同名" }]);
    expect(itemsReducer(remaining, { type: "remove", id: "2" })).toEqual([]);
  });

  it("ignores unknown IDs and prevents duplicate IDs", () => {
    const items = [{ id: "1", name: "項目" }];
    expect(
      itemsReducer(items, { type: "rename", id: "missing", name: "変更" }),
    ).toEqual(items);
    expect(itemsReducer(items, { type: "remove", id: "missing" })).toEqual(
      items,
    );
    expect(itemsReducer(items, { type: "add", id: "1", name: "別名" })).toEqual(
      items,
    );
  });
});

describe("item exclusion", () => {
  it("excludes and restores only the requested ID without deleting data", () => {
    const items = [
      { id: "a", name: "同名", weight: 3 },
      {
        id: "twitch:42",
        name: "同名",
        userId: "42",
        weight: 5,
        redemptions: 2,
      },
    ];
    const excluded = itemsReducer(items, {
      type: "exclude",
      id: "twitch:42",
      excluded: true,
    });
    expect(excluded).toEqual([items[0], { ...items[1], excluded: true }]);
    expect(items[1]).not.toHaveProperty("excluded");
    expect(
      itemsReducer(excluded, {
        type: "exclude",
        id: "twitch:42",
        excluded: false,
      }),
    ).toEqual([items[0], { ...items[1], excluded: false }]);
    expect(
      itemsReducer(items, { type: "exclude", id: "missing", excluded: true }),
    ).toEqual(items);
  });
});
