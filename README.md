# RADAR - CRM EDITORAS

CRM interno de prospecção editorial da Radar.

## Produção

- Frontend: Vercel (`radar-crm`)
- Banco, autenticação e storage: Supabase (`radar-crm`)
- URL oficial: `https://radar-crm-lac.vercel.app`

## Desenvolvimento

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```

## Segurança

- O repositório está **temporariamente público** durante o desenvolvimento para permitir deployments no plano Hobby da Vercel. Ao estabilizar o fluxo de deploy autenticado, deve voltar a privado.
- Nunca adicionar chave `service_role`/secret do Supabase ao frontend ou ao repositório.
- A chave publishable do Supabase pode existir no cliente; a autorização dos dados depende de Auth + RLS.
- Dados comerciais não ficam no GitHub; ficam no Supabase.
