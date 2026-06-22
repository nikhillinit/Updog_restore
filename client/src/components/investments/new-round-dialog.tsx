import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Btn } from '@/components/presson-v2/primitives';
import { useCreateRound } from '@/hooks/useCreateRound';
import {
  toInvestmentRoundCreatePayload,
  type InvestmentRoundEditForm,
} from '@/lib/investment-round-edit-model';
import { roundErrorMessage } from '@/lib/investment-round-error';

interface SupersedeTarget {
  id: number;
  roundName: string;
  roundDate: string;
}

interface NewRoundDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  investmentId: number;
  fundId: number;
  companyName?: string;
  supersedesRound?: SupersedeTarget | null;
}

const SECURITY_OPTIONS = ['Equity', 'Convertible Note', 'SAFE', 'Warrant', 'Other'];
const CURRENCY_OPTIONS = [
  'United States Dollar ($)',
  'Euro (€)',
  'British Pound (£)',
  'Canadian Dollar (CAD)',
];

export default function NewRoundDialog({
  isOpen,
  onOpenChange,
  investmentId,
  fundId,
  companyName,
  supersedesRound,
}: NewRoundDialogProps) {
  const [securityType, setSecurityType] = useState('Equity');
  const [roundName, setRoundName] = useState('');
  const [roundDate, setRoundDate] = useState('');
  const [currency, setCurrency] = useState('United States Dollar ($)');
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [roundSize, setRoundSize] = useState('');
  const [preMoneyValuation, setPreMoneyValuation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateRound(investmentId);
  const isCorrection = supersedesRound != null;

  const reset = () => {
    setSecurityType('Equity');
    setRoundName('');
    setRoundDate('');
    setCurrency('United States Dollar ($)');
    setInvestmentAmount('');
    setRoundSize('');
    setPreMoneyValuation('');
    setError(null);
  };

  const close = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleSave = () => {
    setError(null);
    if (!roundName.trim() || !roundDate || investmentAmount.trim() === '') {
      setError('Round name, date, and investment amount are required.');
      return;
    }

    const form: InvestmentRoundEditForm = {
      roundName: roundName.trim(),
      securityType,
      roundDate,
      currency,
      investmentAmount: Number(investmentAmount),
      roundSize: roundSize.trim() === '' ? null : Number(roundSize),
      preMoneyValuation: preMoneyValuation.trim() === '' ? null : Number(preMoneyValuation),
      supersedesRoundId: supersedesRound?.id ?? null,
    };

    let payload;
    try {
      payload = toInvestmentRoundCreatePayload(form, fundId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid round values.');
      return;
    }

    mutation.mutate(payload, {
      onSuccess: () => close(false),
      onError: (e) => setError(roundErrorMessage(e)),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCorrection ? 'Correct round' : 'Add round'}</DialogTitle>
          <DialogDescription>
            {isCorrection
              ? 'Record a corrected round; the original is superseded.'
              : `Add an investment round${companyName ? ` for ${companyName}` : ''}.`}
          </DialogDescription>
        </DialogHeader>

        {isCorrection && supersedesRound && (
          <div className="pv2-supersede-banner">
            Correcting {supersedesRound.roundName} ({supersedesRound.roundDate})
          </div>
        )}

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-security">
            Security type
          </label>
          <select
            id="round-security"
            className="pv2-select"
            value={securityType}
            onChange={(e) => setSecurityType(e.target.value)}
          >
            {SECURITY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-name">
            Round name
          </label>
          <input
            id="round-name"
            className="pv2-input"
            value={roundName}
            onChange={(e) => setRoundName(e.target.value)}
            placeholder="Series A"
          />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-date">
            Round date
          </label>
          <input
            id="round-date"
            type="date"
            className="pv2-input"
            value={roundDate}
            onChange={(e) => setRoundDate(e.target.value)}
          />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-currency">
            Currency
          </label>
          <select
            id="round-currency"
            className="pv2-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-amount">
            Investment amount
          </label>
          <input
            id="round-amount"
            className="pv2-input"
            inputMode="decimal"
            value={investmentAmount}
            onChange={(e) => setInvestmentAmount(e.target.value)}
            placeholder="25000"
          />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-size">
            Round size (optional)
          </label>
          <input
            id="round-size"
            className="pv2-input"
            inputMode="decimal"
            value={roundSize}
            onChange={(e) => setRoundSize(e.target.value)}
          />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-premoney">
            Pre-money valuation (optional)
          </label>
          <input
            id="round-premoney"
            className="pv2-input"
            inputMode="decimal"
            value={preMoneyValuation}
            onChange={(e) => setPreMoneyValuation(e.target.value)}
          />
        </div>

        {error && (
          <div className="pv2-form-error" role="alert">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12 }}>
          <Btn onClick={() => close(false)}>Cancel</Btn>
          <Btn primary onClick={handleSave}>
            {mutation.isPending ? 'Saving…' : isCorrection ? 'Save correction' : 'Add round'}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
