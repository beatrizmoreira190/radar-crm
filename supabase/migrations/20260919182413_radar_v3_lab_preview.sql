-- Experimental Radar Score v3 laboratory.
-- Does not replace radar_v2 or modify publishers.score.

create table if not exists private.radar_profile_aliases_v3 (
  alias text primary key,
  canonical_profile text not null references private.radar_profile_weights(profile),
  note text
);

create index if not exists radar_profile_aliases_v3_canonical_profile_idx
  on private.radar_profile_aliases_v3(canonical_profile);

insert into private.radar_profile_aliases_v3(alias,canonical_profile,note) values
('Material didático','Didático','Sinônimo operacional'),
('Idiomas','Bilíngue/Idiomas','Categoria equivalente'),
('Inglês','Bilíngue/Idiomas','Idioma específico'),
('Educação bilíngue','Bilíngue/Idiomas','Categoria equivalente'),
('Literatura infantil','Infantil','Categoria equivalente'),
('Contos','Literatura','Gênero literário'),
('Crônica','Literatura','Gênero literário'),
('Cordel','Literatura brasileira','Gênero da literatura brasileira'),
('História','História/Humanidades','Categoria equivalente'),
('Memória','História/Humanidades','Categoria histórica/cultural'),
('Memória/Patrimônio','História/Humanidades','Categoria histórica/cultural'),
('História local','História/Humanidades','Categoria histórica/cultural'),
('Cultura brasileira','História/Humanidades','Categoria cultural/humanidades'),
('Cultura local','História/Humanidades','Categoria cultural/humanidades'),
('Cultura','Generalista','Categoria ampla; mapeamento conservador'),
('Cultura popular','Folclore','Categoria cultural correlata'),
('Cultura nordestina','Folclore','Categoria cultural regional'),
('Teatro','Teatro/Artes cênicas','Categoria equivalente'),
('Dramaturgia','Teatro/Artes cênicas','Gênero de artes cênicas'),
('RPG','RPG/Jogos','Categoria equivalente'),
('Games','RPG/Jogos','Categoria de jogos'),
('Atividades/Passatempos','Passatempos/Atividades','Categoria equivalente'),
('Negócios','Negócios/Administração','Categoria equivalente'),
('Gestão/Liderança','Negócios/Administração','Categoria equivalente'),
('Liderança/Gestão','Negócios/Administração','Categoria equivalente'),
('Comunicação','Comunicação/Marketing','Categoria equivalente'),
('Concursos públicos','Concursos/Preparatórios','Categoria equivalente'),
('Povos indígenas','Cultura indígena','Categoria equivalente'),
('Tecnologia educacional','Tecnologia','Categoria correlata; mapeamento conservador'),
('Desenvolvimento profissional','Técnico-profissional','Categoria correlata'),
('Ciência','Acadêmico/Científico','Categoria ampla; mapeamento conservador'),
('Ficção','Literatura','Categoria literária ampla'),
('Crítica literária','Literatura','Categoria de estudos literários'),
('Inteligência artificial','Tecnologia','Categoria tecnológica'),
('Ensino fundamental','Didático','Uso escolar'),
('Ensino médio','Didático','Uso escolar'),
('Reforço escolar','Didático','Uso escolar'),
('Apostilas','Didático','Material estruturado de ensino'),
('Alfabetização','Educação','Categoria educacional'),
('Educação especial','Educação','Categoria educacional'),
('Gestão educacional','Educação','Categoria educacional'),
('Matemática','Ciências exatas','Área de conhecimento'),
('Saúde mental','Saúde','Categoria de saúde'),
('Humor','Literatura','Gênero/linha literária'),
('Biografia/Memória','Biografia','Categoria equivalente'),
('Viagens','Não ficção','Categoria editorial correlata'),
('Viagens/Turismo','Não ficção','Categoria editorial correlata'),
('Pets/Animais','Não ficção','Categoria editorial correlata'),
('Aves','Não ficção','Categoria editorial correlata'),
('Anatomia','Medicina','Área médica'),
('Antropologia','Ciências sociais','Área de ciências sociais'),
('Audiovisual/Transmídia','Cinema','Categoria audiovisual'),
('Mangá','Quadrinhos/HQ','Categoria de quadrinhos'),
('ABA/Análise do comportamento','Psicologia','Área correlata'),
('Direito previdenciário','Direito','Subárea jurídica'),
('Direito constitucional','Direito','Subárea jurídica'),
('Direito administrativo','Direito','Subárea jurídica'),
('Direito de família','Direito','Subárea jurídica'),
('Processo civil','Direito','Subárea jurídica'),
('Filosofia do Direito','Direito','Subárea jurídica'),
('Teoria do Direito','Direito','Subárea jurídica'),
('Religião/Teologia','Teologia','Categoria equivalente'),
('Adventista','Religioso/Cristão','Vertente cristã'),
('Pregação','Discipulado','Conteúdo confessional'),
('Estudos bíblicos','Teologia','Conteúdo teológico'),
('Educação religiosa','Religioso/Cristão','Conteúdo confessional'),
('Diversidade/Equidade racial','Direitos humanos','Categoria de direitos/equidade'),
('Inclusão','Direitos humanos','Categoria de direitos/inclusão'),
('Habilidades socioemocionais','Psicologia','Categoria correlata')
on conflict(alias) do update
set canonical_profile=excluded.canonical_profile,note=excluded.note;

create or replace function private.radar_v3_preview(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  p public.publishers%rowtype;
  v_factor numeric:=0;
  v_profile_count integer:=0;
  v_mapped_count integer:=0;
  v_fit_lit integer:=0; v_fit_did integer:=0; v_fit_tec integer:=0; v_fit_lic integer:=0; v_fit_opp integer:=0;
  v_fit integer:=0;
  v_best_product text:=null;
  v_top_products jsonb:='[]'::jsonb;
  v_canonical_profiles jsonb:='[]'::jsonb;
  v_unknown_profiles jsonb:='[]'::jsonb;
  v_quality integer:=0;
  v_potential integer:=30;
  v_fit_points integer:=0; v_potential_points integer:=0; v_quality_points integer:=0;
  v_prelim integer:=0; v_final integer:=0;
  has_contact boolean:=false; has_decision_maker boolean:=false;
  latest_result text; latest_interest text; latest_at timestamptz; no_answer_count integer:=0;
begin
  select * into p from public.publishers where id=p_id;
  if not found then return null; end if;

  v_profile_count:=coalesce(cardinality(p.editorial_profile),0);

  with normalized as (
    select distinct ep.profile as source_profile,coalesce(w0.profile,a.canonical_profile) as canonical_profile
    from unnest(coalesce(p.editorial_profile,array[]::text[])) ep(profile)
    left join private.radar_profile_weights w0 on w0.profile=ep.profile
    left join private.radar_profile_aliases_v3 a on a.alias=ep.profile
  ),
  mapped as (
    select distinct n.canonical_profile,w.pnld_literario,w.pnld_didatico,w.pnld_tecnico_metodologico,w.radar_licitacoes,w.radar_oportunidades
    from normalized n join private.radar_profile_weights w on w.profile=n.canonical_profile
  ),
  per_product as (
    select product,value,canonical_profile,row_number() over(partition by product order by value desc,canonical_profile) rn
    from (
      select canonical_profile,'pnld_literario'::text product,pnld_literario value from mapped
      union all select canonical_profile,'pnld_didatico',pnld_didatico from mapped
      union all select canonical_profile,'pnld_tecnico_metodologico',pnld_tecnico_metodologico from mapped
      union all select canonical_profile,'radar_licitacoes',radar_licitacoes from mapped
      union all select canonical_profile,'radar_oportunidades',greatest(0,radar_oportunidades-15) from mapped
    ) x
  ),
  agg as (
    select product,
      coalesce(max(value) filter(where rn=1),0) t1,
      coalesce(max(value) filter(where rn=2),0) t2,
      coalesce(max(value) filter(where rn=3),0) t3,
      count(*) mapped_count,
      count(*) filter(where value>=70) strong_count
    from per_product group by product
  ),
  fitted as (
    select product,
      round((t1*.85+t2*.10+t3*.05) *
        (case when mapped_count=0 then 0 else .85 + .15*(strong_count::numeric/mapped_count::numeric) end)
      )::int fit_before_confidence
    from agg
  )
  select
    coalesce((select jsonb_agg(canonical_profile order by canonical_profile) from mapped),'[]'::jsonb),
    coalesce((select jsonb_agg(source_profile order by source_profile) from normalized where canonical_profile is null),'[]'::jsonb),
    (select count(*) from mapped),
    coalesce((select fit_before_confidence from fitted where product='pnld_literario'),0),
    coalesce((select fit_before_confidence from fitted where product='pnld_didatico'),0),
    coalesce((select fit_before_confidence from fitted where product='pnld_tecnico_metodologico'),0),
    coalesce((select fit_before_confidence from fitted where product='radar_licitacoes'),0),
    coalesce((select fit_before_confidence from fitted where product='radar_oportunidades'),0)
  into v_canonical_profiles,v_unknown_profiles,v_mapped_count,v_fit_lit,v_fit_did,v_fit_tec,v_fit_lic,v_fit_opp;

  if p.editorial_profile_status='confirmed' and p.editorial_profile_confidence='high' then v_factor:=1.00;
  elsif p.editorial_profile_status='confirmed' and p.editorial_profile_confidence='medium' then v_factor:=0.90;
  elsif p.editorial_profile_status='confirmed' and p.editorial_profile_confidence='low' then v_factor:=0.75;
  elsif p.editorial_profile_status='partial' and p.editorial_profile_confidence='high' then v_factor:=0.80;
  elsif p.editorial_profile_status='partial' and p.editorial_profile_confidence='medium' then v_factor:=0.70;
  elsif p.editorial_profile_status='partial' and p.editorial_profile_confidence='low' then v_factor:=0.55;
  elsif v_mapped_count>0 then v_factor:=0.35;
  else v_factor:=0; end if;

  v_fit_lit:=round(v_fit_lit*v_factor); v_fit_did:=round(v_fit_did*v_factor); v_fit_tec:=round(v_fit_tec*v_factor);
  v_fit_lic:=round(v_fit_lic*v_factor); v_fit_opp:=round(v_fit_opp*v_factor);
  v_fit:=greatest(v_fit_lit,v_fit_did,v_fit_tec,v_fit_lic,v_fit_opp);

  if v_fit>0 then
    select coalesce(jsonb_agg(product order by precedence),'[]'::jsonb) into v_top_products
    from (values
      ('pnld_literario'::text,v_fit_lit,1),('pnld_didatico',v_fit_did,2),('pnld_tecnico_metodologico',v_fit_tec,3),
      ('radar_licitacoes',v_fit_lic,4),('radar_oportunidades',v_fit_opp,5)
    ) x(product,fit,precedence) where fit=v_fit;
    v_best_product:=v_top_products->>0;
  end if;

  select exists(select 1 from public.contacts c where c.publisher_id=p.id and c.active),
         exists(select 1 from public.contacts c where c.publisher_id=p.id and c.active and c.is_decision_maker)
  into has_contact,has_decision_maker;

  if nullif(trim(coalesce(p.general_email,'')),'') is not null then v_quality:=v_quality+15; end if;
  if nullif(trim(coalesce(p.phone,'')),'') is not null then v_quality:=v_quality+15; end if;
  if nullif(trim(coalesce(p.website,'')),'') is not null then v_quality:=v_quality+10; end if;
  if nullif(trim(coalesce(p.cnpj,'')),'') is not null then v_quality:=v_quality+5; end if;
  if nullif(trim(coalesce(p.city,'')),'') is not null and nullif(trim(coalesce(p.state,'')),'') is not null then v_quality:=v_quality+5; end if;
  if v_profile_count>0 and p.editorial_profile_status='confirmed' then v_quality:=v_quality+15;
  elsif v_profile_count>0 and p.editorial_profile_status='partial' then v_quality:=v_quality+10;
  elsif v_profile_count>0 then v_quality:=v_quality+5; end if;
  if has_contact then v_quality:=v_quality+10; end if;
  if has_decision_maker then v_quality:=v_quality+20; end if;
  if nullif(trim(coalesce(p.secondary_phone,'')),'') is not null or coalesce(cardinality(p.alternate_emails),0)>0
    or nullif(trim(coalesce(p.linkedin_url,'')),'') is not null or nullif(trim(coalesce(p.instagram,'')),'') is not null
  then v_quality:=v_quality+5; end if;
  v_quality:=greatest(0,least(v_quality,100));

  if upper(trim(coalesce(p.registration_status,'')))='ATIVA' then v_potential:=v_potential+10;
  elsif nullif(trim(coalesce(p.registration_status,'')),'') is not null then v_potential:=v_potential-25; end if;
  if upper(coalesce(p.company_size,'')) like '%GRANDE%' and upper(coalesce(p.company_size,'')) not like '%MEDIO%' and upper(coalesce(p.company_size,'')) not like '%MÉDIO%' then v_potential:=v_potential+25;
  elsif upper(coalesce(p.company_size,'')) like '%MEDIO%' or upper(coalesce(p.company_size,'')) like '%MÉDIO%' or upper(coalesce(p.company_size,'')) like '%GRANDE%' then v_potential:=v_potential+18;
  elsif upper(coalesce(p.company_size,'')) like '%PEQUEN%' or upper(coalesce(p.company_size,'')) like '%EPP%' then v_potential:=v_potential+12;
  elsif upper(coalesce(p.company_size,'')) like '%MICRO%' or upper(coalesce(p.company_size,'')) like '%MEI%' then v_potential:=v_potential+5; end if;
  if nullif(trim(coalesce(p.estimated_revenue,'')),'') is not null then v_potential:=v_potential+8; end if;
  if nullif(trim(coalesce(p.employee_range,'')),'') is not null then v_potential:=v_potential+7; end if;

  select i.result,i.interest_level,i.occurred_at into latest_result,latest_interest,latest_at
  from public.interactions i where i.publisher_id=p.id order by i.occurred_at desc limit 1;
  if latest_result in ('qualified','proposal_requested','meeting_scheduled') then v_potential:=v_potential+20;
  elsif latest_result in ('connected','replied','follow_up','callback_scheduled','asked_email') then v_potential:=v_potential+10;
  elsif latest_result in ('busy','left_message') then v_potential:=v_potential+3;
  elsif latest_result='wrong_contact' then v_potential:=v_potential-5;
  elsif latest_result='not_interested' then v_potential:=v_potential-40; end if;
  if latest_interest in ('high','hot') then v_potential:=v_potential+15;
  elsif latest_interest in ('medium','warm') then v_potential:=v_potential+8;
  elsif latest_interest in ('low','neutral') then v_potential:=v_potential+2;
  elsif latest_interest in ('none','cold') then v_potential:=v_potential-20; end if;
  select count(*)::int into no_answer_count from public.interactions i
    where i.publisher_id=p.id and i.result='no_answer' and i.occurred_at>=now()-interval '45 days';
  v_potential:=v_potential-least(no_answer_count*2,10);
  if latest_at is not null and latest_at>=now()-interval '14 days' and coalesce(latest_result,'')<>'not_interested' then v_potential:=v_potential+5; end if;
  v_potential:=greatest(0,least(v_potential,100));

  v_fit_points:=round(v_fit*.70); v_potential_points:=round(v_potential*.20); v_quality_points:=round(v_quality*.10);
  v_prelim:=greatest(0,least(v_fit_points+v_potential_points+v_quality_points,100)); v_final:=v_prelim;
  if v_fit<20 then v_final:=least(v_final,25); elsif v_fit<40 then v_final:=least(v_final,45); end if;
  if latest_result='not_interested' then v_final:=least(v_final,35); end if;

  return jsonb_build_object(
    'version','radar_v3_preview','publisher_id',p.id,'score',v_final,'v2_score',p.score,'delta',v_final-coalesce(p.score,0),
    'weights',jsonb_build_object('editorial_fit',70,'commercial_potential',20,'data_quality',10),
    'components',jsonb_build_object('editorial_fit',v_fit,'commercial_potential',v_potential,'data_quality',v_quality),
    'points',jsonb_build_object('editorial_fit',v_fit_points,'commercial_potential',v_potential_points,'data_quality',v_quality_points),
    'pre_cap_score',v_prelim,
    'product_fits',jsonb_build_object('pnld_literario',v_fit_lit,'pnld_didatico',v_fit_did,'pnld_tecnico_metodologico',v_fit_tec,'radar_licitacoes',v_fit_lic,'radar_oportunidades',v_fit_opp),
    'top_products',v_top_products,'recommended_product',v_best_product,
    'canonical_profiles',v_canonical_profiles,'unknown_profiles',v_unknown_profiles,'confidence_factor',v_factor
  );
end;
$$;

revoke all on function private.radar_v3_preview(uuid) from public;

create table if not exists public.radar_v3_simulations (
  publisher_id uuid primary key references public.publishers(id) on delete cascade,
  organization_id uuid not null,
  publisher_name text not null,
  editorial_profile_status text,
  editorial_profile_confidence text,
  editorial_profile text[],
  v2_score integer,
  v2_fit integer,
  v2_best_product text,
  v3_score integer not null,
  v3_fit integer not null,
  v3_best_product text,
  delta integer not null,
  top_products jsonb not null default '[]'::jsonb,
  product_fits jsonb not null default '{}'::jsonb,
  canonical_profiles jsonb not null default '[]'::jsonb,
  unknown_profiles jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);

create index if not exists radar_v3_simulations_org_delta_idx on public.radar_v3_simulations(organization_id,delta);
create index if not exists radar_v3_simulations_org_v3_score_idx on public.radar_v3_simulations(organization_id,v3_score desc);

alter table public.radar_v3_simulations enable row level security;
drop policy if exists radar_v3_simulations_select_manager on public.radar_v3_simulations;
create policy radar_v3_simulations_select_manager on public.radar_v3_simulations
for select to authenticated
using (private.org_role(organization_id)=any(array['owner'::text,'admin'::text,'supervisor'::text]));

revoke all on table public.radar_v3_simulations from public,anon,authenticated;
grant select on table public.radar_v3_simulations to authenticated;

create or replace function private.refresh_radar_v3_simulations(p_org uuid)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_count integer;
begin
  delete from public.radar_v3_simulations where organization_id=p_org;
  insert into public.radar_v3_simulations(
    publisher_id,organization_id,publisher_name,editorial_profile_status,editorial_profile_confidence,editorial_profile,
    v2_score,v2_fit,v2_best_product,v3_score,v3_fit,v3_best_product,delta,top_products,product_fits,canonical_profiles,unknown_profiles,calculated_at
  )
  select p.id,p.organization_id,p.name,p.editorial_profile_status,p.editorial_profile_confidence,p.editorial_profile,
    p.score,p.radar_fit_score,p.best_product,(v.preview->>'score')::int,(v.preview->'components'->>'editorial_fit')::int,
    v.preview->>'recommended_product',(v.preview->>'score')::int-coalesce(p.score,0),
    coalesce(v.preview->'top_products','[]'::jsonb),coalesce(v.preview->'product_fits','{}'::jsonb),
    coalesce(v.preview->'canonical_profiles','[]'::jsonb),coalesce(v.preview->'unknown_profiles','[]'::jsonb),now()
  from public.publishers p
  cross join lateral (select private.radar_v3_preview(p.id) preview) v
  where p.organization_id=p_org and not p.archived and coalesce(cardinality(p.editorial_profile),0)>0;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function private.refresh_radar_v3_simulations(uuid) from public;

create or replace function public.crm_radar_v3_lab_refresh(p_organization_id uuid)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if not private.is_org_member(p_organization_id)
     or coalesce(private.org_role(p_organization_id),'') not in ('owner','admin','supervisor')
  then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  return private.refresh_radar_v3_simulations(p_organization_id);
end;
$$;

create or replace function public.crm_radar_v3_lab_summary(p_organization_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,private,pg_temp as $$
declare result jsonb;
begin
  with x as (
    select * from public.radar_v3_simulations
    where organization_id=p_organization_id and editorial_profile_status='confirmed'
  )
  select jsonb_build_object(
    'total',count(*),'last_refreshed',max(calculated_at),
    'v2_avg',round(avg(v2_score),1),'v3_avg',round(avg(v3_score),1),
    'v2_median',percentile_cont(.5) within group(order by v2_score),'v3_median',percentile_cont(.5) within group(order by v3_score),
    'v2_80_plus',count(*) filter(where v2_score>=80),'v3_80_plus',count(*) filter(where v3_score>=80),
    'v2_90_plus',count(*) filter(where v2_score>=90),'v3_90_plus',count(*) filter(where v3_score>=90),
    'v2_fit_100',count(*) filter(where v2_fit=100),'v3_fit_100',count(*) filter(where v3_fit=100),
    'v2_fit_90_plus',count(*) filter(where v2_fit>=90),'v3_fit_90_plus',count(*) filter(where v3_fit>=90),
    'within_5',count(*) filter(where abs(delta)<=5),'up_10_plus',count(*) filter(where delta>=10),
    'down_10_plus',count(*) filter(where delta<=-10),'up_25_plus',count(*) filter(where delta>=25),
    'down_25_plus',count(*) filter(where delta<=-25),
    'ties',count(*) filter(where jsonb_array_length(top_products)>1),
    'three_plus_ties',count(*) filter(where jsonb_array_length(top_products)>=3),
    'unknown_profiles',count(*) filter(where jsonb_array_length(unknown_profiles)>0),
    'best_products',(select coalesce(jsonb_agg(to_jsonb(z) order by z.n desc),'[]'::jsonb)
      from (select coalesce(v3_best_product,'none') product,count(*) n,round(avg(v3_score),1) avg_score from x group by 1) z)
  ) into result from x;
  return result;
end;
$$;

create or replace function public.crm_radar_v3_lab_rows(
  p_organization_id uuid,p_limit integer default 50,p_offset integer default 0,p_sort text default 'abs',
  p_search text default null,p_status text default 'confirmed'
)
returns table(
  publisher_id uuid,publisher_name text,editorial_profile_status text,editorial_profile_confidence text,editorial_profile text[],
  v2_score integer,v3_score integer,delta integer,v2_fit integer,v3_fit integer,v2_best_product text,v3_best_product text,
  top_products jsonb,product_fits jsonb,unknown_profiles jsonb,calculated_at timestamptz
)
language plpgsql stable security invoker set search_path=public,private,pg_temp as $$
begin
  return query
  select s.publisher_id,s.publisher_name,s.editorial_profile_status,s.editorial_profile_confidence,s.editorial_profile,
    s.v2_score,s.v3_score,s.delta,s.v2_fit,s.v3_fit,s.v2_best_product,s.v3_best_product,s.top_products,s.product_fits,s.unknown_profiles,s.calculated_at
  from public.radar_v3_simulations s
  where s.organization_id=p_organization_id
    and (p_status is null or p_status='' or s.editorial_profile_status=p_status)
    and (p_search is null or trim(p_search)='' or s.publisher_name ilike '%'||trim(p_search)||'%')
  order by
    case when p_sort='up' then s.delta end desc nulls last,
    case when p_sort='down' then s.delta end asc nulls last,
    case when p_sort='v3' then s.v3_score end desc nulls last,
    case when p_sort='abs' then abs(s.delta) end desc nulls last,
    case when p_sort='name' then s.publisher_name end asc nulls last,
    abs(s.delta) desc,s.publisher_name
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0));
end;
$$;

revoke all on function public.crm_radar_v3_lab_refresh(uuid) from public,anon;
revoke all on function public.crm_radar_v3_lab_summary(uuid) from public,anon;
revoke all on function public.crm_radar_v3_lab_rows(uuid,integer,integer,text,text,text) from public,anon;
grant execute on function public.crm_radar_v3_lab_refresh(uuid) to authenticated;
grant execute on function public.crm_radar_v3_lab_summary(uuid) to authenticated;
grant execute on function public.crm_radar_v3_lab_rows(uuid,integer,integer,text,text,text) to authenticated;
