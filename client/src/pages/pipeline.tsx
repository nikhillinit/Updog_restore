/**
 * Pipeline Page - Deal tracking and diligence
 *
 * Empty state placeholder for the pipeline feature.
 * Part of Codex-validated UI/UX restructure.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { Plus, Upload, LineChart } from "lucide-react";

export default function PipelinePage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Pipeline"
        subtitle="Track deals, diligence progress, and investment decisions"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Empty State */}
        <Card className="border-dashed border-2 border-pov-beige bg-white/50">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-pov-charcoal/5 flex items-center justify-center mb-4">
              <LineChart className="h-8 w-8 text-pov-charcoal/40" />
            </div>
            <CardTitle className="font-inter text-xl text-pov-charcoal">
              No deals in your pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="font-poppins text-sm text-gray-500 mb-6 max-w-md mx-auto">
              Add deals to track diligence, scoring, and next steps.
              Import existing deals from a spreadsheet or add them manually.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white">
                <Plus className="h-4 w-4 mr-2" />
                Add deal
              </Button>
              <Button variant="outline" className="border-pov-beige hover:bg-pov-beige/20">
                <Upload className="h-4 w-4 mr-2" />
                Import deals
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature Preview */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/80">
            <CardContent className="pt-6">
              <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                Deal Scoring
              </h3>
              <p className="font-poppins text-xs text-gray-500">
                Score deals on team, market, product, and traction metrics
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/80">
            <CardContent className="pt-6">
              <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                Diligence Tracking
              </h3>
              <p className="font-poppins text-xs text-gray-500">
                Track diligence checklist progress and key findings
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/80">
            <CardContent className="pt-6">
              <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                Decision Workflow
              </h3>
              <p className="font-poppins text-xs text-gray-500">
                Move deals through stages from sourcing to close
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
