import crypto from 'crypto';
import { NextResponse } from 'next/server';
import {
  GOOGLE_OAUTH_CODE_COOKIE,GOOGLE_OAUTH_STATE_COOKIE,
  authenticateRequest,canConnectCalendar,canReadPresenterAvailability,
  createAuthorizationUrl,createSignedCookie,readSignedCookie,googleConfig,
  exchangeAuthorizationCode,googleAccountEmail,encryptRefreshToken,decryptRefreshToken,
  refreshGoogleAccessToken,queryGoogleFreeBusy,revokeGoogleToken,GOOGLE_FREEBUSY_SCOPE
} from '@/lib/server/googleCalendar';

function errorResponse(error){
  const status=error.status||(['GOOGLE_RECONNECT_REQUIRED'].includes(error.code)?409:400);
  return NextResponse.json({error:error.message,code:error.code||'GOOGLE_CALENDAR_ERROR'},{status});
}

export async function GET(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const {data,error}=await supabase.from('google_calendar_connections')
      .select('user_id,google_account_email,calendar_id,granted_scopes,connected_at,updated_at')
      .eq('organization_id',membership.organization_id).eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    return NextResponse.json({configured:googleConfig().configured,canConnect:canConnectCalendar(membership),connection:data||null});
  }catch(error){return errorResponse(error)}
}

export async function POST(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const body=await request.json().catch(()=>({}));
    const action=body.action;

    if(action==='connect'){
      if(!googleConfig().configured){const error=new Error('Faltam as credenciais OAuth do Google no servidor.');error.code='GOOGLE_NOT_CONFIGURED';throw error}
      if(!canConnectCalendar(membership)){const error=new Error('Somente apresentadores e gestores podem conectar uma agenda.');error.status=403;throw error}
      const state=crypto.randomBytes(24).toString('base64url');
      const signed=createSignedCookie({state,userId:user.id,orgId:membership.organization_id,exp:Date.now()+10*60*1000});
      const url=createAuthorizationUrl({state,loginHint:user.email||membership.email||''});
      const response=NextResponse.json({url});
      response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE,signed,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
      return response;
    }

    if(action==='finalize'){
      if(!canConnectCalendar(membership)){const error=new Error('Seu perfil não permite conectar uma agenda.');error.status=403;throw error}
      const payload=readSignedCookie(request.cookies.get(GOOGLE_OAUTH_CODE_COOKIE)?.value);
      if(!payload||payload.userId!==user.id||payload.orgId!==membership.organization_id){const error=new Error('A autorização do Google expirou ou não corresponde a este usuário.');error.code='GOOGLE_OAUTH_EXPIRED';throw error}
      const tokens=await exchangeAuthorizationCode(payload.code);
      if(!tokens.refresh_token){const error=new Error('O Google não retornou autorização permanente. Desconecte o app no Google e tente conectar novamente.');error.code='GOOGLE_REFRESH_TOKEN_MISSING';throw error}
      const email=await googleAccountEmail(tokens.access_token,tokens.id_token);
      const scopes=String(tokens.scope||'').split(/\s+/).filter(Boolean);
      const {error}=await supabase.from('google_calendar_connections').upsert({
        organization_id:membership.organization_id,user_id:user.id,
        google_account_email:email,calendar_id:'primary',
        encrypted_refresh_token:encryptRefreshToken(tokens.refresh_token),
        granted_scopes:scopes,updated_at:new Date().toISOString()
      },{onConflict:'organization_id,user_id'});
      if(error)throw error;
      const response=NextResponse.json({ok:true,email});
      response.cookies.set(GOOGLE_OAUTH_CODE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
      response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
      return response;
    }

    if(action==='disconnect'){
      const {data,error}=await supabase.from('google_calendar_connections')
        .select('encrypted_refresh_token').eq('organization_id',membership.organization_id).eq('user_id',user.id).maybeSingle();
      if(error)throw error;
      if(data?.encrypted_refresh_token)await revokeGoogleToken(decryptRefreshToken(data.encrypted_refresh_token));
      const {error:deleteError}=await supabase.from('google_calendar_connections')
        .delete().eq('organization_id',membership.organization_id).eq('user_id',user.id);
      if(deleteError)throw deleteError;
      return NextResponse.json({ok:true});
    }

    if(action==='availability'){
      const presenterUserId=body.presenterUserId||user.id;
      if(!canReadPresenterAvailability(membership,presenterUserId)){const error=new Error('Seu perfil não permite consultar a disponibilidade deste apresentador.');error.status=403;throw error}
      const timeMin=new Date(body.timeMin);const timeMax=new Date(body.timeMax);
      if(Number.isNaN(timeMin.getTime())||Number.isNaN(timeMax.getTime())||timeMax<=timeMin){const error=new Error('Intervalo de disponibilidade inválido.');throw error}
      if(timeMax-timeMin>31*24*60*60*1000){const error=new Error('Consulte no máximo 31 dias por vez.');throw error}
      const {data:presenter,error:presenterError}=await supabase.from('org_members')
        .select('user_id,role,active,commercial_functions,full_name,email')
        .eq('organization_id',membership.organization_id).eq('user_id',presenterUserId).eq('active',true).maybeSingle();
      if(presenterError)throw presenterError;
      if(!presenter){const error=new Error('Apresentador não encontrado.');error.status=404;throw error}
      if(!['owner','admin','supervisor'].includes(presenter.role)&&!(presenter.commercial_functions||[]).includes('commercial_presentation')){const error=new Error('O usuário selecionado não está habilitado para apresentações.');throw error}
      const {data:connection,error:connectionError}=await supabase.from('google_calendar_connections')
        .select('calendar_id,encrypted_refresh_token,google_account_email,granted_scopes')
        .eq('organization_id',membership.organization_id).eq('user_id',presenterUserId).maybeSingle();
      if(connectionError)throw connectionError;
      if(!connection){const error=new Error('Este apresentador ainda não conectou o Google Agenda.');error.code='GOOGLE_NOT_CONNECTED';throw error}
      if(connection.granted_scopes?.length&&!connection.granted_scopes.includes(GOOGLE_FREEBUSY_SCOPE)){const error=new Error('A conexão não possui permissão de disponibilidade. Reconecte o Google Agenda.');error.code='GOOGLE_RECONNECT_REQUIRED';throw error}
      const accessToken=await refreshGoogleAccessToken(decryptRefreshToken(connection.encrypted_refresh_token));
      const busy=await queryGoogleFreeBusy({accessToken,calendarId:connection.calendar_id,timeMin:timeMin.toISOString(),timeMax:timeMax.toISOString()});
      return NextResponse.json({presenter:{userId:presenter.user_id,name:presenter.full_name||presenter.email},calendarEmail:connection.google_account_email||null,timeMin:timeMin.toISOString(),timeMax:timeMax.toISOString(),busy});
    }

    return NextResponse.json({error:'Ação inválida.'},{status:400});
  }catch(error){return errorResponse(error)}
}
