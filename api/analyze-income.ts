import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAnalyzeIncome } from '../src/income-verification/server/analyzeIncome';
import { sendWebResponse, toWebRequest } from './_lib/http';

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const request = await toWebRequest(req);
  const response = await handleAnalyzeIncome(request);
  await sendWebResponse(res, response);
}
