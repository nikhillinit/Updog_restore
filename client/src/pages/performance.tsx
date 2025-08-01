import IRRSummary from "@/components/performance/irr-summary";

export default function Performance() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Fund Performance</h1>
        <p className="text-muted-foreground">
          Comprehensive performance analysis including IRR calculations and realized returns
        </p>
      </div>
      
      <IRRSummary />
    </div>
  );
}