/**
 * RecommendationsPanel
 *
 * Actionable recommendations from backtest result.
 */

interface Props {
  recommendations: string[];
}

export function RecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Recommendations</h3>
      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <span className="text-gray-400 mt-0.5 shrink-0">{i + 1}.</span>
            <span>{rec}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RecommendationsPanel;
