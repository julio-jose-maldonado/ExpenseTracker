export interface ICheckDataAccessHealth {
  check(): Promise<boolean>;
}
export const ICheckDataAccessHealth = 'ICheckDataAccessHealth';
