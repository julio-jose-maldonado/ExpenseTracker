import express, { Router } from 'express';
import { findEndpointId, listEndpoints } from '../src/Shared/RateLimit/Endpoints';

function createApp() {
  const app = express();
  // Un middleware cualquiera antes de las rutas: no es un endpoint.
  app.use(express.json());
  const router = Router();
  router.get('/items', (_req, res) => res.end());
  router.post('/items', (_req, res) => res.end());
  router.get('/items/:id', (_req, res) => res.end());
  router.all('/any', (_req, res) => res.end());
  app.use(router);
  app.get('/direct', (_req, res) => res.end());
  return app;
}

function endpointsOf(register: (router: Router) => void) {
  const app = express();
  const router = Router();
  register(router);
  app.use(router);
  return listEndpoints(app);
}

describe('listEndpoints', () => {
  it('lista los endpoints registrados, con método y ruta', () => {
    const ids = listEndpoints(createApp()).map((endpoint) => endpoint.id);

    expect(ids).toEqual(['GET /items', 'POST /items', 'GET /items/:id', 'ALL /any', 'GET /direct']);
  });

  it('falla si un router está montado con prefijo: la ruta completa no se podría conocer', () => {
    const app = express();
    const router = Router();
    router.get('/:id', (_req, res) => res.end());
    app.use('/items', router);

    expect(() => listEndpoints(app)).toThrow('prefijo');
  });
});

describe('findEndpointId', () => {
  const endpoints = listEndpoints(createApp());

  it('encuentra el endpoint por método y path', () => {
    expect(findEndpointId(endpoints, 'GET', '/items')).toBe('GET /items');
    expect(findEndpointId(endpoints, 'POST', '/items')).toBe('POST /items');
  });

  it('distintos valores de un parámetro son el mismo endpoint', () => {
    expect(findEndpointId(endpoints, 'GET', '/items/1')).toBe('GET /items/:id');
    expect(findEndpointId(endpoints, 'GET', '/items/2')).toBe('GET /items/:id');
  });

  it('coincide igual que Express: sin distinguir mayúsculas y con barra final', () => {
    expect(findEndpointId(endpoints, 'GET', '/ITEMS/')).toBe('GET /items');
  });

  it('HEAD lo atiende la ruta GET', () => {
    expect(findEndpointId(endpoints, 'HEAD', '/items')).toBe('GET /items');
  });

  it('una ruta registrada con all atiende cualquier método', () => {
    expect(findEndpointId(endpoints, 'GET', '/any')).toBe('ALL /any');
    expect(findEndpointId(endpoints, 'DELETE', '/any')).toBe('ALL /any');
  });

  // Express corta el request en esa ruta con un error: tiene que contarse en ella, no quedar sin contar.
  it('un parámetro con una codificación inválida sigue siendo ese endpoint', () => {
    expect(findEndpointId(endpoints, 'GET', '/items/%zz')).toBe('GET /items/:id');
  });

  it('no encuentra nada si el método o el path no corresponden a una ruta', () => {
    expect(findEndpointId(endpoints, 'DELETE', '/items')).toBeUndefined();
    expect(findEndpointId(endpoints, 'GET', '/no-existe')).toBeUndefined();
  });
});

// Express usa la primera ruta registrada que coincide: el rate limit tiene que elegir la misma.
describe('findEndpointId: rutas que se superponen', () => {
  it('una ruta all registrada antes que la GET es la que atiende el GET', () => {
    const endpoints = endpointsOf((router) => {
      router.all('/overlap', (_req, res) => res.end());
      router.get('/overlap', (_req, res) => res.end());
    });

    expect(findEndpointId(endpoints, 'GET', '/overlap')).toBe('ALL /overlap');
  });

  it('una ruta GET registrada antes que la all es la que atiende el GET', () => {
    const endpoints = endpointsOf((router) => {
      router.get('/overlap', (_req, res) => res.end());
      router.all('/overlap', (_req, res) => res.end());
    });

    expect(findEndpointId(endpoints, 'GET', '/overlap')).toBe('GET /overlap');
    expect(findEndpointId(endpoints, 'POST', '/overlap')).toBe('ALL /overlap');
  });

  it('una ruta GET registrada antes que la HEAD es la que atiende el HEAD', () => {
    const endpoints = endpointsOf((router) => {
      router.get('/overlap', (_req, res) => res.end());
      router.head('/overlap', (_req, res) => res.end());
    });

    expect(findEndpointId(endpoints, 'HEAD', '/overlap')).toBe('GET /overlap');
  });

  it('con dos rutas del mismo método, gana la primera registrada', () => {
    const endpoints = endpointsOf((router) => {
      router.get('/items/:id', (_req, res) => res.end());
      router.get('/items/latest', (_req, res) => res.end());
    });

    expect(findEndpointId(endpoints, 'GET', '/items/latest')).toBe('GET /items/:id');
  });
});
