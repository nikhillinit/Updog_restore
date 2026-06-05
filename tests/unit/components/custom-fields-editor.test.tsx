import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns/format';
import { describe, expect, it, vi } from 'vitest';

import CustomFieldsEditor from '@/components/custom-fields/custom-fields-editor';
import type { CustomField } from '@/components/custom-fields/custom-fields-manager';

describe('CustomFieldsEditor', () => {
  it('opens the date popover and writes the selected date value', async () => {
    const user = userEvent.setup();
    const onValuesChange = vi.fn();
    const today = new Date();
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayLabel = new RegExp(format(todayAtMidnight, 'MMMM do, yyyy'), 'i');
    const fields: CustomField[] = [
      {
        id: 'close-date',
        name: 'Close Date',
        type: 'date',
      },
    ];

    render(<CustomFieldsEditor fields={fields} values={[]} onValuesChange={onValuesChange} />);

    await user.click(screen.getByRole('button', { name: /pick a date/i }));
    await user.click(screen.getByRole('button', { name: todayLabel }));

    expect(onValuesChange).toHaveBeenCalledWith([
      { fieldId: 'close-date', value: todayAtMidnight.toISOString() },
    ]);
  });
});
