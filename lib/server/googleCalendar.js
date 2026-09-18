import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL='https://xogfqpeubtcqehaadywm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_IbQqX6KVjmNnCEJwCOMxIw_Znd34ZyD';

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

export function newBridgeKey(){
  return crypto.randomBytes(32).toString('base64url');
}

export function validateBridgeUrl(value){
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.hostname!=='script.google.com')return null;
    if(!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))return null;
    url.hash='';
    return url.toString();
  }catch{return null}
}

function normalizeBusy(items){
  return (Array.isArray(items)?items:[])
    .map(item=>({
      start:new Date(item?.start),
      end:new Date(item?.end),
      title:String(item?.title||'').trim().slice(0,160)
    }))
    .filter(item=>!Number.isNaN(item.start.getTime())&&!Number.isNaN(item.end.getTime())&&item.end>item.start)
    .sort((a,b)=>a.start-b.start)
    .map(item=>({
      start:item.start.toISOString(),
      end:item.end.toISOString(),
      ...(item.title?{title:item.title}:{})
    }));
}

export async function callCalendarBridge({url,key,action='busy',timeMin,timeMax,payload={}}){
  const endpoint=validateBridgeUrl(url);
  if(!endpoint){const error=new Error('URL do Apps Script inválida.');error.code='CALENDAR_BRIDGE_URL_INVALID';throw error}
  if(!key){const error=new Error('Chave da ponte de agenda ausente.');error.code='CALENDAR_BRIDGE_KEY_MISSING';throw error}
  const requestPayload={action,key,...payload};
  if(timeMin)requestPayload.timeMin=timeMin;
  if(timeMax)requestPayload.timeMax=timeMax;
  let response;
  try{
    response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'text/plain;charset=utf-8'},
      body:JSON.stringify(requestPayload),
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(12000)
    });
  }catch{
    const error=new Error('Não foi possível alcançar a ponte do Google Agenda.');error.code='CALENDAR_BRIDGE_UNREACHABLE';throw error
  }
  const text=await response.text();
  let data;
  try{data=JSON.parse(text)}catch{
    const error=new Error('A ponte do Google Agenda respondeu em formato inesperado. Verifique a implantação do Apps Script.');error.code='CALENDAR_BRIDGE_BAD_RESPONSE';throw error
  }
  if(!response.ok||data?.ok!==true){
    const error=new Error(data?.error==='unauthorized'?'A chave da ponte não confere. Gere uma nova configuração no CRM e atualize o Apps Script.':data?.message||'A ponte do Google Agenda não conseguiu consultar a agenda.');
    error.code=data?.error==='unauthorized'?'CALENDAR_BRIDGE_UNAUTHORIZED':'CALENDAR_BRIDGE_FAILED';
    throw error;
  }
  return {...data,busy:normalizeBusy(data.busy)};
}

export function buildBridgeScript(key){
  return `const RADAR_BRIDGE_KEY = '${String(key).replace(/'/g,"\\'")}';

function authorizeRadar() {
  const now = new Date();
  CalendarApp.getDefaultCalendar().getEvents(now, new Date(now.getTime() + 60000));
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.key !== RADAR_BRIDGE_KEY) return json_({ ok: false, error: 'unauthorized' });
    if (body.action === 'ping') {
      return json_({ ok: true, account: Session.getEffectiveUser().getEmail() || '', busy: [] });
    }

    const calendar = CalendarApp.getDefaultCalendar();

    if (body.action === 'busy') {
      const start = new Date(body.timeMin);
      const end = new Date(body.timeMax);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return json_({ ok: false, error: 'invalid_range' });
      }
      if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
        return json_({ ok: false, error: 'range_too_large' });
      }

      const events = calendar.getEvents(start, end);
      const busy = events
        .filter(event => event.getTransparency() === CalendarApp.EventTransparency.OPAQUE)
        .map(event => ({
          start: event.getStartTime().toISOString(),
          end: event.getEndTime().toISOString(),
          title: event.getTitle() || 'Compromisso no Google Agenda'
        }));

      return json_({
        ok: true,
        account: Session.getEffectiveUser().getEmail() || '',
        busy
      });
    }

    if (body.action === 'create_event') {
      const data = normalizeEventPayload_(body);
      if (!data.ok) return json_({ ok: false, error: data.error });
      const options = {
        description: data.description,
        guests: data.guests.join(','),
        sendInvites: true
      };
      const event = calendar.createEvent(data.title, data.start, data.end, options);
      if (body.meetingId) event.setTag('radarMeetingId', String(body.meetingId));
      return json_({
        ok: true,
        account: Session.getEffectiveUser().getEmail() || '',
        eventId: event.getId()
      });
    }

    if (body.action === 'update_event') {
      if (!body.eventId) return json_({ ok: false, error: 'missing_event_id' });
      const event = calendar.getEventById(String(body.eventId));
      if (!event) return json_({ ok: false, error: 'event_not_found' });
      const data = normalizeEventPayload_(body);
      if (!data.ok) return json_({ ok: false, error: data.error });

      event.setTitle(data.title);
      event.setTime(data.start, data.end);
      event.setDescription(data.description);

      const currentGuests = event.getGuestList().map(guest => String(guest.getEmail() || '').toLowerCase()).filter(Boolean);
      const wantedGuests = data.guests.map(email => email.toLowerCase());
      currentGuests.filter(email => !wantedGuests.includes(email)).forEach(email => event.removeGuest(email));
      wantedGuests.filter(email => !currentGuests.includes(email)).forEach(email => event.addGuest(email));

      return json_({
        ok: true,
        account: Session.getEffectiveUser().getEmail() || '',
        eventId: event.getId()
      });
    }

    if (body.action === 'delete_event') {
      if (!body.eventId) return json_({ ok: true, deleted: false });
      const event = calendar.getEventById(String(body.eventId));
      if (event) event.deleteEvent();
      return json_({ ok: true, deleted: true });
    }

    return json_({ ok: false, error: 'unsupported_action' });
  } catch (error) {
    return json_({ ok: false, error: 'calendar_read_failed', message: 'Não foi possível consultar a agenda.' });
  }
}

function normalizeEventPayload_(body) {
  const start = new Date(body.start);
  const end = new Date(body.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'invalid_event_range' };
  }
  const title = String(body.title || 'Reunião Radar').trim().slice(0, 200) || 'Reunião Radar';
  const description = String(body.description || '').slice(0, 8000);
  const guests = Array.from(new Set((Array.isArray(body.guests) ? body.guests : [])
    .map(email => String(email || '').trim())
    .filter(email => email && email.indexOf('@') > 0)));
  return { ok: true, title, description, guests, start, end };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}`;
}
