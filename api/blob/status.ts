import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleBlobStatus } from '../../src/income-verification/server/blobStatus';
import { sendWebResponse, toWebRequest } from '../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const request = await toWebRequest(req);
  const response = await handleBlobStatus(request);
  await sendWebResponse(res, response);
}
