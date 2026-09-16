import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL='https://xogfqpeubtcqehaadywm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_IbQqX6KVjmNnCEJwCOMxIw_Znd34ZyD';
export const SITE_URL='https://radar-crm-lac.vercel.app';
export const GOOGLE_OAUTH_STATE_COOKIE='radar_google_oauth_state';
export const GOOGLE_OAUTH_CODE_COOKIE='radar_google_oauth_code';
export const GOOGLE_FREEBUSY_SCOPE='https://www.googleapis.com/auth/calendar.freebusy';

function config(){
  const clientId=process.env.GOOGLE_CLIENT_ID||'';
  const clientSecret=process.env.GOOGLE_CLIENT_SECRET||'';
  const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${SITE_URL}/api/google-calendar/callback`;
  return {clientId,clientSecret,redirectUri,configured:Boolean(clientId&&clientSecret)};
}

export function googleConfig(){
  const {configured,redirectUri}=config();
  return {configured,redirectUri};
}

function requireConfig(){
  const value=config();
  if(!value.configured){const error=new Error('A integração Google Agenda ainda não foi configurada no servidor.');error.code='GOOGLE_NOT_CONFIGURED';throw error}
  return value;
}

function tokenKey(){
  const {clientSecret}=requireConfig();
  return crypto.createHash('sha256').update(`${clientSecret}:radar-google-calendar-token-v1`).digest();
}

export function encryptRefreshToken(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return ['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join('.');
}

export function decryptRefreshToken(value){
  const [version,ivText,tagText,dataText]=String(value||'').split('.');
  if(version!=='v1'||!ivText||!tagText||!dataText)throw new Error('Credencial do Google Agenda inválida.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivText,'base64url'));
  decipher.setAuthTag(Buffer.from(tagText,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()]).toString('utf8');
}

function signPayloadObject(value){
  const {clientSecret}=requireConfig();
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature=crypto.createHmac('sha256',clientSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function createSignedCookie(value){return signPayloadObject(value)}

export function readSignedCookie(value){
  try{
    const {clientSecret}=requireConfig();
    const [payload,signature]=String(value||'').split('.');
    if(!payload||!signature)return null;
    const expected=crypto.createHmac('sha256',clientSecret).update(payload).digest('base64url');
    const a=Buffer.from(signature);const b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const parsed=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(parsed.exp&&Date.now()>parsed.exp)return null;
    return parsed;
  }catch{return null}
}

function userSupabase(accessToken){
  return createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
}

export async function authenticateRequest(request){
  const header=request.headers.get('authorization')||'';
  const accessToken=header.startsWith('Bearer ')?header.slice(7):'';
  if(!accessToken){const error=new Error('Sessão não informada.');error.status=401;throw error}
  const supabase=userSupabase(accessToken);
  const {data:{user},error:userError}=await supabase.auth.getUser(accessToken);
  if(userError||!user){const error=new Error('Sessão inválida.');error.status=401;throw error}
  const {data:membership,error:memberError}=await supabase.from('org_members')
    .select('organization_id,user_id,role,active,email,commercial_functions')
    .eq('user_id',user.id).eq('active',true).maybeSingle();
  if(memberError||!membership){const error=new Error('Usuário sem acesso ativo ao CRM.');error.status=403;throw error}
  return {accessToken,supabase,user,membership};
}

export function canConnectCalendar(membership){
  return ['owner','admin','supervisor'].includes(membership?.role)||(membership?.commercial_functions||[]).includes('commercial_presentation');
}

export function canReadPresenterAvailability(membership,presenterUserId){
  return membership?.user_id===presenterUserId||['owner','admin','supervisor'].includes(membership?.role)||(membership?.commercial_functions||[]).includes('meeting_scheduling');
}

export function createAuthorizationUrl({state,loginHint}){
  const {clientId,redirectUri}=requireConfig();
  const params=new URLSearchParams({
    client_id:clientId,
    redirect_uri:redirectUri,
    response_type:'code',
    access_type:'offline',
    include_granted_scopes:'true',
    prompt:'consent',
    scope:`openid email ${GOOGLE_FREEBUSY_SCOPE}`,
    state
  });
  if(loginHint)params.set('login_hint',loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code){
  const {clientId,clientSecret,redirectUri}=requireConfig();
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri}),
    cache:'no-store'
  });
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error_description||data.error||'Falha ao concluir autorização Google.');error.code='GOOGLE_TOKEN_EXCHANGE_FAILED';throw error}
  return data;
}

export async function refreshGoogleAccessToken(refreshToken){
  const {clientId,clientSecret}=requireConfig();
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),
    cache:'no-store'
  });
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error_description||data.error||'Não foi possível renovar a autorização do Google Agenda.');error.code=data.error==='invalid_grant'?'GOOGLE_RECONNECT_REQUIRED':'GOOGLE_REFRESH_FAILED';throw error}
  return data.access_token;
}

export async function googleAccountEmail(accessToken,idToken){
  try{
    const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});
    if(response.ok){const data=await response.json();if(data.email)return data.email}
  }catch{}
  try{
    const payload=JSON.parse(Buffer.from(String(idToken||'').split('.')[1]||'','base64url').toString('utf8'));
    return payload.email||null;
  }catch{return null}
}

export async function queryGoogleFreeBusy({accessToken,calendarId='primary',timeMin,timeMax,timeZone='America/Sao_Paulo'}){
  const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{
    method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'content-type':'application/json'},
    body:JSON.stringify({timeMin,timeMax,timeZone,items:[{id:calendarId}]}),cache:'no-store'
  });
  const data=await response.json();
  if(!response.ok){const error=new Error(data?.error?.message||'Falha ao consultar disponibilidade no Google Agenda.');error.code='GOOGLE_FREEBUSY_FAILED';throw error}
  const calendar=data.calendars?.[calendarId]||data.calendars?.primary||{};
  if(calendar.errors?.length){const error=new Error(calendar.errors[0]?.reason||'Agenda indisponível para consulta.');error.code='GOOGLE_CALENDAR_UNAVAILABLE';throw error}
  return calendar.busy||[];
}

export async function revokeGoogleToken(refreshToken){
  try{
    const response=await fetch('https://oauth2.googleapis.com/revoke',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token:refreshToken}),cache:'no-store'
    });
    return response.ok;
  }catch{return false}
}
