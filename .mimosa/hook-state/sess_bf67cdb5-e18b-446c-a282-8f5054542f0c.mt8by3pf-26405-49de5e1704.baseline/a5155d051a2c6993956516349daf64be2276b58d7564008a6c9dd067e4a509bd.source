import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';

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
  className = '',
}: ChartContainerProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-pov-charcoal">{title}</CardTitle>
        {description && (
          <CardDescription className="text-sm text-charcoal-600">{description}</CardDescription>
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
