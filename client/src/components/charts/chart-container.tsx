/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

interface ChartContainerProps {
  title: string;
  description?: string;
  children: ReactNode;
  height?: number;
  className?: string;
}

export default function ChartContainer({ 
  title, 
  description, 
  children, 
  height = 400, 
  className = "" 
}: ChartContainerProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-800">{title}</CardTitle>
        {description && (
          <CardDescription className="text-sm text-gray-600">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
