function lengthOrNull(text: string | undefined): number | null {
  if (!text?.trim()) return null;
  const normalized = text.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
    return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** User-requested recovery-based definition. Both source lengths must use metres.
 * Return 0–100 percentage points, never a length or an Excel percentage fraction.
 * Missing/invalid lengths, zero recovery and RQD > recovery remain unclassified.
 */
export function calculateRqdPercentage(
  rqdText: string | undefined,
  recoveryText: string | undefined
): number | null {
  const rqd = lengthOrNull(rqdText);
  const recovery = lengthOrNull(recoveryText);
  if (
    rqd === null ||
    recovery === null ||
    rqd < 0 ||
    recovery <= 0 ||
    rqd > recovery
  )
    return null;
  return (rqd / recovery) * 100;
}

/** Match the source length and percent headers separately. Generic normalization
 * strips % and would otherwise match the RQD (%) column as the source RQD length.
 */
export function findRqdHeaderIndex(
  header: readonly unknown[],
  kind: "length" | "percent"
): number {
  return header.findIndex(value => {
    const text = String(value ?? "")
      .trim()
      .toLowerCase();
    const compact = text.replace(/[^a-z0-9]/g, "");
    if (!compact.startsWith("rqd")) return false;
    const isPercent =
      text.includes("%") || /percent|percentage|pct/.test(compact);
    if (kind === "percent") return isPercent;
    if (isPercent) return false;
    return (
      compact === "rqd" ||
      compact === "rqdm" ||
      /^rqd(?:length|recoveredlength|100mm|over100mm|greaterthan100mm|above100mm)/.test(
        compact
      )
    );
  });
}
