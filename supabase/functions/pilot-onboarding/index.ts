const ORIGIN='https://haqn455-coder.github.io';
const PUB='sb_publishable_3G6sjO0orxo7FjoS2hUNDw_bbsavIbw';
const CLINIC='https://haqn455-coder.github.io/phc-compliance-os-ui/clinic.html';
function tenantRedirect(tenantId:string,pilotCode:string){const u=new URL(CLINIC);u.searchParams.set('tenant',tenantId);u.searchParams.set('pilot',pilotCode);return u.toString()}
function cors(req:Request){const o=req.headers.get('origin');return {'access-control-allow-origin':o===ORIGIN?ORIGIN:'null','access-control-allow-headers':'authorization,content-type,apikey,x-client-info','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin'}}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(req),'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function clean(v:unknown,n=500){return String(v??'').trim().slice(0,n)}
function emailOK(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function uuidOK(v:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)}
async function sha(v:string){const b=new TextEncoder().encode(v);const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function clients(){const URL=Deno.env.get('SUPABASE_URL'),SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!URL||!SERVICE)throw new Error('Supabase env missing');const mod=await import('npm:@supabase/supabase-js@2');const admin=mod.createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});return{URL,admin,createClient:mod.createClient}}
async function actor(req:Request){const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return null;const{URL,admin,createClient}=await clients();const c=createClient(URL,PUB,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});const u=await c.auth.getUser(auth.slice(7));if(u.error||!u.data.user)return null;return{user:u.data.user,admin}}
async function adminActor(req:Request){const a=await actor(req);if(!a)return null;const p=await a.admin.from('platform_admins').select('user_id').eq('user_id',a.user.id).maybeSingle();if(!p.data)return null;return a}
async function magicLink(admin:any,email:string,tenantId:string,pilotCode:string){return admin.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:tenantRedirect(tenantId,pilotCode)}})}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
 if(req.headers.get('origin')!==ORIGIN)return json(req,{error:'origin not allowed'},403);
 const u=new URL(req.url),p=u.pathname.replace(/^.*\/pilot-onboarding/,'')||'/';
 try{
  const{admin}=await clients();
  if(p==='/health')return json(req,{ok:true,version:4,service:'pilot-onboarding'});
  if(p==='/request'&&req.method==='POST'){
   const b=await req.json();if(clean(b.website))return json(req,{ok:true});
   const clinic_name=clean(b.clinic_name,120),city=clean(b.city,80),district=clean(b.district,80),owner_name=clean(b.owner_name,120),owner_email=clean(b.owner_email,180).toLowerCase(),phone=clean(b.phone,40),clinic_type=clean(b.clinic_type,40),phc_status=clean(b.phc_status,40)||'UNKNOWN';
   if(!clinic_name||!city||!owner_name||!emailOK(owner_email))return json(req,{error:'Clinic name, city, owner name and valid email are required.'},400);
   if(!['GP','FAMILY_PHYSICIAN','SPECIALIST_CLINIC'].includes(clinic_type))return json(req,{error:'Unsupported clinic type'},400);
   if(!['REGISTERED_LICENSED','APPLIED_PENDING','NOT_REGISTERED','UNKNOWN'].includes(phc_status))return json(req,{error:'Invalid PHC status'},400);
   if(b.accept_terms!==true)return json(req,{error:'Pilot terms must be accepted'},400);
   const since=new Date(Date.now()-15*60*1000).toISOString(),recent=await admin.from('pilot_requests').select('id').eq('owner_email',owner_email).gte('submitted_at',since).limit(1);if(recent.data?.length)return json(req,{error:'A recent request already exists for this email. Please wait before submitting again.'},429);
   const ins=await admin.from('pilot_requests').insert({clinic_name,city,district:district||null,owner_name,owner_email,phone:phone||null,clinic_type,phc_status,services:clean(b.services,1500)||null,staff_summary:clean(b.staff_summary,800)||null,operating_hours:clean(b.operating_hours,500)||null,google_account_available:b.google_account_available===true,applicant_notes:clean(b.applicant_notes,1000)||null,terms_accepted_at:new Date().toISOString()}).select('id,request_ref,status,submitted_at').single();
   if(ins.error)return json(req,{error:'Could not save request'},400);return json(req,{ok:true,...ins.data});
  }
  if(p==='/session/open'&&req.method==='POST'){
   const a=await actor(req);if(!a)return json(req,{error:'authentication required'},401);
   const b=await req.json(),requested=clean(b.tenant_id,80),device_id=clean(b.device_id,120),tz=clean(b.timezone,120),lang=clean(b.language,40),ua=clean(req.headers.get('user-agent'),500);
   if(requested&&!uuidOK(requested))return json(req,{error:'invalid clinic link'},400);
   let mq=admin.from('memberships').select('tenant_id,role').eq('user_id',a.user.id);if(requested)mq=mq.eq('tenant_id',requested);else mq=mq.limit(2);
   const ms=await mq;if(ms.error||!ms.data?.length)return json(req,{error:requested?'this account is not assigned to the requested clinic':'no active clinic access'},403);
   if(!requested&&ms.data.length!==1)return json(req,{error:'multiple clinic assignments found; open a tenant-specific clinic link'},409);
   const membership=ms.data[0],tid=membership.tenant_id;
   const pr=await admin.from('pilot_requests').select('id,pilot_code,status,clinic_name').eq('tenant_id',tid).order('submitted_at',{ascending:false}).limit(1).maybeSingle();
   if(pr.error)return json(req,{error:'pilot access could not be verified'},500);
   if(pr.data&&['SUSPENDED','CLOSED'].includes(pr.data.status))return json(req,{error:'pilot access is not active'},403);
   const fwd=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim(),iph=fwd?await sha(fwd):null;
   if(pr.data)await admin.from('pilot_access_events').insert({pilot_request_id:pr.data.id,tenant_id:tid,user_id:a.user.id,event_type:'WORKSPACE_OPEN',device_id:device_id||null,user_agent:ua||null,client_timezone:tz||null,client_language:lang||null,ip_hash:iph});
   return json(req,{ok:true,tenant_id:tid,role:membership.role,pilot_code:pr.data?.pilot_code||null,status:pr.data?.status||'ACTIVE',clinic_name:pr.data?.clinic_name||null});
  }
  const a=await adminActor(req);if(!a)return json(req,{error:'admin authentication required'},401);
  if(p==='/admin/tenant-preview'&&req.method==='GET'){
   const tid=clean(u.searchParams.get('tenant_id'),80);if(!uuidOK(tid))return json(req,{error:'valid tenant_id required'},400);
   const [tenant,facility,requirements,definitions,pilot]=await Promise.all([
    admin.from('tenants').select('id,name').eq('id',tid).maybeSingle(),admin.from('facilities').select('id,name,phc_category').eq('tenant_id',tid).limit(1),admin.from('facility_requirements').select('id,requirement_definition_id,state,review_decision,applicable,applicability_reason').eq('tenant_id',tid),admin.from('requirement_definitions').select('id,indicator_no,standard_code,indicator_text,evidence_prompt').eq('is_active',true).order('indicator_no'),admin.from('pilot_requests').select('id,pilot_code,status,clinic_name').eq('tenant_id',tid).order('submitted_at',{ascending:false}).limit(1).maybeSingle()
   ]);
   const error=tenant.error||facility.error||requirements.error||definitions.error||pilot.error;if(error)return json(req,{error:error.message},400);
   if(!tenant.data)return json(req,{error:'clinic tenant not found'},404);
   if(pilot.data&&['SUSPENDED','CLOSED'].includes(pilot.data.status))return json(req,{error:'pilot access is not active'},409);
   return json(req,{ok:true,tenant:tenant.data,facility:facility.data?.[0]||null,requirements:requirements.data||[],definitions:definitions.data||[],pilot:pilot.data||null,preview_role:'platform_admin'});
  }
  if(p==='/admin/health'&&req.method==='GET'){
   const [ten,fac,reqs,pilots]=await Promise.all([admin.from('tenants').select('id',{count:'exact',head:true}),admin.from('facilities').select('id',{count:'exact',head:true}),admin.from('facility_requirements').select('id',{count:'exact',head:true}),admin.from('pilot_requests').select('id',{count:'exact',head:true})]);
   const ok=!ten.error&&!fac.error&&!reqs.error&&!pilots.error,now=new Date().toISOString();if(ok)await admin.from('system_health_state').update({last_admin_check_at:now,last_real_activity_at:now,updated_at:now}).eq('id',true);const hs=await admin.from('system_health_state').select('*').eq('id',true).single();return json(req,{ok,checked_at:now,db:{tenants:ten.count||0,facilities:fac.count||0,requirements:reqs.count||0,pilot_requests:pilots.count||0},health_state:hs.data||null,errors:[ten.error?.message,fac.error?.message,reqs.error?.message,pilots.error?.message].filter(Boolean)});
  }
  if(p==='/admin/list'&&req.method==='GET'){const q=await admin.from('pilot_requests').select('id,request_ref,status,clinic_name,city,district,owner_name,owner_email,phone,clinic_type,phc_status,services,staff_summary,operating_hours,google_account_available,submitted_at,pilot_code,tenant_id,facility_id,register_workbook_url,drive_folder_url,verification_result,verified_at,activated_at,pilot_start_date,pilot_end_date,updated_at').order('submitted_at',{ascending:false}).limit(100);if(q.error)return json(req,{error:q.error.message},400);return json(req,{ok:true,requests:q.data})}
  if(p==='/admin/provision'&&req.method==='POST'){
   const b=await req.json(),id=clean(b.id,80),rpc=await admin.rpc('provision_pilot',{p_request_id:id,p_actor_id:a.user.id});if(rpc.error)return json(req,{error:rpc.error.message},400);
   const pr=await admin.from('pilot_requests').select('owner_email,tenant_id,pilot_code').eq('id',id).single();if(pr.error)return json(req,{error:pr.error.message},400);
   let user=(await admin.auth.admin.listUsers({page:1,perPage:1000})).data.users.find((x:any)=>x.email?.toLowerCase()===pr.data.owner_email.toLowerCase());if(!user){const c=await admin.auth.admin.createUser({email:pr.data.owner_email,email_confirm:true,user_metadata:{pilot_code:pr.data.pilot_code}});if(c.error||!c.data.user)return json(req,{error:c.error?.message||'Could not create owner account'},400);user=c.data.user}
   const mm=await admin.from('memberships').upsert({tenant_id:pr.data.tenant_id,user_id:user.id,role:'owner'},{onConflict:'tenant_id,user_id'});if(mm.error)return json(req,{error:mm.error.message},400);
   const link=await magicLink(admin,pr.data.owner_email,pr.data.tenant_id,pr.data.pilot_code);if(link.error)return json(req,{error:link.error.message},400);const ver=await admin.rpc('verify_pilot',{p_request_id:id,p_actor_id:a.user.id});return json(req,{ok:true,provision:rpc.data,verification:ver.data,owner_access_link:link.data.properties?.action_link||null});
  }
  if(p==='/admin/verify'&&req.method==='POST'){const b=await req.json(),r=await admin.rpc('verify_pilot',{p_request_id:clean(b.id,80),p_actor_id:a.user.id});if(r.error)return json(req,{error:r.error.message},400);return json(req,{ok:true,verification:r.data})}
  if(p==='/admin/workspace'&&req.method==='POST'){const b=await req.json(),id=clean(b.id,80),register=clean(b.register_workbook_url,1000),drive=clean(b.drive_folder_url,1000),valid=(x:string)=>!x||/^https:\/\/(docs\.google\.com|drive\.google\.com)\//.test(x);if(!valid(register)||!valid(drive))return json(req,{error:'Only Google Drive/Docs/Sheets links are accepted'},400);const up=await admin.from('pilot_requests').update({register_workbook_url:register||null,drive_folder_url:drive||null,updated_at:new Date().toISOString()}).eq('id',id);if(up.error)return json(req,{error:up.error.message},400);return json(req,{ok:true})}
  if(p==='/admin/activate'&&req.method==='POST'){const b=await req.json(),r=await admin.rpc('activate_pilot',{p_request_id:clean(b.id,80),p_actor_id:a.user.id});if(r.error)return json(req,{error:r.error.message},400);return json(req,{ok:true,result:r.data})}
  if(p==='/admin/access-link'&&req.method==='POST'){const b=await req.json(),pr=await admin.from('pilot_requests').select('owner_email,pilot_code,status,tenant_id').eq('id',clean(b.id,80)).single();if(pr.error)return json(req,{error:pr.error.message},400);if(['SUSPENDED','CLOSED'].includes(pr.data.status))return json(req,{error:'Pilot access is suspended/closed'},409);const link=await magicLink(admin,pr.data.owner_email,pr.data.tenant_id,pr.data.pilot_code);if(link.error)return json(req,{error:link.error.message},400);return json(req,{ok:true,owner_access_link:link.data.properties?.action_link||null,pilot_code:pr.data.pilot_code})}
  if(p==='/admin/suspend'&&req.method==='POST'){const b=await req.json(),r=await admin.rpc('suspend_pilot',{p_request_id:clean(b.id,80),p_actor_id:a.user.id,p_reason:clean(b.reason,500)||null});if(r.error)return json(req,{error:r.error.message},400);return json(req,{ok:true,result:r.data})}
  if(p==='/admin/resume'&&req.method==='POST'){const b=await req.json(),r=await admin.rpc('resume_pilot',{p_request_id:clean(b.id,80),p_actor_id:a.user.id});if(r.error)return json(req,{error:r.error.message},400);return json(req,{ok:true,result:r.data})}
  if(p==='/admin/access-summary'&&req.method==='GET'){const id=clean(u.searchParams.get('id'),80),pr=await admin.from('pilot_requests').select('id,pilot_code,status,owner_email,tenant_id').eq('id',id).single();if(pr.error)return json(req,{error:pr.error.message},400);const ev=await admin.from('pilot_access_events').select('event_type,device_id,user_agent,client_timezone,client_language,ip_hash,created_at').eq('pilot_request_id',id).order('created_at',{ascending:false}).limit(100);if(ev.error)return json(req,{error:ev.error.message},400);const rows=ev.data||[],devices=[...new Set(rows.map((x:any)=>x.device_id).filter(Boolean))],ips=[...new Set(rows.map((x:any)=>x.ip_hash).filter(Boolean))],last=rows[0]?.created_at||null,recent24=rows.filter((x:any)=>Date.now()-new Date(x.created_at).getTime()<86400000).length,anomaly=devices.length>3||ips.length>4||recent24>50;return json(req,{ok:true,pilot_code:pr.data.pilot_code,status:pr.data.status,last_open_at:last,distinct_devices:devices.length,distinct_network_hashes:ips.length,opens_last_24h:recent24,anomaly_flag:anomaly,recent_events:rows.slice(0,20).map((x:any)=>({event_type:x.event_type,device_id:x.device_id,timezone:x.client_timezone,language:x.client_language,created_at:x.created_at,user_agent:x.user_agent}))})}
  return json(req,{error:'not found'},404);
 }catch(e){return json(req,{error:e instanceof Error?e.message:String(e)},500)}
});
