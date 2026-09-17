import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleBlobDiscard } from '../../src/income-verification/server/blobDiscard';
import { sendWebResponse, toWebRequest } from '../_lib/http';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const request = await toWebRequest(req);
  const response = await handleBlobDiscard(request);
  await sendWebResponse(res, response);
}
