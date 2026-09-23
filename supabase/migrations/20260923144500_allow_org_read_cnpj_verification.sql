-- Permite que membros da mesma organização vejam apenas o resumo de verificação cadastral.
-- A tabela continua sem permissão de escrita para usuários autenticados.

drop policy if exists publisher_cnpj_verifications_admin_read on public.publisher_cnpj_verifications;
drop policy if exists publisher_cnpj_verifications_org_read on public.publisher_cnpj_verifications;

create policy publisher_cnpj_verifications_org_read
on public.publisher_cnpj_verifications
for select
to authenticated
using (private.org_role(organization_id) is not null);
