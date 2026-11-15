import { useTranslation } from 'react-i18next';
import { ChainHealthCard } from '@/features/health/ChainHealthCard';

export function App() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col items-center gap-8 px-4 py-12 sm:py-20">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('app.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('app.subtitle')}</p>
      </header>
      <ChainHealthCard />
    </main>
  );
}
