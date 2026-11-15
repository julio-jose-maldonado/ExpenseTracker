// Textos propios de la App. Los mensajes de error del backend ya llegan traducidos desde el Gateway.
export const es = {
  app: {
    title: 'ExpenseTracker',
    subtitle: 'Anotador de gastos',
  },
  health: {
    title: 'Estado del sistema',
    description: 'App → Gateway → Business → DataAccess → PostgreSQL',
    checking: 'Verificando…',
    ok: 'Todo funciona',
    unreachable: 'No se pudo contactar al servidor.',
    retry: 'Reintentar',
    errorCode: 'Código: {{code}}',
  },
};

export type Messages = typeof es;
