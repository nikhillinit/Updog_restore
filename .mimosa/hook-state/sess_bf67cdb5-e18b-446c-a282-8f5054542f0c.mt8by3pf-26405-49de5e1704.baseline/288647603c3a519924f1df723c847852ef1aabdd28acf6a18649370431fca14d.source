export function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; message?: string };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      candidate.message?.includes(constraintName) === true)
  );
}
