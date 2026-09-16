import { NextResponse } from 'next/server';
import {
  authenticateRequest,canConnectCalendar,canReadPresenterAvailability,
  newBridgeKey,validateBridgeUrl,callCalendarBridge,buildBridgeScript
} from '@/lib/server/googleCalendar';

function errorResponse(error){
  const conflictCodes=['CALENDAR_NOT_CONNECTED','CALENDAR_BRIDGE_UNAUTHORIZED','CALENDAR_BRIDGE_FAILED','CALENDAR_BRIDGE_UNREACHABLE'];
  const status=error.status||(conflictCodes.includes(error.code)?409:400);
  return NextResponse.json({error:error.message,code:error.code||'GOOGLE_CALENDAR_ERROR'},{status});
}

export async function GET(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const {data,error}=await supabase.from('google_calendar_connections')
      .select('user_id,google_account_email,connection_method,bridge_url,bridge_key,bridge_status,last_verified_at,connected_at,updated_at')
      .eq('organization_id',membership.organization_id).eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    const connection=data?{
      user_id:data.user_id,
      google_account_email:data.google_account_email,
      connection_method:data.connection_method,
      bridge_url:data.bridge_url,
      bridge_status:data.bridge_status,
      last_verified_at:data.last_verified_at,
      connected_at:data.connected_at,
      updated_at:data.updated_at
    }:null;
    return NextResponse.json({
      configured:true,
      canConnect:canConnectCalendar(membership),
      connection,
      scriptCode:data?.bridge_key?buildBridgeScript(data.bridge_key):null
    });
  }catch(error){return errorResponse(error)}
}

export async function POST(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const body=await request.json().catch(()=>({}));
    const action=body.action;

    if(action==='prepare'){
      if(!canConnectCalendar(membership)){const error=new Error('Somente apresentadores e gestores podem conectar uma agenda.');error.status=403;throw error}
      const key=newBridgeKey();
      const {error}=await supabase.from('google_calendar_connections').upsert({
        organization_id:membership.organization_id,
        user_id:user.id,
        connection_method:'apps_script',
        bridge_key:key,
        bridge_url:null,
        bridge_status:'pending',
        google_account_email:null,
        last_verified_at:null,
        encrypted_refresh_token:null,
        granted_scopes:[]
      },{onConflict:'organization_id,user_id'});
      if(error)throw error;
      return NextResponse.json({ok:true,scriptCode:buildBridgeScript(key)});
    }

    if(action==='save_bridge'){
      if(!canConnectCalendar(membership)){const error=new Error('Seu perfil não permite conectar uma agenda.');error.status=403;throw error}
      const bridgeUrl=validateBridgeUrl(body.bridgeUrl);
      if(!bridgeUrl){const error=new Error('Cole a URL de implantação do Apps Script terminada em /exec.');error.code='CALENDAR_BRIDGE_URL_INVALID';throw error}
      const {data:connection,error:connectionError}=await supabase.from('google_calendar_connections')
        .select('bridge_key').eq('organization_id',membership.organization_id).eq('user_id',user.id).maybeSingle();
      if(connectionError)throw connectionError;
      if(!connection?.bridge_key){const error=new Error('Prepare a conexão antes de salvar a URL do Apps Script.');error.code='CALENDAR_SETUP_REQUIRED';throw error}
      const now=new Date();const end=new Date(now.getTime()+24*60*60*1000);
      const result=await callCalendarBridge({url:bridgeUrl,key:connection.bridge_key,action:'busy',timeMin:now.toISOString(),timeMax:end.toISOString()});
      const {error:updateError}=await supabase.from('google_calendar_connections').update({
        bridge_url:bridgeUrl,
        bridge_status:'connected',
        google_account_email:result.account||null,
        last_verified_at:new Date().toISOString()
      }).eq('organization_id',membership.organization_id).eq('user_id',user.id);
      if(updateError)throw updateError;
      return NextResponse.json({ok:true,email:result.account||null,busy:result.busy||[]});
    }

    if(action==='disconnect'){
      const {error}=await supabase.from('google_calendar_connections')
        .delete().eq('organization_id',membership.organization_id).eq('user_id',user.id);
      if(error)throw error;
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
        .select('bridge_url,bridge_key,bridge_status,google_account_email,connection_method')
        .eq('organization_id',membership.organization_id).eq('user_id',presenterUserId).maybeSingle();
      if(connectionError)throw connectionError;
      if(!connection||connection.bridge_status!=='connected'||!connection.bridge_url||!connection.bridge_key){const error=new Error('Este apresentador ainda não conectou a disponibilidade do Google Agenda.');error.code='CALENDAR_NOT_CONNECTED';throw error}
      const result=await callCalendarBridge({
        url:connection.bridge_url,key:connection.bridge_key,action:'busy',
        timeMin:timeMin.toISOString(),timeMax:timeMax.toISOString()
      });
      return NextResponse.json({
        presenter:{userId:presenter.user_id,name:presenter.full_name||presenter.email},
        calendarEmail:result.account||connection.google_account_email||null,
        timeMin:timeMin.toISOString(),timeMax:timeMax.toISOString(),
        busy:result.busy||[]
      });
    }

    return NextResponse.json({error:'Ação inválida.'},{status:400});
  }catch(error){return errorResponse(error)}
}
