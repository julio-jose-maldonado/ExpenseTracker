import type { Messages } from './es';

// Tipado contra `es`: si falta una clave o sobra una, no compila.
export const en: Messages = {
  app: {
    title: 'ExpenseTracker',
    subtitle: 'Expense tracker',
  },
  health: {
    title: 'System status',
    description: 'App → Gateway → Business → DataAccess → PostgreSQL',
    checking: 'Checking…',
    ok: 'Everything works',
    unreachable: 'Could not reach the server.',
    retry: 'Retry',
    errorCode: 'Code: {{code}}',
  },
};
