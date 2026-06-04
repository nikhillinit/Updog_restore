/**
 * WizardCard - Standardized card component for wizard steps
 *
 * Features:
 * - Consistent styling across wizard steps
 * - Title and description support
 * - Built on shadcn/ui Card component
 * - Accessible and keyboard-friendly
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface WizardCardProps {
  /** Card title */
  title: string;

  /** Optional description */
  description?: string;

  /** Card content */
  children: React.ReactNode;

  /** Additional class names */
  className?: string;

  /** Additional header class names */
  headerClassName?: string;

  /** Additional content class names */
  contentClassName?: string;
}

export function WizardCard({
  title,
  description,
  children,
  className,
  headerClassName,
  contentClassName,
}: WizardCardProps) {
  return (
    <Card className={cn('border-beige-200', className)}>
      <CardHeader className={cn('pb-4', headerClassName)}>
        <CardTitle className="text-lg font-inter font-bold text-pov-charcoal">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-pov-charcoal/70 font-poppins mt-2">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className={cn('pt-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export default WizardCard;
