import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/apiClient';

interface HealthResponse {
  ok: boolean;
}

// GET /isAliveChain: recorre Gateway → Business → DataAccess → PostgreSQL.
export function useChainHealth() {
  return useQuery({
    queryKey: ['health', 'chain'],
    queryFn: ({ signal }) => apiGet<HealthResponse>('/isAliveChain', signal),
    // Es un chequeo: mejor mostrar el estado real enseguida que reintentar en silencio.
    retry: false,
  });
}
