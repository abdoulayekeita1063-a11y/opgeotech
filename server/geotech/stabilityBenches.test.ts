import { describe, expect, it } from "vitest";
import { computeStability } from "./stability";
import {
  buildBenchStabilityInput,
  defaultBench,
} from "../../client/src/lib/stabilityForm";
import { runOfflineEngine } from "../../client/src/lib/offlineEngines";

// Controlled engineering regression fixtures only; no user records are created.
const twoBenches = () => [
  defaultBench({
    height: "12",
    angle: "55",
    bermWidth: "6",
    cohesion: "20",
    frictionAngle: "28",
    unitWeight: "20",
    waterCondition: "dry",
  }),
  defaultBench({
    height: "12",
    angle: "50",
    bermWidth: "0",
    cohesion: "35",
    frictionAngle: "34",
    unitWeight: "24",
    waterCondition: "partial",
  }),
];

describe("Bench-only stability form", () => {
  it("builds geometry and compatibility summaries entirely from the bench inputs", () => {
    const input = buildBenchStabilityInput(twoBenches());
    expect(input.slopeHeight).toBe(12 + 12);
    expect(input.slopeAngle).toBe(55);
    expect(input.unitWeight).toBe(20);
    expect(input.benches[1].unitWeight).toBe(24);
    expect(input.benches[1].waterCondition).toBe("partial");
    expect(input.benches[0].strengthModel).toEqual({
      type: "mohr-coulomb",
      cohesion: 20,
      frictionAngle: 28,
    });
    expect(input.benches[1].strengthModel).toEqual({
      type: "mohr-coulomb",
      cohesion: 35,
      frictionAngle: 34,
    });
  });

  it.each([
    "height",
    "angle",
    "unitWeight",
    "cohesion",
    "frictionAngle",
  ] as const)("rejects a blank %s instead of treating it as zero", field => {
    expect(() =>
      buildBenchStabilityInput([defaultBench({ [field]: "" })])
    ).toThrow();
  });

  it("only validates the strength fields of the selected model", () => {
    const input = buildBenchStabilityInput([
      defaultBench({
        strengthModel: "hoek-brown",
        cohesion: "",
        frictionAngle: "",
      }),
    ]);
    expect(input.benches[0].strengthModel?.type).toBe("hoek-brown");
    expect(() =>
      buildBenchStabilityInput([
        defaultBench({ strengthModel: "hoek-brown", sigmaCi: "" }),
      ])
    ).toThrow("UCS");
    expect(() =>
      buildBenchStabilityInput([
        defaultBench({ sigmaCi: "", gsi: "", mi: "", disturbanceFactor: "" }),
      ])
    ).not.toThrow();
  });

  it("rejects invalid per-bench limits and missing bench geometry", () => {
    expect(() => buildBenchStabilityInput([])).toThrow();
    expect(() =>
      buildBenchStabilityInput([defaultBench({ unitWeight: "40" })])
    ).toThrow("unit weight");
    expect(() =>
      buildBenchStabilityInput([defaultBench({ frictionAngle: "70" })])
    ).toThrow("friction angle");
    expect(() =>
      buildBenchStabilityInput([defaultBench({ height: "0.5" })])
    ).toThrow("Total slope height");
  });
});

describe("Per-bench stability calculation", () => {
  it("preserves the legacy single-bench Mohr–Coulomb calculation", () => {
    const legacy = {
      cohesion: 25,
      frictionAngle: 30,
      unitWeight: 20,
      slopeHeight: 15,
      slopeAngle: 45,
      waterCondition: "dry" as const,
    };
    const previous = computeStability(legacy);
    const current = computeStability(
      buildBenchStabilityInput([defaultBench()])
    );
    expect(current.fsBishop).toBe(previous.fsBishop);
    expect(current.fsFellenius).toBe(previous.fsFellenius);
    expect(current.criticalCircle).toEqual(previous.criticalCircle);
    expect(current.ru).toBe(previous.ru);
  });

  it("keeps distinct Mohr–Coulomb strength, unit weight and water per bench", () => {
    const result = computeStability(buildBenchStabilityInput(twoBenches()));
    expect(result.benchStrengths[0]).toMatchObject({
      cohesion: 20,
      frictionAngle: 28,
      unitWeight: 20,
      waterCondition: "dry",
      ru: 0,
    });
    expect(result.benchStrengths[1]).toMatchObject({
      cohesion: 35,
      frictionAngle: 34,
      unitWeight: 24,
      waterCondition: "partial",
      ru: 0.25,
    });
    expect(result.ru).toBeGreaterThanOrEqual(0);
    expect(result.ru).toBeLessThanOrEqual(0.25);
  });

  it("changing only the upper bench unit weight changes the factor of safety", () => {
    const benches = twoBenches();
    const original = computeStability(buildBenchStabilityInput(benches));
    benches[1].unitWeight = "32";
    const changed = computeStability(buildBenchStabilityInput(benches));
    expect(changed.fsBishop).not.toBe(original.fsBishop);
    expect(changed.fsFellenius).not.toBe(original.fsFellenius);
  });

  it("saturation assigned to the upper bench lowers the factors of safety", () => {
    const benches = twoBenches().map(bench => ({
      ...bench,
      waterCondition: "dry" as const,
    }));
    const dry = computeStability(buildBenchStabilityInput(benches));
    const wetBenches = [
      benches[0],
      { ...benches[1], waterCondition: "saturated" as const },
    ];
    const wet = computeStability(buildBenchStabilityInput(wetBenches));
    expect(wet.fsBishop).toBeLessThan(dry.fsBishop);
    expect(wet.fsFellenius).toBeLessThan(dry.fsFellenius);
    expect(wet.benchStrengths[0].ru).toBe(0);
    expect(wet.benchStrengths[1].ru).toBe(0.5);
  });

  it("does not let compatibility global fields override fully specified bench properties", () => {
    const input = buildBenchStabilityInput(twoBenches());
    const original = computeStability(input);
    const changed = computeStability({
      ...input,
      cohesion: 900,
      frictionAngle: 5,
      unitWeight: 35,
      waterCondition: "saturated",
    });
    expect(changed.fsBishop).toBe(original.fsBishop);
    expect(changed.fsFellenius).toBe(original.fsFellenius);
    expect(changed.benchStrengths).toEqual(original.benchStrengths);
  });

  it("supports mixed models and the same per-bench calculation offline", async () => {
    const benches = twoBenches();
    benches[1].strengthModel = "hoek-brown";
    const input = buildBenchStabilityInput(benches);
    const result = computeStability(input);
    expect(result.strengthModel).toBe("Mixed");
    expect(result.benchStrengths[0].model).toBe("Mohr–Coulomb");
    expect(result.benchStrengths[1].model).toBe("Hoek–Brown");
    const offline = await runOfflineEngine("stability.compute", input);
    expect(offline?.fsBishop).toBe(result.fsBishop);
    expect(offline?.benchStrengths).toEqual(result.benchStrengths);
  });
});
