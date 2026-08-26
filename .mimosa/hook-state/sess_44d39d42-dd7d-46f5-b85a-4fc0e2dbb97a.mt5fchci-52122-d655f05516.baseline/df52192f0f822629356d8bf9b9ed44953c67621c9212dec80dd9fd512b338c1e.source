import { describe, expect, it } from 'vitest';
import { toClientFund } from '../../../../server/routes/funds';

describe('toClientFund adapter', () => {
  it('converts decimal-string columns to numbers', () => {
    const row = {
      id: 1,
      name: 'Test Fund I',
      size: '100000000.00',
      managementFee: '0.02',
      carryPercentage: '0.20',
      deployedCapital: '5000000.50',
      vintageYear: 2024,
      status: 'active',
      engineResults: null,
      createdAt: new Date('2026-01-15T12:00:00Z'),
      establishmentDate: null,
      isActive: true,
    };

    const client = toClientFund(row);

    expect(client.size).toBe(100_000_000);
    expect(client.managementFee).toBe(0.02);
    expect(client.carryPercentage).toBe(0.2);
    expect(client.deployedCapital).toBe(5_000_000.5);
    expect(client.createdAt).toBe('2026-01-15T12:00:00.000Z');
    expect(typeof client.size).toBe('number');
    expect(typeof client.createdAt).toBe('string');
  });

  it('handles null deployedCapital safely', () => {
    const row = {
      id: 2,
      name: 'Test Fund II',
      size: '50000000',
      managementFee: '0.025',
      carryPercentage: '0.20',
      deployedCapital: null,
      vintageYear: 2025,
      status: 'active',
      engineResults: null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
      establishmentDate: null,
      isActive: true,
    };

    const client = toClientFund(row);

    expect(client.deployedCapital).toBe(0);
    expect(client.size).toBe(50_000_000);
  });

  it('passes through already serialized dates', () => {
    const row = {
      id: 3,
      name: 'Serialized Fund',
      size: '75000000',
      managementFee: '0.02',
      carryPercentage: '0.20',
      deployedCapital: '0',
      vintageYear: 2025,
      status: 'active',
      engineResults: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      establishmentDate: '2026-03-01',
      isActive: true,
    };

    const client = toClientFund(row);

    expect(client.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(client.establishmentDate).toBe('2026-03-01');
  });

  it('rejects non-numeric strings rather than silently emitting NaN', () => {
    const row = {
      id: 4,
      name: 'Bad Fund',
      size: 'not-a-number',
      managementFee: '0.02',
      carryPercentage: '0.20',
      deployedCapital: '0',
      vintageYear: 2025,
      status: 'active',
      engineResults: null,
      createdAt: new Date(),
      establishmentDate: null,
      isActive: true,
    };

    expect(() => toClientFund(row)).toThrow(/size/);
  });
});
