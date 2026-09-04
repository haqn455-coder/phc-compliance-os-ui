function runRealFounderPersistence() {
  const url = 'https://script.google.com/macros/s/AKfycbz0i2e6RfcHF5YWF5nmyVwlES_EBXA1lqxuRtIfIWaT7nNMzeK2lWZhE7csGaneOUr1/exec';
  const p = PropertiesService.getScriptProperties();
  const key = p.getProperty('PERSISTENCE_API_KEY');
  const tenant = p.getProperty('TENANT_ID');
  if (!key || !tenant) throw new Error('Missing private Script Property');

  const payload = {
    action:'append_register',
    tenant_id:tenant,
    api_key:key,
    request_id:'P01-REAL-PHC-INQUIRY-20260902',
    source_module:'PHC_REGULATORY_CORRESPONDENCE',
    source_record_id:'GMAIL-THREAD-1a05e96e10e97764',
    tab:'Admin_Outgoing_Dispatch',
    actor:'Dr Haq Nawaz Khosa',
    record:{
      Entry_No:'P01-PHC-OUT-20260902-001',
      Dispatch_Date_Time:'2026-09-02',
      Dispatch_No:'P01-PHC-OUT-20260902-001',
      To_Organization_Person:'Punjab Healthcare Commission (info@phc.org.pk)',
      Subject:'Written Clarification Requested — Zain Child Care Clinic (PHC Reg. R-26045): Licence, Clinic Scope, Day-Care/Night Stay & Lab Collection',
      Document_Date:'2026-09-02',
      Reference_No:'PHC Reg. R-26045 / Gmail thread 1a05e96e10e97764',
      Issued_By:'Dr Haq Nawaz Khosa',
      Delivery_Mode:'Email',
      Acknowledgement_Ref:'Gmail thread 1a05e96e10e97764',
      Attachment_Link:'',
      Status:'SENT_AWAITING_WRITTEN_RESPONSE',
      Follow_Up:'Nonblocking follow-up per defined cadence; continue clinic-controlled work in parallel.',
      Remarks:'Genuine founder-clinic regulatory correspondence. No patient data. Existing sent email recorded through persistence adapter.'
    }
  };

  const r = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });

  const out = r.getContentText();
  console.log(out);
  return out;
}
