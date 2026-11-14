export interface ICheckDatabaseHealth {
  check(): Promise<boolean>;
}
export const ICheckDatabaseHealth = 'ICheckDatabaseHealth';
