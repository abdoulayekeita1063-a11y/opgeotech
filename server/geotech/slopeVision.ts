import type { InvokeResult } from "../_core/llm";

export type SlopePoint = { x: number; y: number };
export type SlopeVisionGeometry = {
  crest: SlopePoint;
  toe: SlopePoint;
  face: SlopePoint[];
  berms: SlopePoint[][];
  visibleBoundaries: SlopePoint[];
  representativeSegment: string;
  perspectiveCorrectionApplied: boolean;
  confidence: number;
  limitations: string[];
};

function point(value: unknown): SlopePoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return { x, y };
  if (x >= 0 && x <= 1000 && y >= 0 && y <= 1000)
    return { x: x / 1000, y: y / 1000 };
  return null;
}

function line(value: unknown): SlopePoint[] {
  if (!Array.isArray(value)) return [];
  return value.map(point).filter((item): item is SlopePoint => item !== null);
}

function parseJsonText(value: string): unknown {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(
      "The vision service returned text, but not valid JSON geometry."
    );
  }
}

export function extractVisionText(
  response: InvokeResult | { error?: { message?: string } }
): string {
  if ("error" in response && response.error) {
    throw new Error(
      `Vision service rejected the request: ${response.error.message ?? "invalid request"}`
    );
  }
  if (!("choices" in response)) {
    throw new Error(
      "The vision service returned no choices. Please retry the request."
    );
  }
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (part.type === "text" ? part.text : ""))
      .join("");
  }
  throw new Error(
    "The vision service returned no analysis content. Please retry the request."
  );
}

export function parseSlopeVisionResponse(
  response: InvokeResult | { error?: { message?: string } }
): SlopeVisionGeometry {
  const parsed = parseJsonText(extractVisionText(response)) as Record<
    string,
    unknown
  >;
  const crest = point(parsed.crest);
  const toe = point(parsed.toe);
  const face = line(parsed.face);
  const boundaries = line(parsed.visibleBoundaries);
  if (crest && toe && face.length >= 2) {
    return {
      crest,
      toe,
      face,
      berms: Array.isArray(parsed.berms)
        ? parsed.berms.map(line).filter(item => item.length >= 2)
        : [],
      visibleBoundaries: boundaries,
      representativeSegment:
        typeof parsed.representativeSegment === "string"
          ? parsed.representativeSegment
          : "Representative visible face between the detected crest and toe",
      perspectiveCorrectionApplied:
        parsed.perspectiveCorrectionApplied === true,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      limitations: Array.isArray(parsed.limitations)
        ? parsed.limitations
            .filter((item): item is string => typeof item === "string")
            .slice(0, 8)
        : ["Photo scale and 3D geometry are not survey-grade."],
    };
  }

  // Gemini sometimes uses its native 0–1000 box_2d format despite a requested
  // x/y schema. Convert that useful fallback rather than rejecting a valid photo.
  const box = (parsed.slope_face as { box_2d?: unknown } | undefined)?.box_2d;
  if (
    Array.isArray(box) &&
    box.length === 4 &&
    box.every(value => Number.isFinite(Number(value)))
  ) {
    const [top, left, bottom, right] = box.map(value =>
      Math.max(0, Math.min(1000, Number(value) / 1000))
    );
    const fallbackCrest = { x: (left + right) / 2, y: top };
    const fallbackToe = { x: (left + right) / 2, y: bottom };
    return {
      crest: fallbackCrest,
      toe: fallbackToe,
      face: [fallbackCrest, fallbackToe],
      berms: [],
      visibleBoundaries: [fallbackCrest, fallbackToe],
      representativeSegment:
        "Fallback slope-face bounding box converted from Gemini coordinates",
      perspectiveCorrectionApplied: false,
      confidence: 55,
      limitations: [
        "The model returned a bounding box rather than detailed crest/toe geometry.",
        "Confirm the angle with survey, drone photogrammetry, LiDAR or field measurements.",
      ],
    };
  }
  throw new Error(
    "The vision service returned no usable crest and toe geometry. Use a photo showing one complete slope face."
  );
}
