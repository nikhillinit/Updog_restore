/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Company Dialog Component
 * Add/Edit company dialog with validation
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

// Company data schema
const companySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Company name is required').max(100, 'Name too long'),
  sector: z.string().min(1, 'Sector is required'),
  stage: z.enum(['seed', 'series-a', 'series-b', 'series-c', 'growth'], {
    errorMap: () => ({ message: 'Invalid investment stage' })
  }),
  initialInvestment: z.number()
    .positive('Initial investment must be positive')
    .max(1000, 'Investment amount seems unusually large'),
  followOnInvestment: z.number()
    .min(0, 'Follow-on investment cannot be negative')
    .max(1000, 'Investment amount seems unusually large'),
  currentValue: z.number()
    .positive('Current value must be positive')
    .max(10000, 'Valuation seems unusually large'),
  exitYear: z.number()
    .int('Exit year must be a whole number')
    .min(2024, 'Exit year must be in the future')
    .max(2050, 'Exit year too far in the future')
    .optional()
});

export type CompanyData = z.infer<typeof companySchema>;

export interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyData;
  onSave: (company: CompanyData) => void;
  sectors?: string[];
}

export function CompanyDialog({
  open,
  onOpenChange,
  company,
  onSave,
  sectors = ['Technology', 'Healthcare', 'Fintech', 'SaaS', 'E-commerce', 'Other']
}: CompanyDialogProps) {
  const isEditing = !!company?.id;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<CompanyData>({
    resolver: zodResolver(companySchema),
    defaultValues: company || {
      name: '',
      sector: '',
      stage: 'seed',
      initialInvestment: 0,
      followOnInvestment: 0,
      currentValue: 0
    }
  });

  // Reset form when company changes or dialog opens
  React.useEffect(() => {
    if (open) {
      reset(company || {
        name: '',
        sector: '',
        stage: 'seed',
        initialInvestment: 0,
        followOnInvestment: 0,
        currentValue: 0
      });
    }
  }, [open, company, reset]);

  const onSubmit = (data: CompanyData) => {
    onSave({
      ...data,
      id: company?.id || crypto.randomUUID()
    });
    onOpenChange(false);
  };

  const totalInvestment = (watch('initialInvestment') || 0) + (watch('followOnInvestment') || 0);
  const currentValue = watch('currentValue') || 0;
  const moic = totalInvestment > 0 ? currentValue / totalInvestment : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="font-inter font-bold text-xl">
            {isEditing ? 'Edit Company' : 'Add New Company'}
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {isEditing
              ? 'Update company investment details and exit projections.'
              : 'Add a new portfolio company with investment details and projections.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Company Name */}
          <div>
            <Label htmlFor="name" className="font-poppins font-medium">
              Company Name *
            </Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Acme Inc."
              className="mt-2"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
            )}
          </div>

          {/* Sector and Stage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sector" className="font-poppins font-medium">
                Sector *
              </Label>
              <Select
                {...(company?.sector !== undefined ? { defaultValue: company.sector } : {})}
                onValueChange={(value) => setValue('sector', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sector && (
                <p className="text-sm text-red-600 mt-1">{errors.sector.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="stage" className="font-poppins font-medium">
                Stage *
              </Label>
              <Select
                defaultValue={company?.stage || 'seed'}
                onValueChange={(value) => setValue('stage', value as any)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seed">Seed</SelectItem>
                  <SelectItem value="series-a">Series A</SelectItem>
                  <SelectItem value="series-b">Series B</SelectItem>
                  <SelectItem value="series-c">Series C</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                </SelectContent>
              </Select>
              {errors.stage && (
                <p className="text-sm text-red-600 mt-1">{errors.stage.message}</p>
              )}
            </div>
          </div>

          {/* Investment Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="initialInvestment" className="font-poppins font-medium">
                Initial Investment ($M) *
              </Label>
              <Input
                id="initialInvestment"
                type="number"
                step="0.1"
                {...register('initialInvestment', { valueAsNumber: true })}
                placeholder="1.0"
                className="mt-2"
              />
              {errors.initialInvestment && (
                <p className="text-sm text-red-600 mt-1">{errors.initialInvestment.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="followOnInvestment" className="font-poppins font-medium">
                Follow-On Investment ($M)
              </Label>
              <Input
                id="followOnInvestment"
                type="number"
                step="0.1"
                {...register('followOnInvestment', { valueAsNumber: true })}
                placeholder="0.5"
                className="mt-2"
              />
              {errors.followOnInvestment && (
                <p className="text-sm text-red-600 mt-1">{errors.followOnInvestment.message}</p>
              )}
            </div>
          </div>

          {/* Current Value and Exit Year */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="currentValue" className="font-poppins font-medium">
                Current Value ($M) *
              </Label>
              <Input
                id="currentValue"
                type="number"
                step="0.1"
                {...register('currentValue', { valueAsNumber: true })}
                placeholder="5.0"
                className="mt-2"
              />
              {errors.currentValue && (
                <p className="text-sm text-red-600 mt-1">{errors.currentValue.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="exitYear" className="font-poppins font-medium">
                Expected Exit Year
              </Label>
              <Input
                id="exitYear"
                type="number"
                {...register('exitYear', { valueAsNumber: true })}
                placeholder="2028"
                className="mt-2"
              />
              {errors.exitYear && (
                <p className="text-sm text-red-600 mt-1">{errors.exitYear.message}</p>
              )}
            </div>
          </div>

          {/* MOIC Preview */}
          {totalInvestment > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Investment:</span>
                <span className="font-semibold text-pov-charcoal">${totalInvestment.toFixed(1)}M</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-600">MOIC:</span>
                <span className={`font-bold ${moic >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                  {moic.toFixed(2)}x
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? 'Update Company' : 'Add Company'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
