/**
 * AI functions: multimodal blast photo analysis and structured report generation.
 */
import { invokeLLM } from "../_core/llm";

function extractText(response: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === "string" ? c : (c?.text ?? "")))
      .join("");
  }
  return "";
}

export interface BlastAnalysis {
  qualityScore: number; // 0-100
  fragmentationRating: string; // e.g. "Good"
  fragmentationComment: string;
  overbreakDetected: string; // "None" | "Overbreak" | "Underbreak" | "Both"
  overbreakComment: string;
  muckpileComment: string;
  wallConditionComment: string;
  recommendations: string[];
}

/**
 * Multimodal analysis of before/after blast photos.
 * Returns a structured assessment with a quantified quality score (0-100).
 */
export async function analyzeBlastPhotos(params: {
  beforePhotoUrl: string;
  afterPhotoUrl: string;
  zone: string;
  blastDate: string;
  notes?: string;
}): Promise<BlastAnalysis> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a senior geotechnical and drill-and-blast engineer specializing in open-pit mining. You analyze before/after blast photographs to assess blast quality. Be rigorous, technical, and honest about uncertainty when image quality limits the assessment. Always respond in English.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze these two photographs of a production blast in an open-pit mine.\nPhoto 1 = BEFORE the blast. Photo 2 = AFTER the blast.\nZone: ${params.zone}. Blast date: ${params.blastDate}.${params.notes ? ` Field notes: ${params.notes}` : ""}\n\nAssess: (1) fragmentation quality (block size distribution, presence of oversize/boulders), (2) overbreak or underbreak relative to the intended excavation limit, (3) muckpile shape and displacement (diggability), (4) condition of remaining faces/walls (half-barrels, cracking, damage), and (5) an overall blast quality score from 0 to 100 (100 = excellent blast: uniform fragmentation, no oversize, clean walls, well-shaped muckpile; below 50 = deficient blast requiring corrective action).`,
          },
          { type: "image_url", image_url: { url: params.beforePhotoUrl, detail: "high" } },
          { type: "image_url", image_url: { url: params.afterPhotoUrl, detail: "high" } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "blast_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            qualityScore: {
              type: "integer",
              description: "Overall blast quality score from 0 to 100",
            },
            fragmentationRating: {
              type: "string",
              enum: ["Excellent", "Good", "Fair", "Poor", "Very poor"],
              description: "Fragmentation quality rating",
            },
            fragmentationComment: {
              type: "string",
              description: "Technical comment on fragmentation (block sizes, uniformity, oversize)",
            },
            overbreakDetected: {
              type: "string",
              enum: ["None", "Overbreak", "Underbreak", "Both"],
              description: "Whether overbreak and/or underbreak is detected",
            },
            overbreakComment: {
              type: "string",
              description: "Comment on overbreak/underbreak relative to excavation limits",
            },
            muckpileComment: {
              type: "string",
              description: "Comment on muckpile shape, displacement and diggability",
            },
            wallConditionComment: {
              type: "string",
              description: "Comment on remaining wall/face condition and blast damage",
            },
            recommendations: {
              type: "array",
              items: { type: "string" },
              description: "Actionable recommendations for future blasts",
            },
          },
          required: [
            "qualityScore",
            "fragmentationRating",
            "fragmentationComment",
            "overbreakDetected",
            "overbreakComment",
            "muckpileComment",
            "wallConditionComment",
            "recommendations",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as BlastAnalysis;
  parsed.qualityScore = Math.max(0, Math.min(100, Math.round(parsed.qualityScore)));
  return parsed;
}

/**
 * Generates a structured, professional post-blast report (markdown) from the analysis.
 */
export async function generateBlastReport(params: {
  title: string;
  zone: string;
  blastDate: string;
  notes?: string;
  analysis: BlastAnalysis;
}): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a senior geotechnical engineer writing formal post-blast assessment reports for an open-pit mining operation. Write in professional English, in a structured, concise, and technical style. Output clean markdown with clear section headings. Do not invent data not provided.",
      },
      {
        role: "user",
        content: `Write a formal post-blast assessment report in markdown using this data:\n\nTitle: ${params.title}\nZone: ${params.zone}\nBlast date: ${params.blastDate}\nField notes: ${params.notes || "None"}\n\nAI photo analysis results:\n- Overall quality score: ${params.analysis.qualityScore}/100\n- Fragmentation: ${params.analysis.fragmentationRating} — ${params.analysis.fragmentationComment}\n- Overbreak/Underbreak: ${params.analysis.overbreakDetected} — ${params.analysis.overbreakComment}\n- Muckpile: ${params.analysis.muckpileComment}\n- Wall condition: ${params.analysis.wallConditionComment}\n- Recommendations: ${params.analysis.recommendations.join("; ")}\n\nStructure the report with: 1. Summary, 2. Blast Details, 3. Fragmentation Assessment, 4. Excavation Limit Conformance (Overbreak/Underbreak), 5. Muckpile & Diggability, 6. Wall Condition, 7. Overall Quality Score & Rating, 8. Recommendations. Keep it under 600 words. Start with a level-1 heading containing the title.`,
      },
    ],
  });
  return extractText(response);
}

/**
 * Generates a structured, professional daily inspection report (markdown).
 */
export async function generateInspectionReport(params: {
  title: string;
  inspectionDate: string;
  inspector?: string;
  zones: string;
  weather: string;
  observations: string;
  anomalies?: string;
  actions?: string;
}): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a senior geotechnical engineer writing formal daily geotechnical inspection reports for an open-pit mine. Write in professional English, structured and technical. Rephrase raw field notes into professional prose without inventing facts. Output clean markdown.",
      },
      {
        role: "user",
        content: `Write a formal daily geotechnical inspection report in markdown from these field notes:\n\nTitle: ${params.title}\nInspection date: ${params.inspectionDate}\nInspector: ${params.inspector || "Not specified"}\nInspected zones: ${params.zones}\nWeather conditions: ${params.weather}\nField observations: ${params.observations}\nAnomalies identified: ${params.anomalies || "None reported"}\nRecommended actions (field input): ${params.actions || "None specified"}\n\nStructure: 1. General Information (table with date, inspector, zones, weather), 2. Summary, 3. Observations by Zone, 4. Anomalies & Risk Assessment, 5. Recommended Actions & Follow-up, 6. Conclusion. Professional wording, no invented data. Keep it under 600 words. Start with a level-1 heading containing the title.`,
      },
    ],
  });
  return extractText(response);
}
