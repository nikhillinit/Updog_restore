import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StepNotFound() {
  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-800">
          <AlertCircle className="h-5 w-5" />
          Step Not Found
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-yellow-700">
          The requested wizard step could not be loaded. This may be due to a navigation error or missing component.
        </p>
        <p className="text-sm text-yellow-600 mt-2">
          Please try refreshing the page or contact support if the problem persists.
        </p>
      </CardContent>
    </Card>
  );
}