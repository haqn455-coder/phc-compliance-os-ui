import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const REG='https://docs.google.com/spreadsheets/d/1CQuHsM4U-C97JvLcnfBYwj0Pw65-Ca-B6XnIFHou_Nw/edit';
const OPD='https://docs.google.com/spreadsheets/d/1VbuJqmJbUEbHFDWER4sclGrT2NgVL67qE0qcKokcVrc/edit';

type RequirementRow = {
  id:string;
  requirement_definition_id:string;
  indicator_no:number;
  standard_code:string;
  indicator_text:string;
  evidence_prompt?:string|null;
  state:string;
  review_decision?:string|null;
  applicable?:boolean|null;
  applicability_reason?:string|null;
  support:any[];
  governed:any[];
};

const cx=(...xs:(string|false|undefined|null)[])=>xs.filter(Boolean).join(' ');
const stateTone=(state:string)=>{
  if(state==='READY')return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if(state==='REVIEW')return 'bg-amber-50 text-amber-700 border-amber-200';
  if(state==='NEEDS_ACTION')return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};
const nextAction=(r:RequirementRow)=>{
  if(r.state==='READY')return 'Keep evidence current. Recheck after a real change in staff, service, display, expiry, equipment or process.';
  if(r.state==='REVIEW')return 'Review the attached evidence. The owner/reviewer decides whether it is sufficient.';
  if(r.state==='NEEDS_ACTION')return 'Close one real gap, assign responsibility, then attach the proof and send it for review.';
  return 'Confirm applicability, then collect the minimum current evidence that proves the real situation.';
};
const ext=(f:File)=>f.type==='application/pdf'?'pdf':f.type==='image/png'?'png':'jpg';
async function sha256(file:File){
  const d=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default function P01Workspace({tenantId}:{tenantId:string}){
  const [rows,setRows]=useState<RequirementRow[]>([]);
  const [facility,setFacility]=useState('Zain Child Care Clinic, Fateh Pur, Layyah');
  const [role,setRole]=useState('');
  const [uid,setUid]=useState('');
  const [q,setQ]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [open,setOpen]=useState<Record<number,boolean>>({});
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  const toast=(m:string)=>{setMessage(m);window.setTimeout(()=>setMessage(''),2800)};

  const load=useCallback(async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Session expired.');
    setUid(session.user.id);
    const [m,t,f,fr,defs,support,governed]=await Promise.all([
      supabase.from('memberships').select('role').eq('tenant_id',tenantId).eq('user_id',session.user.id).maybeSingle(),
      supabase.from('tenants').select('name').eq('id',tenantId).maybeSingle(),
      supabase.from('facilities').select('id,name,phc_category').eq('tenant_id',tenantId).limit(1),
      supabase.from('facility_requirements').select('id,requirement_definition_id,state,review_decision,applicable,applicability_reason').eq('tenant_id',tenantId),
      supabase.from('requirement_definitions').select('id,indicator_no,standard_code,indicator_text,evidence_prompt').eq('is_active',true).order('indicator_no'),
      supabase.from('indicator_supporting_files').select('id,facility_requirement_id,source_kind,title,original_filename,external_url,mime_type,size_bytes,review_status,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}),
      supabase.from('evidence_items').select('id,facility_requirement_id,original_filename,evidence_type,review_decision,uploaded_at').eq('tenant_id',tenantId).order('uploaded_at',{ascending:false})
    ]);
    const error=m.error||t.error||f.error||fr.error||defs.error||support.error||governed.error;
    if(error)throw error;
    setRole(String(m.data?.role||''));
    if(f.data?.[0]?.name)setFacility(f.data[0].name);
    else if(t.data?.name)setFacility(t.data.name);
    const reqMap=new Map((fr.data||[]).map((x:any)=>[x.requirement_definition_id,x]));
    const supMap=new Map<string,any[]>();
    const govMap=new Map<string,any[]>();
    for(const x of support.data||[]){const a=supMap.get(x.facility_requirement_id)||[];a.push(x);supMap.set(x.facility_requirement_id,a)}
    for(const x of governed.data||[]){const a=govMap.get(x.facility_requirement_id)||[];a.push(x);govMap.set(x.facility_requirement_id,a)}
    setRows((defs.data||[]).map((d:any)=>{
      const r:any=reqMap.get(d.id)||{};
      return {...d,...r,state:r.state||'NOT_STARTED',review_decision:r.review_decision||'PENDING',applicable:r.applicable??true,support:supMap.get(r.id)||[],governed:govMap.get(r.id)||[]};
    }));
  },[tenantId]);

  useEffect(()=>{void load().catch((e:any)=>toast(e.message||'Could not load P01 workspace'))},[load]);

  const stats=useMemo(()=>{
    const ready=rows.filter(r=>r.state==='READY').length;
    const review=rows.filter(r=>r.state==='REVIEW').length;
    const action=rows.filter(r=>r.state==='NEEDS_ACTION').length;
    const na=rows.filter(r=>r.state==='NOT_APPLICABLE'||r.applicable===false).length;
    const evidence=rows.reduce((n,r)=>n+r.support.length+r.governed.length,0);
    return {ready,review,action,na,evidence,total:rows.length||47,pct:Math.round(ready/Math.max((rows.length||47)-na,1)*100)};
  },[rows]);

  const visible=useMemo(()=>rows.filter(r=>{
    const text=(r.indicator_no+' '+r.standard_code+' '+r.indicator_text).toLowerCase();
    const stateOk=filter==='ALL'||r.state===filter||(filter==='NOT_APPLICABLE'&&(r.state==='NOT_APPLICABLE'||r.applicable===false));
    return stateOk&&(!q||text.includes(q.toLowerCase()));
  }),[rows,q,filter]);

  async function upload(r:RequirementRow,file:File){
    if(file.size>10485760||!['application/pdf','image/jpeg','image/png'].includes(file.type)){toast('PDF/JPEG/PNG only, max 10 MB.');return}
    setBusy(r.id);
    try{
      const hash=await sha256(file),path=`${tenantId}/supporting/${r.id}/${hash}.${ext(file)}`;
      const up=await supabase.storage.from('phc-evidence').upload(path,file,{contentType:file.type,upsert:false});
      if(up.error)throw up.error;
      const ins=await supabase.from('indicator_supporting_files').insert({tenant_id:tenantId,facility_requirement_id:r.id,source_kind:'upload',title:file.name,storage_path:path,original_filename:file.name,mime_type:file.type,size_bytes:file.size,sha256:hash,uploaded_by:uid});
      if(ins.error){await supabase.storage.from('phc-evidence').remove([path]);throw ins.error}
      const u=await supabase.from('facility_requirements').update({state:'REVIEW',review_decision:'PENDING'}).eq('id',r.id);
      if(u.error)throw u.error;
      toast('Evidence uploaded and sent for human review.');
      await load();
    }catch(e:any){toast(e.message||'Upload failed')}finally{setBusy('')}
  }

  async function addLink(r:RequirementRow,url:string){
    if(!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)){toast('Use a Google Drive / Docs / Sheets link.');return}
    setBusy(r.id);
    try{
      const ins=await supabase.from('indicator_supporting_files').insert({tenant_id:tenantId,facility_requirement_id:r.id,source_kind:'drive_link',title:'Clinic Drive evidence',external_url:url,uploaded_by:uid});
      if(ins.error)throw ins.error;
      const u=await supabase.from('facility_requirements').update({state:'REVIEW',review_decision:'PENDING'}).eq('id',r.id);
      if(u.error)throw u.error;
      toast('Drive evidence linked and sent for review.');
      await load();
    }catch(e:any){toast(e.message||'Could not add link')}finally{setBusy('')}
  }

  async function setState(r:RequirementRow,state:string,decision='PENDING'){
    setBusy(r.id);
    try{
      const u=await supabase.from('facility_requirements').update({state,review_decision:decision}).eq('id',r.id);
      if(u.error)throw u.error;
      toast(decision==='APPROVED'?'Human review approved — READY.':decision==='REJECTED'?'Human review rejected — needs action.':'Indicator status updated.');
      await load();
    }catch(e:any){toast(e.message||'Update failed')}finally{setBusy('')}
  }

  return <section className="space-y-4">
    <div className="rounded-3xl border bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1"><div className="text-xs font-black uppercase tracking-wider text-phc-600">My Pilot · P01 founder workspace</div><h1 className="text-2xl font-black">{facility}</h1><div className="text-sm text-slate-500">Full 47-indicator owner workspace · real evidence only · human review controlled</div></div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">LIVE FOUNDER TENANT</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="text-2xl font-black">{stats.pct}%</div><div className="text-sm font-bold">Readiness</div><div className="text-xs text-slate-500">{stats.ready}/{stats.total} READY</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="text-2xl font-black">{stats.review}</div><div className="text-sm font-bold">Under review</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="text-2xl font-black">{stats.action}</div><div className="text-sm font-bold">Needs action</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="text-2xl font-black">{stats.evidence}</div><div className="text-sm font-bold">Evidence items</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="text-2xl font-black">19</div><div className="text-sm font-bold">Register tabs</div><div className="text-xs text-slate-500">18 operational + guidance</div></div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border bg-white p-5 shadow-soft"><h2 className="font-black">OPD / Google Sheets</h2><p className="text-sm text-slate-500">Clinic-owned persistence. Use current real records; do not create dummy entries for readiness.</p><div className="mt-3 flex flex-wrap gap-2"><a href={OPD} target="_blank" rel="noreferrer" className="rounded-xl bg-phc-800 px-3 py-2 text-sm font-bold text-white">Open OPD Master</a><a href={REG} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">Open 19 Registers</a><a href={REG+'#gid=2119'} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">Guidance</a></div></div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-900">Evidence boundary</h2><p className="text-sm text-amber-800">Uploading or linking evidence never auto-declares PHC compliance. READY remains a human-controlled review state. Indicator 20 remains a manual regulatory review item.</p></div>
    </div>

    <div className="rounded-2xl border bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-2 md:flex-row md:items-center"><div className="flex-1"><h2 className="text-xl font-black">47-Indicator Workspace</h2><div className="text-sm text-slate-500">Search, inspect, attach proof, and make an explicit human decision.</div></div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search indicator…" className="rounded-xl border px-3 py-2 text-sm"/><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="ALL">All</option><option value="NOT_STARTED">Not started</option><option value="REVIEW">Review</option><option value="NEEDS_ACTION">Needs action</option><option value="READY">Ready</option><option value="NOT_APPLICABLE">N/A</option></select></div>
      <div className="mt-4 space-y-3">{visible.map(r=>{
        const total=r.support.length+r.governed.length;
        const canReview=role==='owner'||role==='reviewer';
        return <article key={r.id} className="overflow-hidden rounded-2xl border">
          <button onClick={()=>setOpen(x=>({...x,[r.indicator_no]:!x[r.indicator_no]}))} className="flex w-full items-start gap-3 bg-white p-4 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-phc-50 font-black text-phc-700">{r.indicator_no}</span>
            <span className="flex-1"><span className="block text-xs font-bold text-slate-500">{r.standard_code}</span><span className="block font-bold">{r.indicator_text}</span><span className="mt-2 flex flex-wrap gap-1"><span className={cx('rounded-full border px-2 py-1 text-[11px] font-black',stateTone(r.state))}>{r.state.replaceAll('_',' ')}</span><span className="rounded-full border bg-slate-50 px-2 py-1 text-[11px] font-bold">Review: {r.review_decision||'PENDING'}</span><span className="rounded-full border bg-slate-50 px-2 py-1 text-[11px] font-bold">Evidence: {total}</span></span></span><span className="rounded-lg bg-slate-100 px-2 py-1 font-black">{open[r.indicator_no]?'⌃':'⌄'}</span>
          </button>
          {open[r.indicator_no]&&<div className="border-t bg-slate-50 p-4">
            <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl border bg-white p-3"><b>Suggested evidence</b><div className="mt-1 text-sm text-slate-600">{r.evidence_prompt||'Collect current evidence that directly demonstrates this requirement.'}</div></div><div className="rounded-xl border bg-white p-3"><b>What to do next</b><div className="mt-1 text-sm text-slate-600">{nextAction(r)}</div></div></div>
            <div className="mt-3 rounded-xl border bg-white p-3"><b>Add supporting evidence</b><div className="mt-1 text-xs text-slate-500">PDF/JPEG/PNG up to 10 MB, or a clinic-owned Google Drive/Docs/Sheets link. Avoid unnecessary patient identifiers.</div><div className="mt-3 grid gap-2 lg:grid-cols-2"><input disabled={busy===r.id} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(r,f);e.currentTarget.value=''}} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm"/><div className="flex gap-2"><input id={'link-'+r.id} placeholder="Google Drive / Docs / Sheets link" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"/><button disabled={busy===r.id} onClick={()=>{const el=document.getElementById('link-'+r.id) as HTMLInputElement|null;if(el)void addLink(r,el.value.trim())}} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">Add link</button></div></div>
            <div className="mt-3 space-y-2">{r.support.map((x:any)=><div key={x.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><span>{x.source_kind==='drive_link'?'🔗':'📎'}</span><span className="min-w-0 flex-1 truncate">{x.title||x.original_filename}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{x.review_status}</span>{x.external_url&&<a href={x.external_url} target="_blank" rel="noreferrer" className="font-bold text-phc-700">Open</a>}</div>)}{r.governed.map((x:any)=><div key={x.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><span>✅</span><span className="min-w-0 flex-1 truncate">{x.original_filename} · {x.evidence_type}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{x.review_decision}</span></div>)}</div></div>
            {canReview&&<div className="mt-3 flex flex-wrap gap-2 border-t pt-3"><button disabled={busy===r.id} onClick={()=>void setState(r,'NEEDS_ACTION')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Needs action</button><button disabled={busy===r.id} onClick={()=>void setState(r,'REVIEW')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Send to review</button><button disabled={busy===r.id} onClick={()=>void setState(r,'READY','APPROVED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Approve → READY</button><button disabled={busy===r.id} onClick={()=>void setState(r,'NEEDS_ACTION','REJECTED')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white">Reject → Needs action</button></div>}
          </div>}
        </article>
      })}</div>
    </div>
    {message&&<div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-2xl">{message}</div>}
  </section>;
}
