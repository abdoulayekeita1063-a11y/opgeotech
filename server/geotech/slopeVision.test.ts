import { describe, expect, it } from "vitest";
import { extractVisionText, parseSlopeVisionResponse } from "./slopeVision";

const response = (content: string) => ({
  id: "test",
  created: 0,
  model: "gemini-3-flash-preview",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant" as const, content },
    },
  ],
});

describe("slope vision response handling", () => {
  it("accepts the requested normalized geometry JSON", () => {
    const geometry = parseSlopeVisionResponse(
      response(
        JSON.stringify({
          crest: { x: 0.2, y: 0.2 },
          toe: { x: 0.6, y: 0.8 },
          face: [
            { x: 0.2, y: 0.2 },
            { x: 0.6, y: 0.8 },
          ],
          berms: [],
          visibleBoundaries: [],
          representativeSegment: "visible face",
          perspectiveCorrectionApplied: false,
          confidence: 86,
          limitations: [],
        })
      )
    );
    expect(geometry.crest).toEqual({ x: 0.2, y: 0.2 });
    expect(geometry.confidence).toBe(86);
  });

  it("converts Gemini's native 0–1000 slope-face box fallback", () => {
    const geometry = parseSlopeVisionResponse(
      response(JSON.stringify({ slope_face: { box_2d: [100, 200, 800, 900] } }))
    );
    expect(geometry.crest).toEqual({ x: 0.55, y: 0.1 });
    expect(geometry.toe).toEqual({ x: 0.55, y: 0.8 });
    expect(geometry.confidence).toBe(55);
    expect(geometry.limitations[0]).toContain("bounding box");
  });

  it("removes markdown fences around JSON", () => {
    expect(extractVisionText(response('```json\n{"ok":true}\n```'))).toContain(
      "ok"
    );
  });

  it("exposes the service's real rejection instead of blaming the image", () => {
    expect(() =>
      parseSlopeVisionResponse({
        error: { message: "invalid response format" },
      })
    ).toThrow("invalid response format");
  });
});
