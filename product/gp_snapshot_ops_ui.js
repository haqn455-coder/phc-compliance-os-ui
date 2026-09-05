const SNAP_LEAD_STATUSES=['SNAPSHOT_CREATED','QUALIFIED','NOT_QUALIFIED','PILOT_WAITLIST','CLOSED'];
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

const DIGITAL_REGISTERS=[
  {group:'PATIENT & DAY-CARE',name:'Patient Registration / Audit',tab:'Patient_Registration_Audit',purpose:'Patient registration and record-audit trail',fields:['Date','Case_ID','Unique_ID_Present','Core_Particulars_Complete','Entry_By','Authorized_Entry_Verified','Doctor_Record_Reviewed','Gap','Corrective_Action','Closed_Date','Reviewer','Notes']},
  {group:'PATIENT & DAY-CARE',name:'Day-Care Observation',tab:'DayCare_Observation',purpose:'Same-day observation / day-care episode record',fields:['Case_ID','Start_DateTime','End_DateTime','Responsible_Clinician','Responsible_Onsite_Person','Observation_Reason','Monitoring_Record_Reference','Treatment_Record_Reference','Escalation_Trigger_Identified','Referral_Required','Referral_Record_ID','Outcome','Doctor_Signoff','Notes']},
  {group:'PATIENT & DAY-CARE',name:'Referral Log',tab:'Referral_Log',purpose:'Referral and transfer trail',fields:['Referral_ID','DateTime','Case_ID','Referred_By','Receiving_Facility','Reason_Category','Urgency','Referral_Note_Issued','Transport_Mode','Receiving_Facility_Contacted','Outcome_Known','Followup_Date','Reviewer','Notes']},
  {group:'PATIENT & DAY-CARE',name:'Consent / Refusal',tab:'Consent_Refusal',purpose:'Consent, refusal and related documentation',fields:['Record_ID','DateTime','Case_ID','Type_CONSENT_REFUSAL_LAMA','Procedure_or_Decision','Information_Provided','Patient_or_Guardian','Specific_Written_Consent_Required','Form_Reference','Witness_If_Applicable','Clinician','Outcome','Followup_or_Referral','Notes']},
  {group:'PATIENT & DAY-CARE',name:'Complaint Log',tab:'Complaint_Log',purpose:'Patient/family grievance record',fields:['Complaint_ID','Received_DateTime','Channel','Case_ID_If_Relevant','Complaint_Category','Complaint_Summary','Immediate_Safety_Issue','Assigned_To','Action_Taken','Response_Date','Closed','Closed_By','Patient_Contacted','Notes']},
  {group:'MEDICATION',name:'Medicine Temperature',tab:'Medicine_Temperature',purpose:'Storage temperature monitoring where applicable',fields:['Date','Time','Storage_Area','Temperature_C','Within_Required_Range','Checked_By','Exception','Corrective_Action','Reviewer','Notes']},
  {group:'MEDICATION',name:'Medicine Expiry',tab:'Medicine_Expiry',purpose:'Expiry / shelf-life checks where applicable',fields:['Check_Date','Medicine_As_Labelled','Batch_No','Expiry_Date','Near_Expiry','Expired','Quantity_Affected','Segregated','Action_Taken','Checked_By','Reviewer','Notes']},
  {group:'MEDICATION',name:'Dispensing Log',tab:'Dispensing_Log',purpose:'Dispensing record where the service is provided',fields:['DateTime','Case_ID','Prescription_Reference','Medicine_Name_Exactly_As_Prescribed','Quantity_Dispensed','Batch_Checked','Expiry_Checked','Label_Complete','Patient_Identity_Checked','Dispensed_By','Authorization_Verified','Counselling_Confirmed','Exception','Notes']},
  {group:'MEDICATION',name:'ADR Log',tab:'ADR_Log',purpose:'Adverse drug reaction reporting trail',fields:['ADR_ID','Date','Case_ID','Suspected_Medicine_Raw','Reaction_Summary','Clinician_Notified','Immediate_Action_Record_Reference','External_Report_Required_Human_Decision','DRAP_Report_Reference','Reported_By','Reviewed_By','Review_Date','Status','Notes']},
  {group:'SAFETY & QUALITY',name:'Emergency Inventory',tab:'Emergency_Inventory',purpose:'Presence/readiness evidence; clinical adequacy remains human-controlled',fields:['Item_ID','Emergency_Item','Present','Quantity','Functional_Check','Expiry_If_Applicable','Location','Checked_By','Check_Date','Gap','Action','Closed']},
  {group:'SAFETY & QUALITY',name:'QA / QI Incident',tab:'QA_QI_Incident',purpose:'Quality and incident-action trail',fields:['Record_ID','Date','Type_QA_QI_INCIDENT_SENTINEL','Area','Issue_or_Opportunity','Immediate_Action','Root_Cause_Review_Required','Corrective_Action','Owner','Due_Date','Closed_Date','Effectiveness_Checked','Reviewed_By','Notes']},
  {group:'SAFETY & QUALITY',name:'Infection Control',tab:'Infection_Control',purpose:'Infection-control activity/evidence record',fields:['Date','Area','Cleaning_Completed','Hand_Hygiene_Supplies_Available','Disinfectant_Available','PPE_Available_If_Required','Sharps_Disposal_Available_If_Required','Waste_Segregation_OK','Instrument_Processing_Applicable','Instrument_Process_Check','Checked_By','Gap','Action','Reviewed_By']},
  {group:'SAFETY & QUALITY',name:'Waste Disposal',tab:'Waste_Disposal',purpose:'Healthcare-waste handling record',fields:['Date','Waste_Category','Quantity_or_Bag_Count','Segregated_Correctly','Temporary_Storage_OK','Handover_To','Handover_DateTime','Receipt_or_Manifest_Reference','Recorded_By','Exception','Corrective_Action','Notes']},
  {group:'DIAGNOSTICS',name:'Lab Sample Log',tab:'Lab_Sample_Log',purpose:'Sample/referral trail where laboratory collection is applicable',fields:['Sample_ID','DateTime','Case_ID','Test_Requested_As_Written','Partner_Lab','MOU_Verified','Sample_Collected_By','Collection_Time','Handover_Time','Receiving_Person_Lab','Report_Received','Report_Reference','Exception','Notes']},
  {group:'STAFF',name:'Staff Training',tab:'Staff_Training',purpose:'Training / briefing evidence',fields:['Training_ID','Staff_Name','Role','Topic','Training_Date','Trainer','Method','Knowledge_Check','Competency_Status','Evidence_Reference','Next_Review','Notes']},
  {group:'ADMIN',name:'Incoming Diary',tab:'Admin_Incoming_Diary',purpose:'Incoming official correspondence',fields:['Entry_No','Received_Date_Time','Diary_No','From_Organization_Person','Subject','Document_Date','Reference_No','Received_By','Assigned_To','Due_Date','Status','Attachment_Link','Action_Taken','Remarks']},
  {group:'ADMIN',name:'Outgoing Dispatch',tab:'Admin_Outgoing_Dispatch',purpose:'Outgoing official correspondence',fields:['Entry_No','Dispatch_Date_Time','Dispatch_No','To_Organization_Person','Subject','Document_Date','Reference_No','Issued_By','Delivery_Mode','Acknowledgement_Ref','Attachment_Link','Status','Follow_Up','Remarks']},
  {group:'ADMIN',name:'Office Orders / Notices',tab:'Admin_Office_Order_Notice',purpose:'Controlled internal notices/orders',fields:['Entry_No','Order_Notice_No','Issue_Date','Document_Type','Subject','Issued_By','Approved_By','Effective_From','Effective_To','Audience','Status','Attachment_Link','Supersedes_Reference','Withdrawal_Closure_Date','Remarks']}
];

function registerCentreMode(){
  const grouped={};
  for(const r of DIGITAL_REGISTERS)(grouped[r.group]??=[]).push(r);
  document.querySelector('#app').innerHTML=`<div class=s><div class=c><div class=badge>DIGITAL REGISTER CENTRE</div><h2>18 operational digital registers</h2><p class=mut>Canonical register catalogue used by the clinic-specific persistence layer. The workbook has 19 tabs total: 18 operational registers + 1 README/control tab.</p><div class=warn><b>Security boundary:</b> this dashboard surfaces register structure only. Patient-identifiable register data and write credentials are not exposed in the public browser. Tenant-specific records remain in the clinic-owned persistence environment.</div><div class=toolbar><button id=regback class="b b2" type=button>Back to dashboard</button></div></div>${Object.entries(grouped).map(([group,rows])=>`<div class=c><h3>${h(group)}</h3>${rows.map(r=>`<div class="snap-action register-open" data-tab="${h(r.tab)}" role="button" tabindex="0" style="cursor:pointer"><div><b>${h(r.name)}</b> <span class=st>LIVE BACKEND</span></div><div class=mut>${h(r.tab)}</div><div>${h(r.purpose)}</div><div style="margin-top:7px"><button class="b b2 reg-open-btn" data-tab="${h(r.tab)}" type=button>Open register</button></div></div>`).join('')}</div>`).join('')}<div class=c><small class=mut>Service-specific extensions are added only from verified PHC applicability evidence; the system does not invent clinical or regulatory registers.</small></div></div>`;
  A('#regback').onclick=refresh;
  document.querySelectorAll('.register-open').forEach(el=>{el.onclick=e=>{if(e.target.closest('button'))return;registerWorkspaceMode(el.dataset.tab)};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();registerWorkspaceMode(el.dataset.tab)}}});
  document.querySelectorAll('.reg-open-btn').forEach(b=>b.onclick=()=>registerWorkspaceMode(b.dataset.tab));
}

function registerWorkspaceMode(tab){
  const r=DIGITAL_REGISTERS.find(z=>z.tab===tab);
  if(!r){return registerCentreMode()}
  document.querySelector('#app').innerHTML=`<div class=s><div class=c><div class=badge>REGISTER WORKSPACE</div><h2>${h(r.name)}</h2><p>${h(r.purpose)}</p><p class=mut>Canonical backend tab: <b>${h(r.tab)}</b></p><div class=toolbar><button id=rwback class="b b2" type=button>Back to registers</button></div></div><div class=c><h3>Canonical fields</h3><p class=mut>These fields are read directly from the live P01 compliance-register workbook schema.</p><div class=g style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">${r.fields.map((f,i)=>`<div class=snap-action><small class=mut>${i+1}</small><br><b>${h(f)}</b></div>`).join('')}</div></div><div class=c><div class=warn><b>Current product boundary:</b> the register itself exists and is live in the clinic-owned Google Sheets persistence layer, but browser read/write is not yet securely bridged into this dashboard. No entry is written from this screen. We will not expose the Apps Script persistence secret in public JavaScript.</div></div></div>`;
  A('#rwback').onclick=registerCentreMode;
}

function injectRegisterCentreButton(){
  const badge=[...document.querySelectorAll('.badge')].find(el=>el.textContent.trim()==='SESSION ACTIVE');
  if(!badge)return;
  const top=badge.closest('.c');
  if(!top||top.querySelector('[data-register-centre]'))return;
  let bar=top.querySelector('.toolbar');
  if(!bar){bar=document.createElement('div');bar.className='toolbar';top.appendChild(bar)}
  const btn=document.createElement('button');
  btn.type='button';btn.className='b b2';btn.dataset.registerCentre='1';btn.textContent='Digital Registers (18)';
  btn.onclick=registerCentreMode;bar.appendChild(btn);
}

const registerCentreObserver=new MutationObserver(()=>injectRegisterCentreButton());
registerCentreObserver.observe(document.documentElement,{subtree:true,childList:true});
queueMicrotask(injectRegisterCentreButton);
