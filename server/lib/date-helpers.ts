/**
 * Calculate the number of whole calendar months since a date.
 */
export function monthsSince(date: Date, now: Date = new Date()): number {
  const years = now.getFullYear() - date.getFullYear();
  const months = now.getMonth() - date.getMonth();
  return years * 12 + months;
}
