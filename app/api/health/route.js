export async function GET() {
  return Response.json({ ok: true, service: 'radar-crm-editoras', version: '2.0.0' });
}
