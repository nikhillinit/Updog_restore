export interface ReservesSuccess {
  companiesFunded: number;
  utilization: number;
}

export const metrics = {
  recordReservesDuration(_ms: number) { /* noop */ },
  recordReservesSuccess(_p: ReservesSuccess) { /* noop */ },
  recordReservesError(_reason: string) { /* noop */ },
  recordReservesRequest(_p: Record<string, unknown>) { /* noop */ },
};