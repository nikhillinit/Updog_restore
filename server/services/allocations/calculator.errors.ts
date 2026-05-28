export class InvalidAllocationRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAllocationRowError';
  }
}
