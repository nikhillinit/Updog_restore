import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StepNotFound() {
  return (
    <Card className="border-warning/50 bg-warning/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning-dark">
          <AlertCircle className="h-5 w-5" />
          Step Not Found
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-warning-dark">
          The requested wizard step could not be loaded. This may be due to a navigation error or missing component.
        </p>
        <p className="text-sm text-warning-dark mt-2">
          Please try refreshing the page or contact support if the problem persists.
        </p>
      </CardContent>
    </Card>
  );
}
