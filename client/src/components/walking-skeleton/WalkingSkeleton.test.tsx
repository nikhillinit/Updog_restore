import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalkingSkeleton } from './WalkingSkeleton';

describe('Walking Skeleton', () => {
  it('should complete end-to-end flow', async () => {
    render(<WalkingSkeleton />);
    
    const input = screen.getByTestId('fund-size-input');
    expect(input).toBeInTheDocument();
    
    fireEvent.change(input, { target: { value: '20000000' } });
    
    const button = screen.getByTestId('calculate-button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const result = screen.getByTestId('result-display');
      expect(result).toBeInTheDocument();
      expect(result).toHaveTextContent('4.0M');
    });
  });
});
