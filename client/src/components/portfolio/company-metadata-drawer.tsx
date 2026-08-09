import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';

import type { PortfolioCompany } from '@shared/schema';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { invalidatePortfolioData } from '@/lib/invalidate-portfolio-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

interface CompanyMetadataDrawerProps {
  company: PortfolioCompany;
  fundId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetadataForm {
  name: string;
  sector: string;
  foundedYear: string;
  description: string;
  dealTags: string;
}

function formFromCompany(company: PortfolioCompany): MetadataForm {
  return {
    name: company.name,
    sector: company.sector,
    foundedYear: company.foundedYear === null ? '' : String(company.foundedYear),
    description: company.description ?? '',
    dealTags: company.dealTags?.join(', ') ?? '',
  };
}

function randomIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  return cryptoApi?.randomUUID?.() ?? `portfolio-company-${Date.now()}-${Math.random()}`;
}

function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.errorCode === 'VERSION_CONFLICT'
  );
}

export function CompanyMetadataDrawer({
  company,
  fundId,
  open,
  onOpenChange,
}: CompanyMetadataDrawerProps) {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef<string | null>(null);
  const [form, setForm] = useState<MetadataForm>(() => formFromCompany(company));
  const [expectedVersion, setExpectedVersion] = useState(company.rowVersion);
  const [conflict, setConflict] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<keyof MetadataForm>>(() => new Set());
  const draftForRefresh = useRef<{
    form: MetadataForm;
    dirtyFields: Set<keyof MetadataForm>;
  } | null>(null);
  const formRef = useRef(form);
  const dirtyFieldsRef = useRef(dirtyFields);

  useEffect(() => {
    formRef.current = form;
    dirtyFieldsRef.current = dirtyFields;
  }, [dirtyFields, form]);

  useEffect(() => {
    const preserved = draftForRefresh.current;
    if (preserved) {
      const authoritative = formFromCompany(company);
      setForm({
        ...authoritative,
        ...Object.fromEntries(
          [...preserved.dirtyFields].map((field) => [field, preserved.form[field]])
        ),
      } as MetadataForm);
      setDirtyFields(new Set(preserved.dirtyFields));
      draftForRefresh.current = null;
    } else if (dirtyFieldsRef.current.size > 0) {
      const authoritative = formFromCompany(company);
      setForm({
        ...authoritative,
        ...Object.fromEntries(
          [...dirtyFieldsRef.current].map((field) => [field, formRef.current[field]])
        ),
      } as MetadataForm);
    } else {
      setForm(formFromCompany(company));
      setDirtyFields(new Set());
      setExpectedVersion(company.rowVersion);
      setConflict(false);
      idempotencyKey.current = null;
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (values: MetadataForm) => {
      const key = idempotencyKey.current ?? randomIdempotencyKey();
      idempotencyKey.current = key;
      return apiRequest<PortfolioCompany>(
        'PATCH',
        `/api/portfolio-companies/${company.id}?fundId=${fundId}`,
        {
          expectedVersion,
          patch: {
            name: values.name,
            sector: values.sector,
            foundedYear: values.foundedYear === '' ? null : Number(values.foundedYear),
            description: values.description === '' ? null : values.description,
            dealTags:
              values.dealTags === ''
                ? null
                : values.dealTags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
          },
        },
        {
          headers: { 'Idempotency-Key': key },
        }
      );
    },
    onSuccess: (updatedCompany) => {
      setForm(formFromCompany(updatedCompany));
      setDirtyFields(new Set());
      setExpectedVersion(updatedCompany.rowVersion);
      idempotencyKey.current = null;
      setConflict(false);
      queryClient.setQueryData(
        ['portfolio-company', fundId, company.id],
        updatedCompany
      );
      invalidatePortfolioData(queryClient, fundId);
      void queryClient.invalidateQueries({ queryKey: ['portfolio-company', fundId, company.id] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      setConflict(isVersionConflict(error));
    },
  });

  const setField = (field: keyof MetadataForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirtyFields((current) => new Set(current).add(field));
    setConflict(false);
  };

  const refreshAuthoritative = async () => {
    const draft = { form: formRef.current, dirtyFields: new Set(dirtyFieldsRef.current) };
    draftForRefresh.current = draft;
    await queryClient.refetchQueries({ queryKey: ['portfolio-company', fundId, company.id] });
    const authoritative = queryClient.getQueryData<PortfolioCompany>([
      'portfolio-company',
      fundId,
      company.id,
    ]);
    if (authoritative) {
      const authoritativeForm = formFromCompany(authoritative);
      setForm({
        ...authoritativeForm,
        ...Object.fromEntries([...draft.dirtyFields].map((field) => [field, draft.form[field]])),
      } as MetadataForm);
      setExpectedVersion(authoritative.rowVersion);
      draftForRefresh.current = null;
      setConflict(false);
    }
    if (authoritative) {
      idempotencyKey.current = null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-presson-borderSubtle bg-presson-surface sm:max-w-lg"
        data-testid="company-metadata-drawer"
      >
        <SheetHeader>
          <SheetTitle className="text-presson-text">Edit company metadata</SheetTitle>
          <SheetDescription className="text-presson-textMuted">
            Update descriptive fields only. Lifecycle and financial fields remain unchanged.
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-6 flex h-[calc(100vh-12rem)] flex-col gap-5 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate(form);
          }}
        >
          {conflict ? (
            <Alert variant="destructive" data-testid="company-metadata-version-conflict">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Company changed elsewhere</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Your edits are preserved. Refresh authoritative data before trying again.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshAuthoritative()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh authoritative data
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="company-metadata-name">Name</Label>
            <Input
              id="company-metadata-name"
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-metadata-sector">Sector</Label>
            <Input
              id="company-metadata-sector"
              value={form.sector}
              onChange={(event) => setField('sector', event.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-metadata-founded-year">Founded year</Label>
            <Input
              id="company-metadata-founded-year"
              type="number"
              inputMode="numeric"
              value={form.foundedYear}
              onChange={(event) => setField('foundedYear', event.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-metadata-description">Description</Label>
            <Textarea
              id="company-metadata-description"
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              disabled={updateMutation.isPending}
              className="min-h-28 border-presson-borderSubtle focus-visible:ring-presson-accent"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-metadata-deal-tags">Deal tags</Label>
            <Input
              id="company-metadata-deal-tags"
              value={form.dealTags}
              onChange={(event) => setField('dealTags', event.target.value)}
              placeholder="AI, Enterprise, Follow-on"
              disabled={updateMutation.isPending}
            />
            <p className="text-xs text-presson-textMuted">Separate tags with commas.</p>
          </div>

          <SheetFooter className="mt-auto gap-2 border-t border-presson-borderSubtle pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save metadata'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
