import { pdfResponse } from '@/lib/pdfRoute';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { token } = await params;
  return pdfResponse(token);
}
