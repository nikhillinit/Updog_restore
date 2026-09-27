import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  fundListRefreshedSince,
  isUnknownCreateOutcome,
  useIdempotencyKey,
  type IdempotencyKeyScope,
} from '@/hooks/useIdempotencyKey';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { useAuthSession } from '@/lib/auth-session';
import { sha256Hash } from '@/lib/hash';
import { invalidatePortfolioData } from '@/lib/invalidate-portfolio-data';
import {
  COMPANY_SECTORS,
  COMPANY_STAGES,
  isCompanySector,
  isCompanyStage,
} from '@/lib/company-taxonomy';
import { parseMoney } from '@/utils/parse-helpers';
import { AlertCircle, Loader2 } from 'lucide-react';

const ADD_COMPANY_SERVER_ERROR =
  'Company could not be created. Review the company details and try again.';
const COMPANY_UNCERTAIN_MESSAGE =
  'Creation status is uncertain. The request may already be recorded. Retry with the same details or discard this attempt after refreshing the list.';
const COMPANY_ALREADY_RECORDED_MESSAGE =
  'This company was already recorded. You can start a new intent.';

const addCompanySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required'),
  sector: z
    .string()
    .refine((value) => Boolean(isCompanySector(value)), 'Choose a sector from the list'),
  stage: z
    .string()
    .refine((value) => Boolean(isCompanyStage(value)), 'Choose a stage from the list'),
  investmentAmount: z
    .string()
    .trim()
    .min(1, 'Initial investment is required')
    .refine((value) => {
      const parsed = parseMoney(value);
      return parsed != null && parsed > 0;
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

// The fund and actor are captured at submit and travel with the command, so a
// scope change while the fingerprint hashes cannot move it to another key slot.
type CompanyCreateScope = IdempotencyKeyScope & { fundId: number };
type CreateCompanyVariables = { values: AddCompanyForm; scope: CompanyCreateScope };

export function AddCompanyDialog({ fundId, open, onOpenChange }: AddCompanyDialogProps) {
  const [form, setForm] = useState<AddCompanyForm>(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AddCompanyField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  // An uncertain command stays bound to the fund it was sent to until it
  // settles, even if the page fund changes while the dialog is closed.
  const [uncertainFundId, setUncertainFundId] = useState(fundId);
  const [canDiscard, setCanDiscard] = useState(false);
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: authSession } = useAuthSession();
  const commandScope: CompanyCreateScope = {
    fundId: uncertain ? uncertainFundId : fundId,
    operation: 'company_create',
    actorId: authSession?.user.id,
  };
  const idempotencyKey = useIdempotencyKey(commandScope);

  const refreshCompanyList = useCallback(
    async (targetFundId: number) => {
      invalidatePortfolioData(queryClient, targetFundId);
      await queryClient.refetchQueries({ queryKey: ['portfolio-companies'] });
    },
    [queryClient]
  );

  useEffect(() => {
    if (idempotencyKey.restored) void refreshCompanyList(commandScope.fundId);
  }, [idempotencyKey.restored, refreshCompanyList, commandScope.fundId]);

  useEffect(() => {
    if (!open && !uncertain) {
      setForm(DEFAULT_FORM);
      setFieldErrors({});
      setServerError(null);
      setAlreadyRecorded(false);
    }
  }, [open, uncertain]);

  const createCompanyMutation = useMutation({
    mutationFn: async ({ values, scope }: CreateCompanyVariables) => {
      const payload = {
        fundId: scope.fundId,
        name: values.name,
        sector: values.sector,
        stage: values.stage,
        currentStage: values.stage,
        investmentAmount: String(parseMoney(values.investmentAmount)),
      };
      const fingerprint = await sha256Hash(payload);
      return apiRequest('POST', '/api/portfolio-companies', payload, {
        headers: { 'Idempotency-Key': idempotencyKey.keyFor(fingerprint, scope) },
      });
    },
    onSuccess: (_result, { values, scope }) => {
      idempotencyKey.reset(scope);
      void refreshCompanyList(scope.fundId);
      setUncertain(false);
      setCanDiscard(false);
      setAlreadyRecorded(false);
      toast({
        title: 'Company added',
        description: `"${values.name}" now appears in the Companies tab.`,
      });
      onOpenChange(false);
    },
    onError: (error: unknown, variables) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.errorCode === 'IDEMPOTENCY_KEY_REUSE'
      ) {
        idempotencyKey.reset(variables.scope);
        setUncertain(false);
        setCanDiscard(false);
        setAlreadyRecorded(true);
        setForm(DEFAULT_FORM);
        setFieldErrors({});
        void refreshCompanyList(variables.scope.fundId);
        return;
      }

      if (uncertain || isUnknownCreateOutcome(error)) {
        setUncertainFundId(variables.scope.fundId);
        setUncertain(true);
        setAlreadyRecorded(false);
        setCanDiscard(false);
        const since = Date.now();
        const submittedFundId = variables.scope.fundId;
        const isSubmittedFundList = (key: QueryKey) =>
          key[0] === 'portfolio-companies' && key[1] === submittedFundId;
        void refreshCompanyList(submittedFundId).then(() =>
          setCanDiscard(fundListRefreshedSince(queryClient, isSubmittedFundList, since))
        );
        return;
      }

      console.error('[AddCompanyDialog] create failed', error);
      setServerError(ADD_COMPANY_SERVER_ERROR);
      toast({
        title: 'Unable to add company',
        description: ADD_COMPANY_SERVER_ERROR,
        variant: 'destructive',
      });
    },
  });

  const handleFieldChange = (field: AddCompanyField, value: string) => {
    if (uncertain) return;
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

    createCompanyMutation.mutate({ values: parsed.data, scope: commandScope });
  };

  const discardAttempt = () => {
    idempotencyKey.reset();
    setUncertain(false);
    setCanDiscard(false);
    setServerError(null);
    setAlreadyRecorded(false);
    setForm(DEFAULT_FORM);
    setFieldErrors({});
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
          {(idempotencyKey.restored || uncertain || alreadyRecorded) && (
            <div aria-live="polite" className="space-y-2">
              {idempotencyKey.restored && (
                <Alert>
                  <AlertDescription>
                    An earlier attempt may already be recorded. Review the list or retry with the
                    same details.
                  </AlertDescription>
                </Alert>
              )}
              {uncertain && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" className="h-4 w-4" />
                  <AlertDescription>{COMPANY_UNCERTAIN_MESSAGE}</AlertDescription>
                </Alert>
              )}
              {alreadyRecorded && (
                <Alert>
                  <AlertDescription>{COMPANY_ALREADY_RECORDED_MESSAGE}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          {serverError && !uncertain && !alreadyRecorded ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
          <fieldset disabled={createCompanyMutation.isPending || uncertain}>
            <div className="space-y-2">
              <Label htmlFor="portfolio-company-name">Company name</Label>
              <Input
                id="portfolio-company-name"
                value={form.name}
                onChange={(event) => handleFieldChange('name', event.target.value)}
                placeholder="Northwind AI"
              />
              {fieldErrors.name ? <p className="text-sm text-error">{fieldErrors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolio-company-sector">Sector</Label>
              <Select
                value={form.sector}
                onValueChange={(value) => handleFieldChange('sector', value)}
              >
                <SelectTrigger id="portfolio-company-sector">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SECTORS.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.sector ? (
                <p className="text-sm text-error">{fieldErrors.sector}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolio-company-stage">Stage</Label>
              <Select
                value={form.stage}
                onValueChange={(value) => handleFieldChange('stage', value)}
              >
                <SelectTrigger id="portfolio-company-stage">
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
              {fieldErrors.stage ? <p className="text-sm text-error">{fieldErrors.stage}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolio-company-investment-amount">Initial investment ($)</Label>
              <Input
                id="portfolio-company-investment-amount"
                type="text"
                inputMode="decimal"
                value={form.investmentAmount}
                onChange={(event) => handleFieldChange('investmentAmount', event.target.value)}
                placeholder="1,500,000"
              />
              {fieldErrors.investmentAmount ? (
                <p className="text-sm text-error">{fieldErrors.investmentAmount}</p>
              ) : null}
            </div>
          </fieldset>

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
              ) : uncertain ? (
                'Retry create'
              ) : (
                'Create Company'
              )}
            </Button>
            {uncertain && canDiscard && (
              <Button type="button" variant="outline" onClick={discardAttempt}>
                Discard attempt
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
