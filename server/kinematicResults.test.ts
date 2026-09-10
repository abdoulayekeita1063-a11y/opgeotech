import { describe, expect, it } from "vitest";
import { feasibleCases } from "../client/src/lib/kinematicResults";

describe("Kinematic feasible-only result tables", () => {
  it("keeps only YES/feasible results while preserving source order", () => {
    const rows = [
      { id: "1 × 2", feasible: false },
      { id: "1 × 23", feasible: true },
      { id: "4 × 9", feasible: false },
      { id: "7 × 11", feasible: true },
    ];

    expect(feasibleCases(rows).map(row => row.id)).toEqual(["1 × 23", "7 × 11"]);
    expect(rows).toHaveLength(4);
  });

  it("returns an empty list when no case is feasible", () => {
    expect(feasibleCases([{ feasible: false }, { feasible: false }])).toEqual([]);
  });
});
