import { pdfResponse } from '@/lib/pdfRoute';
import { tokenFor } from '@/lib/links';

export const dynamic = 'force-dynamic';

// Readable link: /i/<event code>/<mobile>/invitation.pdf
export async function GET(req, { params }) {
  const { token: code, mobile } = await params;
  const t = await tokenFor(code, mobile);
  if (!t) return new Response('This invitation link is not valid.', { status: 404 });
  return pdfResponse(t);
}
