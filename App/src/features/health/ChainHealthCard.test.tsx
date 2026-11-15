import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ChainHealthCard } from './ChainHealthCard';

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChainHealthCard />
    </QueryClientProvider>,
  );
}

function mockFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  return fetchMock;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ChainHealthCard', () => {
  it('muestra que todo funciona cuando la cadena responde ok', async () => {
    const fetchMock = mockFetch(json(200, { data: { ok: true } }));

    renderCard();

    expect(await screen.findByText('Todo funciona')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/isAliveChain', expect.anything());
  });

  it('muestra el mensaje y el código que manda el Gateway', async () => {
    mockFetch(
      json(503, {
        error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible en este momento.' },
      }),
    );

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible en este momento.');
    expect(screen.getByText('Código: SERVICE_UNAVAILABLE')).toBeInTheDocument();
  });

  it('muestra un mensaje propio si no llega al servidor, y se recupera al reintentar', async () => {
    mockFetch(new TypeError('Failed to fetch'), json(200, { data: { ok: true } }));

    renderCard();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo contactar al servidor.');

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Todo funciona')).toBeInTheDocument();
  });

  it('trata como error un 200 que no trae el sobre del Gateway', async () => {
    mockFetch(new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo contactar al servidor.');
  });

  it('deja de mostrar que todo funciona si al reintentar falla', async () => {
    mockFetch(json(200, { data: { ok: true } }), new TypeError('Failed to fetch'));

    renderCard();
    expect(await screen.findByText('Todo funciona')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo contactar al servidor.');
    expect(screen.queryByText('Todo funciona')).not.toBeInTheDocument();
  });
});
