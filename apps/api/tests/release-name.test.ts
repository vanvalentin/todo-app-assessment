import { describe, expect, it } from "vitest";
import { releaseNameFromBranch } from "../scripts/release-name.js";

describe("release environment names", () => {
  it.each([
    ["release/1.4", "release-1-4"],
    ["release/2026-06-hotfix", "release-2026-06-hotfix"],
    ["release/Feature/Search UI", "release-feature-search-ui"],
    ["release/--edge--", "release-edge"],
  ])("maps %s to %s", (branch, expected) => {
    expect(releaseNameFromBranch(branch)).toBe(expected);
  });

  it("keeps the name inside the length and character rules used by DNS and SQL", () => {
    const name = releaseNameFromBranch(`release/${"long-segment-".repeat(6)}`);

    expect(name).toMatch(/^release-[a-z0-9]([a-z0-9-]{0,29})$/);
    expect(name?.endsWith("-")).toBe(false);
  });

  it.each(["master", "feature/x", "release/", "release/---", "releaseMonkey"])(
    "rejects %s",
    (branch) => {
      expect(releaseNameFromBranch(branch)).toBeUndefined();
    },
  );
});
