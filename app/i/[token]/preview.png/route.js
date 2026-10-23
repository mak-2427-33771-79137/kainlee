import { previewImageResponse } from '@/lib/cardRoute';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { token } = await params;
  return previewImageResponse(token);
}
