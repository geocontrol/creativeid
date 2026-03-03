/**
 * Standard API response envelope for all /api/v1 routes.
 */
export function apiResponse<T>(
  data: T,
  meta: { ciid: string; contentHash: string | null },
): Response {
  const body = {
    data,
    meta: {
      ciid: meta.ciid,
      content_hash: meta.contentHash ?? null,
      generated_at: new Date().toISOString(),
    },
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

export function apiError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
