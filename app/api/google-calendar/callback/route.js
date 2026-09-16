import { NextResponse } from 'next/server';
import { GOOGLE_OAUTH_CODE_COOKIE,GOOGLE_OAUTH_STATE_COOKIE,SITE_URL,createSignedCookie,readSignedCookie } from '@/lib/server/googleCalendar';

export async function GET(request){
  const url=request.nextUrl;
  const state=url.searchParams.get('state')||'';
  const code=url.searchParams.get('code')||'';
  const googleError=url.searchParams.get('error')||'';
  const statePayload=readSignedCookie(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value);

  if(googleError){
    const response=NextResponse.redirect(`${SITE_URL}/app/perfil?google_calendar=cancelled`);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
    return response;
  }

  if(!code||!statePayload||statePayload.state!==state){
    const response=NextResponse.redirect(`${SITE_URL}/app/perfil?google_calendar=invalid`);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
    return response;
  }

  const signedCode=createSignedCookie({code,userId:statePayload.userId,orgId:statePayload.orgId,exp:Date.now()+10*60*1000});
  const response=NextResponse.redirect(`${SITE_URL}/app/perfil?google_calendar=finalize`);
  response.cookies.set(GOOGLE_OAUTH_CODE_COOKIE,signedCode,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  return response;
}
