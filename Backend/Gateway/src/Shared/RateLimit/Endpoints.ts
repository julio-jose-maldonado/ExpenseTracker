import type { Express } from 'express';

// Método de las rutas registradas con `all`: atienden cualquier método.
const ANY_METHOD = 'ALL';

// Un endpoint del Gateway: método + ruta tal como se registró (`GET /expenses/:id`, `ALL /webhook`).
export interface Endpoint {
  id: string;
  // Si Express le daría a esta ruta un request con ese método y ese path.
  matches(method: string, path: string): boolean;
}

// Lo que se usa de las capas internas del router de Express 5 (paquete `router`). No es API documentada:
// Express y `router` están fijados a una versión exacta (`router` con un override en pnpm-workspace.yaml)
// y Endpoints.test.ts avisa si un upgrade cambia esta forma.
interface RouterLayer {
  // Presente en las capas que son una ruta (`router.get(...)`).
  route?: { path: unknown; methods: Record<string, boolean> };
  // Un router montado con `use` tiene su propia lista de capas.
  handle: { stack?: RouterLayer[] };
  // true si la capa se montó sin prefijo (`use(router)`).
  slash: boolean;
  // Los mismos matchers con los que Express decide si un path corresponde a la capa.
  matchers: Array<(path: string) => unknown>;
}

// Recorre las rutas registradas en la app. El rate limit corre antes del ruteo, así que necesita
// saber por su cuenta a qué endpoint va cada request.
export function listEndpoints(app: Express): Endpoint[] {
  return endpointsFromStack((app.router as unknown as { stack: RouterLayer[] }).stack);
}

function endpointsFromStack(stack: RouterLayer[]): Endpoint[] {
  return stack.flatMap((layer) => {
    if (layer.route) return endpointsFromRoute(layer as RouterLayer & { route: NonNullable<RouterLayer['route']> });
    if (!layer.handle.stack) return [];
    // Express no guarda el prefijo con el que se montó un router: no habría forma de armar la ruta completa.
    if (!layer.slash) {
      throw new Error('Rate limit: los routers se montan sin prefijo (la ruta completa va en cada controller)');
    }
    return endpointsFromStack(layer.handle.stack);
  });
}

function endpointsFromRoute(layer: RouterLayer & { route: NonNullable<RouterLayer['route']> }): Endpoint[] {
  const { path, methods } = layer.route;
  if (typeof path !== 'string') throw new Error('Rate limit: cada ruta se registra con un único path de texto');
  const matchesPath = (candidate: string) => layer.matchers.some((matcher) => matchesOrFailsDecoding(matcher, candidate));
  return Object.keys(methods)
    .filter((method) => methods[method])
    .map((method) => (method === '_all' ? ANY_METHOD : method.toUpperCase()))
    .map((method) => {
      // Express atiende un HEAD con la ruta GET cuando esa ruta no tiene un HEAD propio.
      const servesHead = method === 'GET' && !methods.head;
      const matchesMethod = (wanted: string) => method === ANY_METHOD || method === wanted || (wanted === 'HEAD' && servesHead);
      return { id: `${method} ${path}`, matches: (wanted, candidate) => matchesMethod(wanted) && matchesPath(candidate) };
    });
}

// El matcher lanza si el path coincide con la ruta pero un parámetro trae una codificación inválida
// (`/expenses/%zz`). Express corta el request en esa ruta con ese error, así que cuenta como coincidencia:
// si se dejara propagar, esos requests saldrían del rate limit sin haberse contado.
function matchesOrFailsDecoding(matcher: (path: string) => unknown, candidate: string): boolean {
  try {
    return Boolean(matcher(candidate));
  } catch {
    return true;
  }
}

export function findEndpointId(endpoints: Endpoint[], method: string, path: string): string | undefined {
  // En el orden en que se registraron: Express usa la primera ruta que coincide.
  return endpoints.find((endpoint) => endpoint.matches(method, path))?.id;
}
