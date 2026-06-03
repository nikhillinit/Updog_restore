/**
 * SummaryCard -- compact label/value tile used in sensitivity results headers.
 * Extracted verbatim from OneWayPanel; class strings are intentionally
 * preserved byte-for-byte. Token harmonization belongs in a separate slice.
 */

export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-beige-200 p-3">
      <p className="text-xs text-charcoal-500">{label}</p>
      <p className="text-lg font-semibold text-pov-charcoal">{value}</p>
    </div>
  );
}
