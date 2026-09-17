import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const ROUTES: Record<string, { modulePath: string; exportName: string }> = {
  '/api/analyze-income': {
    modulePath: '/src/income-verification/server/analyzeIncome.ts',
    exportName: 'handleAnalyzeIncome',
  },
  '/api/blob/upload': {
    modulePath: '/src/income-verification/server/blobUpload.ts',
    exportName: 'handleBlobUpload',
  },
  '/api/blob/discard': {
    modulePath: '/src/income-verification/server/blobDiscard.ts',
    exportName: 'handleBlobDiscard',
  },
  '/api/blob/status': {
    modulePath: '/src/income-verification/server/blobStatus.ts',
    exportName: 'handleBlobStatus',
  },
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function handleApi(
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const route = ROUTES[pathname];
  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const method = (req.method || 'GET').toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  const host = req.headers.host || 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const requestInit: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    body: body && body.length ? new Uint8Array(body) : undefined,
  };
  if (body && body.length) {
    requestInit.duplex = 'half';
  }
  const request = new Request(`http://${host}${req.url || pathname}`, requestInit);

  const mod = await server.ssrLoadModule(route.modulePath);
  const handler = mod[route.exportName] as (request: Request) => Promise<Response>;
  const response = await handler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

/** Local Vite middleware that serves Income Verification /api handlers. */
export function incomeVerificationApiPlugin(): Plugin {
  return {
    name: 'income-verification-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (!pathname || !ROUTES[pathname]) {
          next();
          return;
        }
        handleApi(server, req, res, pathname).catch((error) => {
          console.error('[income-verification-api]', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });
      });
    },
  };
}
