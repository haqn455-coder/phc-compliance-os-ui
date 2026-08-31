const SNAP_LEAD_STATUSES=['SNAPSHOT_CREATED','QUALIFIED','NOT_QUALIFIED','PILOT_WAITLIST','PILOT_OFFERED','PILOT_ACCEPTED','CLOSED'];
const SNAP_PILOT_STATUSES=['WAITLIST_UNTIL_PRODUCTION_PACK','NOT_OFFERED','DECLINED','STOPPED'];

async function snapshotAssets(){
  return Promise.all([
    fetch('./product/gp_readiness_snapshot_v0_1.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Snapshot config unavailable');return r.json()}),
    import('./product/gp_readiness_snapshot_eval.mjs'),
    import('./product/gp_snapshot_form_logic.mjs')
  ]);
}

function statusOptions(values,current){return values.map(v=>`<option value="${h(v)}" ${v===current?'selected':''}>${h(v)}</option>`).join('')}

async function snapshotOpsMode(){
  if(!['owner','manager'].includes(x.m.role))return note('Operator access required','n e');
  try{
    const rows=await rest('presales_snapshots?select=id,clinic_name,district_city,respondent_role,contact,created_at,triggered_rule_ids,lead_status,pilot_status&tenant_id=eq.'+x.m.tenant_id+'&order=created_at.desc&limit=50');
    document.querySelector('#app').innerHTML=`<div class=s><div class=c><div class=badge>INTERNAL OPERATOR ONLY</div><h2>Snapshot Operations</h2><p class=mut>Tenant-scoped presales records only. Snapshot answers are immutable; status changes are audited.</p><div class=toolbar><button id=opsback class="b b2" type=button>Back</button><button id=opsnew class=b type=button>New Snapshot</button></div></div><div id=opsnote class=n>${rows.length} record(s)</div>${rows.length?rows.map(r=>`<div class=c><h3>${h(r.clinic_name)}</h3><p>${h(r.district_city)} · ${h(r.respondent_role)} · ${h(r.contact)}</p><p class=mut>${h(new Date(r.created_at).toLocaleString())}<br>Preview rules: ${h((r.triggered_rule_ids||[]).join(', ')||'None')}</p><p><span class=st>${h(r.lead_status)}</span> <span class=st>${h(r.pilot_status)}</span></p><div class=toolbar><button class="b b2 reopen" data-id="${h(r.id)}" type=button>Reopen / Reprint</button><button class="b b2 status" data-id="${h(r.id)}" type=button>Update status</button></div></div>`).join(''):'<div class=c><p class=mut>No Snapshot records yet.</p></div>'}</div>`;
    A('#opsback').onclick=refresh;A('#opsnew').onclick=snapshotMode;
    document.querySelectorAll('.reopen').forEach(b=>b.onclick=()=>reopenSnapshot(b.dataset.id));
    document.querySelectorAll('.status').forEach(b=>b.onclick=()=>snapshotStatusMode(b.dataset.id));
  }catch(e){note(e.message,'n e')}
}

async function reopenSnapshot(id){
  if(!['owner','manager'].includes(x.m.role))return note('Operator access required','n e');
  try{
    const [cfg,evalMod,formMod]=await snapshotAssets();
    const rows=await rest('presales_snapshots?select=*&id=eq.'+encodeURIComponent(id)+'&tenant_id=eq.'+x.m.tenant_id+'&limit=1');
    if(!rows.length)throw Error('Snapshot not found or not accessible');
    const row=rows[0];
    const result=evalMod.evaluateSnapshot(cfg,row.answers||{});
    const actual=(result.flagged_actions||[]).map(z=>z.rule_id);
    const expected=row.triggered_rule_ids||[];
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Stored snapshot no longer matches frozen deterministic evaluation');
    renderSnapshotResult(cfg,row.answers||{},result,formMod,row);
    const back=A('#edit');if(back)back.onclick=snapshotOpsMode;
  }catch(e){alert(e.message)}
}

async function snapshotStatusMode(id){
  if(!['owner','manager'].includes(x.m.role))return note('Operator access required','n e');
  try{
    const rows=await rest('presales_snapshots?select=id,clinic_name,lead_status,pilot_status&id=eq.'+encodeURIComponent(id)+'&tenant_id=eq.'+x.m.tenant_id+'&limit=1');
    if(!rows.length)throw Error('Snapshot not found or not accessible');
    const row=rows[0];
    document.querySelector('#app').innerHTML=`<div class=s><div class=c><div class=badge>INTERNAL OPERATOR ONLY</div><h2>Update Snapshot status</h2><p><b>${h(row.clinic_name)}</b></p><div class=warn>Snapshot answers, preview rules, creator and clinic identity are immutable. This screen changes workflow status only.</div><label class=f>Lead status<select id=leadstatus>${statusOptions(SNAP_LEAD_STATUSES,row.lead_status)}</select></label><label class=f>Pilot status<select id=pilotstatus>${statusOptions(SNAP_PILOT_STATUSES,row.pilot_status)}</select></label><p class=mut>Paid/active pilot states remain unavailable until the production GP pack is released.</p><div class=toolbar><button id=statback class="b b2" type=button>Cancel</button><button id=statsave class=b type=button>Save status</button></div><div id=note class=n>Status changes are audited.</div></div></div>`;
    A('#statback').onclick=snapshotOpsMode;
    A('#statsave').onclick=async()=>{try{const patch={lead_status:A('#leadstatus').value,pilot_status:A('#pilotstatus').value};await rest('presales_snapshots?id=eq.'+encodeURIComponent(id)+'&tenant_id=eq.'+x.m.tenant_id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});note('Status updated; answers were not changed.','n ok');setTimeout(snapshotOpsMode,350)}catch(e){note(e.message,'n e')}};
  }catch(e){note(e.message,'n e')}
}
