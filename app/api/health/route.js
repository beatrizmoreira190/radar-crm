export async function GET() {
  return Response.json({
    ok: true,
    service: 'radar-crm-editoras',
    version: '3.1.1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
  });
}
