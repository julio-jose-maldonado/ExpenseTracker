import { CircleAlert, CircleCheck, LoaderCircle, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, NETWORK_ERROR_CODE } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useChainHealth } from './useChainHealth';

function errorText(error: Error, fallback: string): { message: string; code?: string } {
  if (error instanceof ApiError && error.code !== NETWORK_ERROR_CODE) {
    return { message: error.message, code: error.code };
  }
  return { message: fallback };
}

export function ChainHealthCard() {
  const { t } = useTranslation();
  const { data, error, isPending, isFetching, refetch } = useChainHealth();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('health.title')}</CardTitle>
        <CardDescription>{t('health.description')}</CardDescription>
      </CardHeader>
      <CardContent aria-live="polite">
        {isPending && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            {t('health.checking')}
          </p>
        )}
        {/* Si un reintento falla, TanStack Query conserva el último data: el error manda. */}
        {data?.ok && !error && (
          <p className="flex items-center gap-2 text-success">
            <CircleCheck aria-hidden="true" />
            {t('health.ok')}
          </p>
        )}
        {error && <HealthError {...errorText(error, t('health.unreachable'))} />}
        {data && !data.ok && !error && <HealthError message={t('health.unreachable')} />}
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RotateCw className={isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
          {t('health.retry')}
        </Button>
      </CardFooter>
    </Card>
  );
}

function HealthError({ message, code }: { message: string; code?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 text-destructive" role="alert">
      <CircleAlert className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p>{message}</p>
        {code && <p className="text-sm text-muted-foreground">{t('health.errorCode', { code })}</p>}
      </div>
    </div>
  );
}
