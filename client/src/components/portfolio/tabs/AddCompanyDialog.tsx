import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';

const COMPANY_STAGES = ['Seed', 'Series A', 'Series B', 'Series C', 'Growth'] as const;

const addCompanySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required'),
  sector: z.string().trim().min(1, 'Sector is required'),
  stage: z.enum(COMPANY_STAGES),
  investmentAmount: z
    .string()
    .trim()
    .min(1, 'Initial investment is required')
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, 'Initial investment must be a positive number'),
});

type AddCompanyForm = z.infer<typeof addCompanySchema>;
type AddCompanyField = keyof AddCompanyForm;

const DEFAULT_FORM: AddCompanyForm = {
  name: '',
  sector: '',
  stage: 'Seed',
  investmentAmount: '',
};

interface AddCompanyDialogProps {
  fundId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCompanyDialog({ fundId, open, onOpenChange }: AddCompanyDialogProps) {
  const [form, setForm] = useState<AddCompanyForm>(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AddCompanyField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
      setFieldErrors({});
      setServerError(null);
    }
  }, [open]);

  const createCompanyMutation = useMutation({
    mutationFn: async (values: AddCompanyForm) =>
      apiRequest('POST', '/api/portfolio-companies', {
        fundId,
        name: values.name,
        sector: values.sector,
        stage: values.stage,
        currentStage: values.stage,
        investmentAmount: values.investmentAmount,
      }),
    onSuccess: (_result, values) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-companies'] });
      queryClient.invalidateQueries({ queryKey: ['allocations', 'latest', fundId] });
      toast({
        title: 'Company added',
        description: `"${values.name}" now appears in the Companies tab.`,
      });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to add company';
      setServerError(message);
      toast({
        title: 'Unable to add company',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const handleFieldChange = (field: AddCompanyField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setServerError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const parsed = addCompanySchema.safeParse(form);
    if (!parsed.success) {
      const nextFieldErrors: Partial<Record<AddCompanyField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !(field in nextFieldErrors)) {
          nextFieldErrors[field as AddCompanyField] = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);
      return;
    }

    createCompanyMutation.mutate(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (createCompanyMutation.isPending && !nextOpen) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="portfolio-add-company-dialog">
        <DialogHeader>
          <DialogTitle>Add portfolio company</DialogTitle>
          <DialogDescription>
            Create a company directly from the routed Companies tab.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="portfolio-company-name">Company name</Label>
            <Input
              id="portfolio-company-name"
              value={form.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              placeholder="Northwind AI"
            />
            {fieldErrors.name ? <p className="text-sm text-red-600">{fieldErrors.name}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="portfolio-company-sector">Sector</Label>
            <Input
              id="portfolio-company-sector"
              value={form.sector}
              onChange={(event) => handleFieldChange('sector', event.target.value)}
              placeholder="AI / SaaS"
            />
            {fieldErrors.sector ? (
              <p className="text-sm text-red-600">{fieldErrors.sector}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={(value) => handleFieldChange('stage', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.stage ? <p className="text-sm text-red-600">{fieldErrors.stage}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="portfolio-company-investment-amount">Initial investment ($)</Label>
            <Input
              id="portfolio-company-investment-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.investmentAmount}
              onChange={(event) => handleFieldChange('investmentAmount', event.target.value)}
              placeholder="1500000"
            />
            {fieldErrors.investmentAmount ? (
              <p className="text-sm text-red-600">{fieldErrors.investmentAmount}</p>
            ) : null}
          </div>

          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createCompanyMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createCompanyMutation.isPending}>
              {createCompanyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Company'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
