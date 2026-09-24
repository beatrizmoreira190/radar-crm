'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, Plus, Save, Search, Trash2, UserRound, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PtBrDateField, PtBrDateTimeField } from '@/components/PtBrDateFields';
import {
  BRAZIL_STATES,
  EDITORIAL_PROFILE_OPTIONS,
  PRIORITY_LABELS,
  PUBLISHER_COMMERCIAL_PROFILE_LABELS
} from '@/lib/constants';

const INITIAL = {
  name:'',commercial_name:'',trade_name:'',legal_name:'',cnpj:'',
  registration_status:'',cnpj_status_date:'',cnpj_status_reason:'',cnpj_start_date:'',
  cnpj_special_status:'',cnpj_special_status_date:'',matrix_branch:'',legal_nature:'',
  cnae_primary:'',cnae_description:'',cnae_secondary:'',company_size:'',size_label:'',
  tax_regime:'',simples_nacional:'',mei:'',share_capital:'',estimated_revenue:'',
  employee_range:'',age_range:'',
  country:'Brasil',postal_code:'',address_type:'',address_street:'',address_number:'',
  address_complement:'',neighborhood:'',city:'',state:'',ibge_code:'',
  website:'',general_email:'',alternate_emails:'',phone:'',secondary_phone:'',
  linkedin_url:'',instagram:'',
  editorial_profile:[],
  commercial_profile_code:'publisher_company',commercial_profile_note:'',
  priority:'medium',stage_id:'',owner_user_id:'',next_action_at:'',notes:'',commercial_temperature:''
};

function splitList(value=''){
  return [...new Set(String(value).split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean))];
}
function digits(value=''){return String(value).replace(/\D/g,'').slice(0,14)}
function formatCnpj(value=''){
  const d=digits(value);
  if(d.length<=2)return d;
  if(d.length<=5)return `${d.slice(0,2)}.${d.slice(2)}`;
  if(d.length<=8)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if(d.length<=12)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
function normalizeLabel(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
}
function newPerson(){
  return {
    client_id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
    full_name:'',job_title:'',department:'',email:'',phone:'',mobile:'',
    linkedin_url:'',preferred_channel:'',notes:'',is_decision_maker:false
  };
}

export default function NewPublisherPage(){
  const router=useRouter();
  const {supabase,membership,team,isManager}=useCrm();
  const org=membership?.organization_id;

  const [f,setF]=useState(INITIAL);
  const [stages,setStages]=useState([]);
  const [profileOptions,setProfileOptions]=useState(EDITORIAL_PROFILE_OPTIONS);
  const [profileSearch,setProfileSearch]=useState('');
  const [newProfile,setNewProfile]=useState('');
  const [profileNotice,setProfileNotice]=useState('');
  const [legalContacts,setLegalContacts]=useState([]);
  const [otherContacts,setOtherContacts]=useState([]);

  const [checkingCnpj,setCheckingCnpj]=useState(false);
  const [duplicate,setDuplicate]=useState(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  function set(key,value){setF(prev=>({...prev,[key]:value}))}

  useEffect(()=>{
    let active=true;
    async function load(){
      if(!org)return;
      const [{data:stageRows},{data:profileRows}]=await Promise.all([
        supabase.from('pipeline_stages').select('id,name,position,stage_type')
          .eq('organization_id',org).eq('active',true).order('position'),
        supabase.rpc('get_editorial_profile_options',{p_organization_id:org})
      ]);
      if(!active)return;
      setStages(stageRows||[]);
      const merged=[...EDITORIAL_PROFILE_OPTIONS,...(profileRows||[]).map(item=>item?.value).filter(Boolean)];
      const byNorm=new Map();
      merged.forEach(item=>{const key=normalizeLabel(item);if(key&&!byNorm.has(key))byNorm.set(key,item)});
      setProfileOptions([...byNorm.values()].sort((a,b)=>a.localeCompare(b,'pt-BR')));
    }
    load();
    return()=>{active=false};
  },[org,supabase]);

  useEffect(()=>{
    let cancelled=false;
    const clean=digits(f.cnpj);
    setDuplicate(null);
    if(clean.length!==14||!org){setCheckingCnpj(false);return}
    setCheckingCnpj(true);
    const timer=setTimeout(async()=>{
      const {data,error}=await supabase.rpc('crm_check_publisher_cnpj',{
        p_organization_id:org,
        p_cnpj:clean
      });
      if(cancelled)return;
      if(error){setError(error.message);setCheckingCnpj(false);return}
      setDuplicate(Array.isArray(data)&&data.length?data[0]:null);
      setCheckingCnpj(false);
    },350);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[f.cnpj,org,supabase]);

  const filteredProfiles=useMemo(()=>{
    const q=normalizeLabel(profileSearch);
    return profileOptions
      .filter(item=>!q||normalizeLabel(item).includes(q))
      .sort((a,b)=>{
        const aSel=f.editorial_profile.includes(a)?0:1;
        const bSel=f.editorial_profile.includes(b)?0:1;
        return aSel-bSel||a.localeCompare(b,'pt-BR');
      });
  },[profileOptions,profileSearch,f.editorial_profile]);

  function toggleProfile(value){
    set('editorial_profile',
      f.editorial_profile.includes(value)
        ? f.editorial_profile.filter(item=>item!==value)
        : [...f.editorial_profile,value]
    );
  }

  function addNewProfile(){
    const value=newProfile.trim().replace(/\s+/g,' ');
    if(!value)return;
    const normalized=normalizeLabel(value);
    const existing=profileOptions.find(item=>normalizeLabel(item)===normalized);
    if(existing){
      if(!f.editorial_profile.includes(existing))set('editorial_profile',[...f.editorial_profile,existing]);
      setProfileNotice(`“${existing}” já existia e foi selecionado.`);
      setNewProfile('');
      return;
    }
    setProfileOptions(prev=>[...prev,value].sort((a,b)=>a.localeCompare(b,'pt-BR')));
    set('editorial_profile',[...f.editorial_profile,value]);
    setNewProfile('');
    setProfileNotice('Novo perfil adicionado. Ele ficará disponível para os próximos cadastros após salvar esta editora.');
  }

  function addPerson(kind){
    if(kind==='legal')setLegalContacts(prev=>[...prev,newPerson()]);
    else setOtherContacts(prev=>[...prev,newPerson()]);
  }
  function updatePerson(kind,id,key,value){
    const setter=kind==='legal'?setLegalContacts:setOtherContacts;
    setter(prev=>prev.map(person=>person.client_id===id?{...person,[key]:value}:person));
  }
  function removePerson(kind,id){
    const setter=kind==='legal'?setLegalContacts:setOtherContacts;
    setter(prev=>prev.filter(person=>person.client_id!==id));
  }

  const identificationComplete=Boolean(
    f.name.trim()&&f.commercial_name.trim()&&f.trade_name.trim()&&
    f.legal_name.trim()&&digits(f.cnpj).length===14&&!duplicate
  );

  async function save(e){
    e.preventDefault();
    if(saving||duplicate||checkingCnpj)return;
    setError('');

    if(!f.name.trim()||!f.commercial_name.trim()||!f.trade_name.trim()||!f.legal_name.trim()){
      setError('Preencha todos os campos obrigatórios de identificação da editora.');
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    if(digits(f.cnpj).length!==14){
      setError('Informe um CNPJ válido com 14 dígitos.');
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }

    const invalidLegal=legalContacts.find(person=>!person.full_name.trim()||!person.job_title.trim());
    if(invalidLegal){
      setError('Nos sócios e responsáveis legais, nome e função/vínculo são obrigatórios.');
      return;
    }
    const invalidContact=otherContacts.find(person=>!person.full_name.trim());
    if(invalidContact){
      setError('Toda pessoa de contato adicionada precisa ter nome.');
      return;
    }

    setSaving(true);
    const payload={
      ...f,
      cnpj:digits(f.cnpj),
      alternate_emails:splitList(f.alternate_emails),
      owner_user_id:isManager?f.owner_user_id:'',
      commercial_profile_code:isManager?f.commercial_profile_code:'publisher_company',
      commercial_profile_note:isManager?f.commercial_profile_note:'',
      next_action_at:f.next_action_at?new Date(f.next_action_at).toISOString():'',
      legal_contacts:legalContacts.map(({client_id,...person})=>person),
      other_contacts:otherContacts.map(({client_id,...person})=>person)
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
    router.push(id?`/app/editoras/${id}`:'/app/editoras');
  }

  return <form className="page-wrap" onSubmit={save}>
    <div className="page-head new-publisher-head">
      <div>
        <Link href="/app/editoras" className="text-link"><ArrowLeft size={15}/> Editoras</Link>
        <div className="eyebrow" style={{marginTop:12}}>Gestão da base</div>
        <h1>Nova editora</h1>
        <p>Cadastre a editora com os dados que fazem parte da ficha comercial e já inclua as pessoas vinculadas à conta.</p>
      </div>
      <div className="head-actions">
        <Link className="btn secondary" href="/app/editoras">Cancelar</Link>
        <button className="btn" disabled={saving||checkingCnpj||Boolean(duplicate)}>
          <Save size={16}/>{saving?'Salvando…':'Salvar editora'}
        </button>
      </div>
    </div>

    {error&&<div className="notice error create-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setError('')}><X size={15}/></button></div>}

    <div className="new-publisher-layout">
      <main className="new-publisher-main">
        <Section title="1. Identificação da editora" description="Todos os campos deste bloco são obrigatórios. O CNPJ é conferido antes da criação para impedir duplicidades.">
          <Field className="span-2" label="Nome principal no CRM" required>
            <input className="input" autoFocus required value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Como a equipe deve identificar esta editora"/>
          </Field>
          <Field label="Nome comercial / marca" required>
            <input className="input" required value={f.commercial_name} onChange={e=>set('commercial_name',e.target.value)} placeholder="Marca usada publicamente"/>
          </Field>
          <Field label="Nome fantasia oficial" required>
            <input className="input" required value={f.trade_name} onChange={e=>set('trade_name',e.target.value)} placeholder="Nome fantasia vinculado ao CNPJ"/>
          </Field>
          <Field className="span-2" label="Razão social" required>
            <input className="input" required value={f.legal_name} onChange={e=>set('legal_name',e.target.value)} placeholder="Nome jurídico completo"/>
          </Field>
          <Field className="span-2" label="CNPJ" required>
            <input
              className={`input ${duplicate?'field-invalid':''}`}
              required
              inputMode="numeric"
              value={formatCnpj(f.cnpj)}
              onChange={e=>set('cnpj',e.target.value)}
              placeholder="00.000.000/0000-00"
            />
            {checkingCnpj&&<small className="field-hint">Verificando CNPJ na base…</small>}
            {duplicate&&<div className="cnpj-duplicate">
              <strong>{duplicate.archived?'Este CNPJ pertence a uma editora arquivada.':'Este CNPJ já está cadastrado.'}</strong>
              <span>{duplicate.publisher_name}</span>
              <Link href={`/app/editoras/${duplicate.publisher_id}`} className="text-link">Abrir cadastro existente →</Link>
            </div>}
            {!duplicate&&digits(f.cnpj).length===14&&!checkingCnpj&&<small className="field-ok"><Check size={13}/> CNPJ disponível para novo cadastro.</small>}
          </Field>
        </Section>

        <Section title="2. Dados empresariais" description="Informações cadastrais e empresariais já conhecidas no momento da inclusão.">
          <Field label="Situação cadastral"><input className="input" value={f.registration_status} onChange={e=>set('registration_status',e.target.value)} placeholder="Ex.: ATIVA"/></Field>
          <Field label="Data da situação cadastral"><PtBrDateField value={f.cnpj_status_date} onChange={value=>set('cnpj_status_date',value)} ariaLabel="Data da situação cadastral"/></Field>
          <Field label="Motivo da situação cadastral"><input className="input" value={f.cnpj_status_reason} onChange={e=>set('cnpj_status_reason',e.target.value)}/></Field>
          <Field label="Data de abertura"><PtBrDateField value={f.cnpj_start_date} onChange={value=>set('cnpj_start_date',value)} ariaLabel="Data de abertura"/></Field>
          <Field label="Matriz / filial"><input className="input" value={f.matrix_branch} onChange={e=>set('matrix_branch',e.target.value)} placeholder="Ex.: MATRIZ"/></Field>
          <Field label="Situação especial"><input className="input" value={f.cnpj_special_status} onChange={e=>set('cnpj_special_status',e.target.value)}/></Field>
          <Field label="Data da situação especial"><PtBrDateField value={f.cnpj_special_status_date} onChange={value=>set('cnpj_special_status_date',value)} ariaLabel="Data da situação especial"/></Field>
          <Field label="Natureza jurídica"><input className="input" value={f.legal_nature} onChange={e=>set('legal_nature',e.target.value)}/></Field>
          <Field label="CNAE principal"><input className="input" value={f.cnae_primary} onChange={e=>set('cnae_primary',e.target.value)} placeholder="Código"/></Field>
          <Field label="Descrição do CNAE principal"><input className="input" value={f.cnae_description} onChange={e=>set('cnae_description',e.target.value)}/></Field>
          <Field className="span-2" label="CNAEs secundários"><textarea rows={2} value={f.cnae_secondary} onChange={e=>set('cnae_secondary',e.target.value)} placeholder="Códigos ou descrições, conforme disponível"/></Field>
          <Field label="Porte empresarial"><input className="input" value={f.company_size} onChange={e=>set('company_size',e.target.value)} placeholder="Ex.: ME, EPP"/></Field>
          <Field label="Classificação de tamanho"><input className="input" value={f.size_label} onChange={e=>set('size_label',e.target.value)}/></Field>
          <Field label="Regime tributário"><input className="input" value={f.tax_regime} onChange={e=>set('tax_regime',e.target.value)}/></Field>
          <Field label="Simples Nacional"><select value={f.simples_nacional} onChange={e=>set('simples_nacional',e.target.value)}><option value="">Não informado</option><option value="Sim">Sim</option><option value="Não">Não</option></select></Field>
          <Field label="MEI"><select value={f.mei} onChange={e=>set('mei',e.target.value)}><option value="">Não informado</option><option value="Sim">Sim</option><option value="Não">Não</option></select></Field>
          <Field label="Capital social"><input className="input" value={f.share_capital} onChange={e=>set('share_capital',e.target.value)}/></Field>
          <Field label="Faturamento estimado"><input className="input" value={f.estimated_revenue} onChange={e=>set('estimated_revenue',e.target.value)}/></Field>
          <Field label="Faixa de funcionários"><input className="input" value={f.employee_range} onChange={e=>set('employee_range',e.target.value)}/></Field>
          <Field label="Tempo / faixa de atuação"><input className="input" value={f.age_range} onChange={e=>set('age_range',e.target.value)}/></Field>
        </Section>

        <Section title="3. Endereço e localização" description="Endereço institucional e referência geográfica da editora.">
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

        <Section title="5. Perfil editorial" description="Marque os perfis que representam a editora. Se faltar uma categoria, crie uma nova sem sair do cadastro.">
          <div className="span-2 profile-toolbar">
            <div className="profile-search"><Search size={15}/><input className="input" value={profileSearch} onChange={e=>setProfileSearch(e.target.value)} placeholder="Buscar perfil editorial"/></div>
            <span className="badge">{f.editorial_profile.length} selecionado{f.editorial_profile.length===1?'':'s'}</span>
          </div>
          <div className="span-2 profile-boxes">
            {filteredProfiles.map(item=><label className={`profile-option ${f.editorial_profile.includes(item)?'selected':''}`} key={item}>
              <input type="checkbox" checked={f.editorial_profile.includes(item)} onChange={()=>toggleProfile(item)}/>
              <span>{item}</span>
            </label>)}
            {!filteredProfiles.length&&<p className="muted profile-empty">Nenhum perfil encontrado.</p>}
          </div>
          <div className="span-2 new-profile-row">
            <div>
              <strong>Criar novo perfil editorial</strong>
              <small className="muted">Use somente quando a categoria realmente não existir na lista.</small>
            </div>
            <div className="new-profile-action">
              <input className="input" value={newProfile} onChange={e=>{setNewProfile(e.target.value);setProfileNotice('')}} placeholder="Nome do novo perfil"/>
              <button type="button" className="btn secondary" onClick={addNewProfile} disabled={!newProfile.trim()}><Plus size={14}/> Adicionar</button>
            </div>
            {profileNotice&&<small className="profile-notice">{profileNotice}</small>}
          </div>
        </Section>

        <Section title="6. Pessoas vinculadas à editora" description="Cadastre pessoas individualmente para que elas já apareçam como contatos reais da editora após a criação.">
          <PersonGroup
            title="Sócios e responsáveis legais"
            description="Nome e função/vínculo são obrigatórios para cada pessoa adicionada."
            kind="legal"
            people={legalContacts}
            onAdd={()=>addPerson('legal')}
            onChange={(id,key,value)=>updatePerson('legal',id,key,value)}
            onRemove={id=>removePerson('legal',id)}
          />
          <PersonGroup
            title="Outras pessoas de contato"
            description="Direção editorial, comercial, marketing, financeiro, atendimento e outras funções."
            kind="contact"
            people={otherContacts}
            onAdd={()=>addPerson('contact')}
            onChange={(id,key,value)=>updatePerson('contact',id,key,value)}
            onRemove={id=>removePerson('contact',id)}
          />
        </Section>
      </main>

      <aside className="new-publisher-aside">
        <section className="card panel aside-card">
          <div className="aside-icon"><Building2 size={20}/></div>
          <div>
            <div className="eyebrow">Identificação</div>
            <strong>{identificationComplete?'Pronta para salvar':'Preenchimento obrigatório'}</strong>
            <p className="muted">Nome principal, nome comercial, nome fantasia, razão social e CNPJ precisam estar completos.</p>
          </div>
        </section>

        <section className="card panel aside-card sticky-card">
          <div className="section-title"><div><h3>Acompanhamento comercial</h3><p className="muted">Defina como a conta entra no fluxo da equipe.</p></div></div>
          {isManager&&<Field label="Perfil comercial Radar"><select value={f.commercial_profile_code} onChange={e=>set('commercial_profile_code',e.target.value)}>{Object.entries(PUBLISHER_COMMERCIAL_PROFILE_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field>}
          {isManager&&<Field label="Observação do perfil comercial"><textarea rows={2} value={f.commercial_profile_note} onChange={e=>set('commercial_profile_note',e.target.value)}/></Field>}
          <Field label="Prioridade"><select value={f.priority} onChange={e=>set('priority',e.target.value)}>{Object.entries(PRIORITY_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field>
          <Field label="Etapa do pipeline"><select value={f.stage_id} onChange={e=>set('stage_id',e.target.value)}><option value="">Sem etapa</option>{stages.map(stage=><option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></Field>
          {isManager&&<Field label="Responsável atual"><select value={f.owner_user_id} onChange={e=>set('owner_user_id',e.target.value)}><option value="">Sem responsável</option>{team.filter(m=>m.active).map(m=><option value={m.user_id} key={m.user_id}>{m.full_name||m.email}</option>)}</select></Field>}
          <Field label="Temperatura comercial"><select value={f.commercial_temperature} onChange={e=>set('commercial_temperature',e.target.value)}><option value="">Não definida</option><option value="cold">Fria</option><option value="warm">Morna</option><option value="hot">Quente</option></select></Field>
          <Field label="Próxima ação"><PtBrDateTimeField value={f.next_action_at} onChange={value=>set('next_action_at',value)} ariaLabel="Próxima ação"/></Field>
          <Field label="Notas comerciais"><textarea rows={5} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Contexto inicial para a equipe"/></Field>
          <div className="origin-note"><Check size={15}/><span>Quem fizer o cadastro será registrado automaticamente como originador/prospector da editora.</span></div>
          <button className="btn full" disabled={saving||checkingCnpj||Boolean(duplicate)}><Save size={15}/>{saving?'Salvando…':'Salvar editora'}</button>
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
      .field-invalid{border-color:#f04438!important}
      .field-hint{color:#667085;font-weight:400}
      .field-ok{display:flex;align-items:center;gap:5px;color:#067647;font-weight:600}
      .cnpj-duplicate{display:grid;gap:3px;padding:10px 12px;border:1px solid #fda29b;background:#fef3f2;border-radius:10px;color:#912018}
      .cnpj-duplicate span{font-weight:500}
      .profile-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .profile-search{position:relative;flex:1;max-width:440px}
      .profile-search>svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#667085;pointer-events:none}
      .profile-search :global(input){padding-left:34px}
      .profile-boxes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:330px;overflow:auto;padding:2px 4px 2px 2px}
      .profile-option{display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:8px!important;padding:9px 10px;border:1px solid #eaecf0;border-radius:10px;background:#fff;cursor:pointer;font-size:11px!important;font-weight:500!important}
      .profile-option.selected{border-color:#84adff;background:#eff4ff;color:#1849a9}
      .profile-option input{margin-top:1px}
      .profile-empty{grid-column:1/-1}
      .new-profile-row{display:grid;gap:8px;padding-top:12px;border-top:1px solid #eaecf0}
      .new-profile-row>div:first-child{display:grid;gap:2px}
      .new-profile-row strong{font-size:12px}
      .new-profile-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .profile-notice{color:#475467}
      .people-group{grid-column:1/-1;display:grid;gap:10px}
      .people-group+.people-group{margin-top:10px;padding-top:18px;border-top:1px solid #eaecf0}
      .people-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .people-group-head>div{display:grid;gap:3px}
      .people-group-head h3{margin:0;font-size:14px}
      .people-list{display:grid;gap:10px}
      .person-card{border:1px solid #eaecf0;border-radius:12px;padding:13px;background:#fcfcfd}
      .person-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .person-card-title{display:flex;align-items:center;gap:8px;font-size:12px}
      .person-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 12px}
      .person-grid :global(label){display:grid;gap:6px;font-size:11px;font-weight:600;color:#344054}
      .person-grid .span-2{grid-column:1/-1}
      .person-flags{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
      .person-flags label{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:6px!important}
      .people-empty{padding:13px;border:1px dashed #d0d5dd;border-radius:10px;color:#667085;font-size:11px;text-align:center}
      .origin-note{display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:10px;background:#f9fafb;color:#475467;font-size:11px;line-height:1.4}
      :global(.publisher-create-section){padding:18px}
      :global(.publisher-create-section .section-title){margin-bottom:14px}
      :global(.publisher-create-section .section-title h2){margin:0 0 3px}
      :global(.publisher-create-section .form-grid){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}
      :global(.publisher-create-section label){display:grid;gap:6px;font-size:12px;font-weight:600;color:#344054}
      :global(.publisher-create-section textarea){resize:vertical}
      :global(.publisher-create-section .span-2){grid-column:1/-1}
      :global(.new-publisher-aside label){display:grid;gap:6px;font-size:12px;font-weight:600;color:#344054}
      @media(max-width:1100px){.profile-boxes{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:1000px){.new-publisher-layout{grid-template-columns:1fr}.sticky-card{position:static}}
      @media(max-width:700px){
        .head-actions{width:100%}.head-actions :global(.btn){flex:1}
        :global(.publisher-create-section .form-grid){grid-template-columns:1fr}
        :global(.publisher-create-section .span-2){grid-column:auto}
        .profile-toolbar{align-items:stretch;flex-direction:column}
        .profile-search{max-width:none}
        .profile-boxes{grid-template-columns:1fr;max-height:420px}
        .new-profile-action{grid-template-columns:1fr}
        .person-grid{grid-template-columns:1fr}
        .person-grid .span-2{grid-column:auto}
        .people-group-head{flex-direction:column}
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
  return <label className={className}><span>{label}{required&&<b style={{color:'#b42318'}}> *</b>}</span>{children}</label>;
}

function PersonGroup({title,description,kind,people,onAdd,onChange,onRemove}){
  const legal=kind==='legal';
  return <div className="people-group">
    <div className="people-group-head">
      <div><h3>{title}</h3><span className="muted" style={{fontSize:11}}>{description}</span></div>
      <button type="button" className="btn secondary small" onClick={onAdd}><Plus size={14}/> Adicionar pessoa</button>
    </div>
    {people.length?<div className="people-list">{people.map((person,index)=><div className="person-card" key={person.client_id}>
      <div className="person-card-head">
        <div className="person-card-title"><UserRound size={16}/><strong>{person.full_name||`Pessoa ${index+1}`}</strong>{legal&&<span className="badge">Sócio / responsável legal</span>}</div>
        <button type="button" className="btn secondary small" onClick={()=>onRemove(person.client_id)}><Trash2 size={13}/> Remover</button>
      </div>
      <div className="person-grid">
        <Field label="Nome" required><input className="input" required value={person.full_name} onChange={e=>onChange(person.client_id,'full_name',e.target.value)}/></Field>
        <Field label={legal?'Função / vínculo':'Cargo / função'} required={legal}><input className="input" required={legal} value={person.job_title} onChange={e=>onChange(person.client_id,'job_title',e.target.value)} placeholder={legal?'Ex.: Sócio-administrador, responsável legal':'Ex.: Diretora editorial'}/></Field>
        <Field label="Área / departamento"><input className="input" value={person.department} onChange={e=>onChange(person.client_id,'department',e.target.value)} placeholder="Ex.: Editorial, Comercial"/></Field>
        <Field label="E-mail"><input className="input" type="email" value={person.email} onChange={e=>onChange(person.client_id,'email',e.target.value)}/></Field>
        <Field label="Telefone"><input className="input" value={person.phone} onChange={e=>onChange(person.client_id,'phone',e.target.value)}/></Field>
        <Field label="Celular / WhatsApp"><input className="input" value={person.mobile} onChange={e=>onChange(person.client_id,'mobile',e.target.value)}/></Field>
        <Field className="span-2" label="LinkedIn"><input className="input" value={person.linkedin_url} onChange={e=>onChange(person.client_id,'linkedin_url',e.target.value)} placeholder="https://linkedin.com/in/..."/></Field>
        <Field label="Canal preferencial"><select value={person.preferred_channel} onChange={e=>onChange(person.client_id,'preferred_channel',e.target.value)}><option value="">Não definido</option><option value="phone">Telefone</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="linkedin">LinkedIn</option><option value="other">Outro</option></select></Field>
        <div className="person-flags"><label><input type="checkbox" checked={person.is_decision_maker} onChange={e=>onChange(person.client_id,'is_decision_maker',e.target.checked)}/> É decisor(a)</label></div>
        <Field className="span-2" label="Observações"><textarea rows={2} value={person.notes} onChange={e=>onChange(person.client_id,'notes',e.target.value)}/></Field>
      </div>
    </div>)}</div>:<div className="people-empty">Nenhuma pessoa adicionada neste grupo.</div>}
  </div>;
}
