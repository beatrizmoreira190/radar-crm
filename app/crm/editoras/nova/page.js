'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, Save, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PtBrDateField, PtBrDateTimeField } from '@/components/PtBrDateFields';
import {
  BRAZIL_STATES,
  EDITORIAL_PROFILE_CONFIDENCE_LABELS,
  EDITORIAL_PROFILE_OPTIONS,
  EDITORIAL_PROFILE_STATUS_LABELS,
  PRIORITY_LABELS,
  PUBLISHER_COMMERCIAL_PROFILE_LABELS
} from '@/lib/constants';

const INITIAL = {
  name:'',commercial_name:'',trade_name:'',legal_name:'',cnpj:'',
  registration_status:'',cnpj_status_date:'',cnpj_status_reason:'',cnpj_start_date:'',
  cnpj_special_status:'',cnpj_special_status_date:'',matrix_branch:'',legal_nature:'',
  cnae_primary:'',cnae_description:'',cnae_secondary:'',company_size:'',size_label:'',
  tax_regime:'',simples_nacional:'',mei:'',share_capital:'',estimated_revenue:'',
  employee_range:'',owners_names:'',age_range:'',
  country:'Brasil',postal_code:'',address_type:'',address_street:'',address_number:'',
  address_complement:'',neighborhood:'',city:'',state:'',ibge_code:'',
  website:'',general_email:'',alternate_emails:'',phone:'',secondary_phone:'',
  linkedin_url:'',instagram:'',
  profile:'',catalog_notes:'',book_types:'',genres:'',market_segments:'',
  editorial_profile:[],editorial_profile_status:'pending',editorial_profile_confidence:'',
  editorial_profile_notes:'',editorial_source_urls:'',public_source_urls:'',web_enrichment_notes:'',
  commercial_profile_code:'publisher_company',commercial_profile_note:'',
  priority:'medium',stage_id:'',owner_user_id:'',next_action_at:'',notes:'',commercial_temperature:''
};

function splitList(value=''){
  return [...new Set(String(value).split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean))];
}
function splitLines(value=''){
  return [...new Set(String(value).split(/\n+/).map(v=>v.trim()).filter(Boolean))];
}

export default function NewPublisherPage(){
  const router=useRouter();
  const {supabase,membership,team,isManager}=useCrm();
  const org=membership?.organization_id;
  const [f,setF]=useState(INITIAL);
  const [stages,setStages]=useState([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [profileToAdd,setProfileToAdd]=useState('');

  useEffect(()=>{
    let active=true;
    async function load(){
      if(!org)return;
      const {data}=await supabase.from('pipeline_stages')
        .select('id,name,position,stage_type')
        .eq('organization_id',org).eq('active',true).order('position');
      if(active)setStages(data||[]);
    }
    load();
    return()=>{active=false};
  },[org,supabase]);

  function set(key,value){setF(prev=>({...prev,[key]:value}))}
  function addEditorialProfile(){
    if(!profileToAdd||f.editorial_profile.includes(profileToAdd))return;
    set('editorial_profile',[...f.editorial_profile,profileToAdd]);
    setProfileToAdd('');
  }
  function removeEditorialProfile(value){
    set('editorial_profile',f.editorial_profile.filter(item=>item!==value));
  }

  const filled=useMemo(()=>{
    const checks=[
      f.name,f.commercial_name||f.trade_name,f.legal_name,f.cnpj,f.city&&f.state,
      f.website,f.general_email||f.phone,f.editorial_profile.length,f.market_segments,
      f.catalog_notes||f.profile,f.stage_id||f.priority
    ];
    return checks.filter(Boolean).length;
  },[f]);
  const completeness=Math.round((filled/11)*100);

  async function save(e){
    e.preventDefault();
    if(saving)return;
    setSaving(true);setError('');
    const payload={
      ...f,
      alternate_emails:splitList(f.alternate_emails),
      genres:splitList(f.genres),
      market_segments:splitList(f.market_segments),
      editorial_source_urls:splitLines(f.editorial_source_urls),
      public_source_urls:splitLines(f.public_source_urls),
      next_action_at:f.next_action_at?new Date(f.next_action_at).toISOString():'',
      owner_user_id:isManager?f.owner_user_id:'',
      commercial_profile_code:isManager?f.commercial_profile_code:'publisher_company',
      commercial_profile_note:isManager?f.commercial_profile_note:''
    };
    const {data,error:rpcError}=await supabase.rpc('crm_create_publisher_manual_full',{
      p_organization_id:org,
      p_payload:payload
    });
    if(rpcError){
      setError(rpcError.message||'Não foi possível criar a editora.');
      setSaving(false);
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    const id=data?.publisher_id;
    if(id)router.push(`/app/editoras/${id}`);
    else router.push('/app/editoras');
  }

  return <form className="page-wrap" onSubmit={save}>
    <div className="page-head new-publisher-head">
      <div>
        <Link href="/app/editoras" className="text-link"><ArrowLeft size={15}/> Editoras</Link>
        <div className="eyebrow" style={{marginTop:12}}>Cadastro manual</div>
        <h1>Nova editora</h1>
        <p>Crie uma ficha completa desde o início. Preencha o que já estiver disponível; os dados automáticos e históricos serão construídos pelo CRM depois do cadastro.</p>
      </div>
      <div className="head-actions">
        <Link className="btn secondary" href="/app/editoras">Cancelar</Link>
        <button className="btn" disabled={saving}><Save size={16}/>{saving?'Salvando…':'Salvar editora'}</button>
      </div>
    </div>

    {error&&<div className="notice error create-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setError('')}><X size={15}/></button></div>}

    <div className="new-publisher-layout">
      <main className="new-publisher-main">
        <Section title="1. Identificação da editora" description="Nomes usados no CRM, identidade empresarial e classificação comercial.">
          <Field className="span-2" label="Nome principal no CRM" required>
            <input className="input" autoFocus required value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Como a equipe deve identificar esta editora"/>
          </Field>
          <Field label="Nome comercial / marca">
            <input className="input" value={f.commercial_name} onChange={e=>set('commercial_name',e.target.value)} placeholder="Marca usada publicamente"/>
          </Field>
          <Field label="Nome fantasia oficial">
            <input className="input" value={f.trade_name} onChange={e=>set('trade_name',e.target.value)} placeholder="Nome fantasia vinculado ao CNPJ"/>
          </Field>
          <Field className="span-2" label="Razão social">
            <input className="input" value={f.legal_name} onChange={e=>set('legal_name',e.target.value)} placeholder="Nome jurídico completo"/>
          </Field>
          {isManager&&<>
            <Field label="Perfil comercial Radar">
              <select value={f.commercial_profile_code} onChange={e=>set('commercial_profile_code',e.target.value)}>
                {Object.entries(PUBLISHER_COMMERCIAL_PROFILE_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Observação do perfil comercial">
              <input className="input" value={f.commercial_profile_note} onChange={e=>set('commercial_profile_note',e.target.value)} placeholder="Contexto para a classificação"/>
            </Field>
          </>}
        </Section>

        <Section title="2. CNPJ e dados empresariais" description="Dados oficiais ou empresariais já conhecidos. Campos que depois forem sincronizados poderão ser conferidos com a base pública.">
          <Field label="CNPJ">
            <input className="input" inputMode="numeric" value={f.cnpj} onChange={e=>set('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/>
          </Field>
          <Field label="Situação cadastral">
            <input className="input" value={f.registration_status} onChange={e=>set('registration_status',e.target.value)} placeholder="Ex.: ATIVA"/>
          </Field>
          <Field label="Data da situação cadastral">
            <PtBrDateField value={f.cnpj_status_date} onChange={value=>set('cnpj_status_date',value)} ariaLabel="Data da situação cadastral"/>
          </Field>
          <Field label="Motivo da situação cadastral">
            <input className="input" value={f.cnpj_status_reason} onChange={e=>set('cnpj_status_reason',e.target.value)}/>
          </Field>
          <Field label="Data de abertura">
            <PtBrDateField value={f.cnpj_start_date} onChange={value=>set('cnpj_start_date',value)} ariaLabel="Data de abertura"/>
          </Field>
          <Field label="Matriz / filial">
            <input className="input" value={f.matrix_branch} onChange={e=>set('matrix_branch',e.target.value)} placeholder="Ex.: MATRIZ"/>
          </Field>
          <Field label="Situação especial">
            <input className="input" value={f.cnpj_special_status} onChange={e=>set('cnpj_special_status',e.target.value)}/>
          </Field>
          <Field label="Data da situação especial">
            <PtBrDateField value={f.cnpj_special_status_date} onChange={value=>set('cnpj_special_status_date',value)} ariaLabel="Data da situação especial"/>
          </Field>
          <Field className="span-2" label="Natureza jurídica">
            <input className="input" value={f.legal_nature} onChange={e=>set('legal_nature',e.target.value)}/>
          </Field>
          <Field label="CNAE principal">
            <input className="input" value={f.cnae_primary} onChange={e=>set('cnae_primary',e.target.value)} placeholder="Código"/>
          </Field>
          <Field label="Descrição do CNAE principal">
            <input className="input" value={f.cnae_description} onChange={e=>set('cnae_description',e.target.value)}/>
          </Field>
          <Field className="span-2" label="CNAEs secundários">
            <textarea rows={2} value={f.cnae_secondary} onChange={e=>set('cnae_secondary',e.target.value)} placeholder="Códigos ou descrições, conforme disponível"/>
          </Field>
          <Field label="Porte empresarial">
            <input className="input" value={f.company_size} onChange={e=>set('company_size',e.target.value)} placeholder="Ex.: ME, EPP"/>
          </Field>
          <Field label="Classificação de tamanho">
            <input className="input" value={f.size_label} onChange={e=>set('size_label',e.target.value)} placeholder="Classificação interna ou fonte externa"/>
          </Field>
          <Field label="Regime tributário">
            <input className="input" value={f.tax_regime} onChange={e=>set('tax_regime',e.target.value)}/>
          </Field>
          <Field label="Simples Nacional">
            <select value={f.simples_nacional} onChange={e=>set('simples_nacional',e.target.value)}><option value="">Não informado</option><option value="Sim">Sim</option><option value="Não">Não</option></select>
          </Field>
          <Field label="MEI">
            <select value={f.mei} onChange={e=>set('mei',e.target.value)}><option value="">Não informado</option><option value="Sim">Sim</option><option value="Não">Não</option></select>
          </Field>
          <Field label="Capital social">
            <input className="input" value={f.share_capital} onChange={e=>set('share_capital',e.target.value)} placeholder="Ex.: R$ 100.000,00"/>
          </Field>
          <Field label="Faturamento estimado">
            <input className="input" value={f.estimated_revenue} onChange={e=>set('estimated_revenue',e.target.value)}/>
          </Field>
          <Field label="Faixa de funcionários">
            <input className="input" value={f.employee_range} onChange={e=>set('employee_range',e.target.value)}/>
          </Field>
          <Field label="Tempo / faixa de atuação">
            <input className="input" value={f.age_range} onChange={e=>set('age_range',e.target.value)}/>
          </Field>
          <Field className="span-2" label="Sócios / responsáveis legais">
            <textarea rows={2} value={f.owners_names} onChange={e=>set('owners_names',e.target.value)} placeholder="Nomes conforme fonte disponível"/>
          </Field>
        </Section>

        <Section title="3. Endereço e localização" description="Endereço institucional e informações geográficas.">
          <Field label="País"><input className="input" value={f.country} onChange={e=>set('country',e.target.value)}/></Field>
          <Field label="CEP"><input className="input" value={f.postal_code} onChange={e=>set('postal_code',e.target.value)}/></Field>
          <Field label="Tipo de logradouro"><input className="input" value={f.address_type} onChange={e=>set('address_type',e.target.value)} placeholder="Rua, Avenida..."/></Field>
          <Field label="Logradouro"><input className="input" value={f.address_street} onChange={e=>set('address_street',e.target.value)}/></Field>
          <Field label="Número"><input className="input" value={f.address_number} onChange={e=>set('address_number',e.target.value)}/></Field>
          <Field label="Complemento"><input className="input" value={f.address_complement} onChange={e=>set('address_complement',e.target.value)}/></Field>
          <Field label="Bairro"><input className="input" value={f.neighborhood} onChange={e=>set('neighborhood',e.target.value)}/></Field>
          <Field label="Cidade"><input className="input" value={f.city} onChange={e=>set('city',e.target.value)}/></Field>
          <Field label="UF"><select value={f.state} onChange={e=>set('state',e.target.value)}><option value="">Não informada</option>{BRAZIL_STATES.map(uf=><option value={uf} key={uf}>{uf}</option>)}</select></Field>
          <Field label="Código IBGE"><input className="input" value={f.ibge_code} onChange={e=>set('ibge_code',e.target.value)}/></Field>
        </Section>

        <Section title="4. Canais institucionais" description="Contatos gerais e canais públicos usados pela equipe na prospecção.">
          <Field className="span-2" label="Site"><input className="input" value={f.website} onChange={e=>set('website',e.target.value)} placeholder="https://..."/></Field>
          <Field label="E-mail geral"><input className="input" type="email" value={f.general_email} onChange={e=>set('general_email',e.target.value)}/></Field>
          <Field label="E-mails alternativos"><textarea rows={2} value={f.alternate_emails} onChange={e=>set('alternate_emails',e.target.value)} placeholder="Separe por vírgula ou linha"/></Field>
          <Field label="Telefone principal"><input className="input" value={f.phone} onChange={e=>set('phone',e.target.value)}/></Field>
          <Field label="Telefone secundário"><input className="input" value={f.secondary_phone} onChange={e=>set('secondary_phone',e.target.value)}/></Field>
          <Field label="LinkedIn"><input className="input" value={f.linkedin_url} onChange={e=>set('linkedin_url',e.target.value)} placeholder="URL ou perfil"/></Field>
          <Field label="Instagram"><input className="input" value={f.instagram} onChange={e=>set('instagram',e.target.value)} placeholder="@perfil ou URL"/></Field>
        </Section>

        <Section title="5. Catálogo e perfil editorial" description="Informações editoriais que alimentam filtros, Radar Score e leitura comercial da conta.">
          <Field className="span-2" label="Resumo / perfil da editora">
            <textarea rows={4} value={f.profile} onChange={e=>set('profile',e.target.value)} placeholder="Descrição geral do posicionamento, catálogo e atuação editorial"/>
          </Field>
          <Field className="span-2" label="Observações sobre o catálogo">
            <textarea rows={4} value={f.catalog_notes} onChange={e=>set('catalog_notes',e.target.value)} placeholder="Linhas editoriais, destaques, público, diferenciais e outras observações"/>
          </Field>
          <Field label="Tipos de livros"><textarea rows={3} value={f.book_types} onChange={e=>set('book_types',e.target.value)} placeholder="Ex.: impressos, e-books, didáticos..."/></Field>
          <Field label="Gêneros / temas livres"><textarea rows={3} value={f.genres} onChange={e=>set('genres',e.target.value)} placeholder="Separe por vírgula ou linha"/></Field>
          <Field className="span-2" label="Segmentos de atuação comercial">
            <textarea rows={3} value={f.market_segments} onChange={e=>set('market_segments',e.target.value)} placeholder="Ex.: mercado escolar, livrarias, setor público, universitário..."/>
          </Field>

          <div className="span-2 editorial-picker">
            <label>Perfil editorial</label>
            <div className="editorial-add">
              <select value={profileToAdd} onChange={e=>setProfileToAdd(e.target.value)}>
                <option value="">Selecione um perfil para adicionar</option>
                {EDITORIAL_PROFILE_OPTIONS.filter(item=>!f.editorial_profile.includes(item)).map(item=><option value={item} key={item}>{item}</option>)}
              </select>
              <button type="button" className="btn secondary" onClick={addEditorialProfile} disabled={!profileToAdd}>Adicionar</button>
            </div>
            {f.editorial_profile.length>0?<div className="selected-profiles">{f.editorial_profile.map(item=><button type="button" className="profile-chip" onClick={()=>removeEditorialProfile(item)} key={item}>{item}<X size={12}/></button>)}</div>:<small className="muted">Nenhum perfil selecionado.</small>}
          </div>

          <Field label="Status do perfil editorial">
            <select value={f.editorial_profile_status} onChange={e=>set('editorial_profile_status',e.target.value)}>
              {Object.entries(EDITORIAL_PROFILE_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Confiança da classificação">
            <select value={f.editorial_profile_confidence} onChange={e=>set('editorial_profile_confidence',e.target.value)}>
              <option value="">Não informada</option>
              {Object.entries(EDITORIAL_PROFILE_CONFIDENCE_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
            </select>
          </Field>
          <Field className="span-2" label="Observações do perfil editorial">
            <textarea rows={3} value={f.editorial_profile_notes} onChange={e=>set('editorial_profile_notes',e.target.value)}/>
          </Field>
          <Field className="span-2" label="Fontes do perfil editorial">
            <textarea rows={3} value={f.editorial_source_urls} onChange={e=>set('editorial_source_urls',e.target.value)} placeholder="Uma URL por linha"/>
          </Field>
          <Field className="span-2" label="Outras fontes públicas / referências">
            <textarea rows={3} value={f.public_source_urls} onChange={e=>set('public_source_urls',e.target.value)} placeholder="Site institucional, catálogo, redes, registros públicos — uma URL por linha"/>
          </Field>
          <Field className="span-2" label="Notas de enriquecimento / pesquisa">
            <textarea rows={3} value={f.web_enrichment_notes} onChange={e=>set('web_enrichment_notes',e.target.value)} placeholder="Observações úteis para futuras conferências e pesquisas"/>
          </Field>
        </Section>
      </main>

      <aside className="new-publisher-aside">
        <section className="card panel aside-card">
          <div className="aside-icon"><Building2 size={20}/></div>
          <div><div className="eyebrow">Completude inicial</div><strong className="completion-value">{completeness}%</strong><p className="muted">Indicador apenas de preenchimento. O Radar Score será calculado pelo sistema depois.</p></div>
          <div className="completion-bar"><span style={{width:`${completeness}%`}}/></div>
        </section>

        <section className="card panel aside-card sticky-card">
          <div className="section-title"><div><h3>Acompanhamento comercial</h3><p className="muted">Defina como a conta entra no fluxo da equipe.</p></div></div>
          <Field label="Prioridade"><select value={f.priority} onChange={e=>set('priority',e.target.value)}>{Object.entries(PRIORITY_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field>
          <Field label="Etapa do pipeline"><select value={f.stage_id} onChange={e=>set('stage_id',e.target.value)}><option value="">Sem etapa</option>{stages.map(stage=><option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></Field>
          {isManager&&<Field label="Responsável atual"><select value={f.owner_user_id} onChange={e=>set('owner_user_id',e.target.value)}><option value="">Sem responsável</option>{team.filter(m=>m.active).map(m=><option value={m.user_id} key={m.user_id}>{m.full_name||m.email}</option>)}</select></Field>}
          <Field label="Temperatura comercial"><select value={f.commercial_temperature} onChange={e=>set('commercial_temperature',e.target.value)}><option value="">Não definida</option><option value="cold">Fria</option><option value="warm">Morna</option><option value="hot">Quente</option></select></Field>
          <Field label="Próxima ação"><PtBrDateTimeField value={f.next_action_at} onChange={value=>set('next_action_at',value)} ariaLabel="Próxima ação"/></Field>
          <Field label="Notas comerciais"><textarea rows={5} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Contexto inicial para a equipe"/></Field>
          <div className="origin-note"><Check size={15}/><span>O usuário que fizer o cadastro será registrado automaticamente como originador/prospector.</span></div>
          <button className="btn full" disabled={saving}><Save size={15}/>{saving?'Salvando…':'Salvar editora'}</button>
        </section>
      </aside>
    </div>

    <style jsx>{`
      .new-publisher-head{align-items:flex-start}
      .head-actions{display:flex;gap:8px;flex-wrap:wrap}
      .create-error{margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .create-error button{border:0;background:transparent;cursor:pointer}
      .new-publisher-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
      .new-publisher-main{display:grid;gap:16px;min-width:0}
      .new-publisher-aside{display:grid;gap:16px}
      .aside-card{display:grid;gap:12px}
      .sticky-card{position:sticky;top:18px}
      .aside-icon{width:40px;height:40px;border-radius:12px;background:#f2f4f7;display:grid;place-items:center;color:#475467}
      .completion-value{display:block;font-size:28px;line-height:1;margin:7px 0}
      .completion-bar{height:7px;background:#eaecf0;border-radius:999px;overflow:hidden}
      .completion-bar span{display:block;height:100%;background:#101828;border-radius:999px;transition:width .2s ease}
      .editorial-picker{display:grid;gap:8px}
      .editorial-picker>label{font-size:12px;font-weight:600;color:#344054}
      .editorial-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .selected-profiles{display:flex;gap:7px;flex-wrap:wrap}
      .profile-chip{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:6px 9px;display:flex;gap:5px;align-items:center;font-size:11px;cursor:pointer;color:#344054}
      .origin-note{display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:10px;background:#f9fafb;color:#475467;font-size:11px;line-height:1.4}
      :global(.publisher-create-section){padding:18px}
      :global(.publisher-create-section .section-title){margin-bottom:14px}
      :global(.publisher-create-section .section-title h2){margin:0 0 3px}
      :global(.publisher-create-section .form-grid){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}
      :global(.publisher-create-section label){display:grid;gap:6px;font-size:12px;font-weight:600;color:#344054}
      :global(.publisher-create-section textarea){resize:vertical}
      :global(.publisher-create-section .span-2){grid-column:1/-1}
      :global(.new-publisher-aside label){display:grid;gap:6px;font-size:12px;font-weight:600;color:#344054}
      @media(max-width:1000px){.new-publisher-layout{grid-template-columns:1fr}.sticky-card{position:static}}
      @media(max-width:700px){
        .head-actions{width:100%}.head-actions :global(.btn){flex:1}
        :global(.publisher-create-section .form-grid){grid-template-columns:1fr}
        :global(.publisher-create-section .span-2){grid-column:auto}
        .editorial-add{grid-template-columns:1fr}
      }
    `}</style>
  </form>;
}

function Section({title,description,children}){
  return <section className="card panel publisher-create-section">
    <div className="section-title"><div><h2>{title}</h2><p className="muted">{description}</p></div></div>
    <div className="form-grid">{children}</div>
  </section>;
}

function Field({label,children,className='',required=false}){
  return <label className={className}>{label}{required&&<span style={{color:'#b42318'}}> *</span>}{children}</label>;
}
