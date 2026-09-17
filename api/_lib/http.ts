import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Readable } from 'node:stream';

async function readRequestBody(req: VercelRequest): Promise<Buffer> {
  const withRaw = req as VercelRequest & { rawBody?: Buffer };
  if (Buffer.isBuffer(withRaw.rawBody)) {
    return withRaw.rawBody;
  }

  // bodyParser: false — consume the IncomingMessage stream
  const stream = req as unknown as Readable;
  if (typeof stream.on === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (req.body != null) {
    return Buffer.from(JSON.stringify(req.body));
  }
  return Buffer.alloc(0);
}

/** Convert a Vercel Node request into a Web Request for shared handlers. */
export async function toWebRequest(req: VercelRequest): Promise<Request> {
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protoHeader = req.headers['x-forwarded-proto'] || 'https';
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const url = `${proto}://${host}${req.url || '/'}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  const bodyBuffer = await readRequestBody(req);
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    body: bodyBuffer.length ? new Uint8Array(bodyBuffer) : undefined,
  };
  if (bodyBuffer.length) {
    init.duplex = 'half';
  }
  return new Request(url, init);
}

/** Pipe a Web Response into a Vercel Node response. */
export async function sendWebResponse(res: VercelResponse, response: Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.send(buffer);
}
