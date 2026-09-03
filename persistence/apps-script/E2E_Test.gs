function runPersistenceE2E_() {
  const url = 'https://script.google.com/macros/s/AKfycbz0i2e6RfcHF5YWF5nmyVwlES_EBXA1lqxuRtIfIWaT7nNMzeK2lWZhE7csGaneOUr1/exec';
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('PERSISTENCE_API_KEY');
  const tenantId = props.getProperty('TENANT_ID');

  if (!apiKey) throw new Error('Missing PERSISTENCE_API_KEY');
  if (!tenantId) throw new Error('Missing TENANT_ID');

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Karachi', 'yyyyMMdd-HHmmss');
  const base = 'TEST-P01-PERSIST-' + stamp;

  const health = postPersistenceTest_(url, {
    action:'health',
    tenant_id:tenantId,
    api_key:apiKey
  });

  const registerRequestId = base + '-REG';
  const registerPayload = {
    action:'append_register',
    tenant_id:tenantId,
    api_key:apiKey,
    request_id:registerRequestId,
    source_module:'P01_PERSISTENCE_E2E',
    source_record_id:base,
    tab:'Admin_Incoming_Diary',
    actor:'FOUNDER_E2E_TEST',
    record:{
      Entry_No:base,
      Received_Date_Time:new Date().toISOString(),
      Diary_No:base,
      From_Organization_Person:'TEST ONLY — NON-PATIENT',
      Subject:'Persistence E2E synthetic test — safe to delete after verification',
      Document_Date:new Date().toISOString().slice(0,10),
      Reference_No:base,
      Received_By:'FOUNDER_E2E_TEST',
      Assigned_To:'',
      Due_Date:'',
      Status:'TEST_ONLY',
      Attachment_Link:'',
      Action_Taken:'Verify exactly one row; duplicate request must be blocked',
      Remarks:'Synthetic non-patient E2E fixture. No clinical or regulatory meaning.'
    }
  };

  const firstWrite = postPersistenceTest_(url, registerPayload);
  const duplicateWrite = postPersistenceTest_(url, registerPayload);

  const fileRequestId = base + '-FILE';
  const fileText = 'PHC Compliance OS P01 persistence E2E test. NON-PHI. ' + base;
  const fileUpload = postPersistenceTest_(url, {
    action:'upload_evidence',
    tenant_id:tenantId,
    api_key:apiKey,
    request_id:fileRequestId,
    source_module:'P01_PERSISTENCE_E2E',
    source_record_id:base,
    folder:'COMPLIANCE',
    actor:'FOUNDER_E2E_TEST',
    file:{
      name:base + '.txt',
      mime_type:'text/plain',
      base64:Utilities.base64Encode(fileText)
    },
    evidence:{
      Case_ID:'',
      Indicator:'',
      Register:'Persistence_E2E',
      Evidence_Type:'TEST_ONLY_NON_PHI',
      Created_By:'FOUNDER_E2E_TEST',
      Redaction_Status:'NOT_REQUIRED_NON_PHI'
    }
  });

  const invalidAction = postPersistenceTest_(url, {
    action:'INVALID_TEST_ACTION',
    tenant_id:tenantId,
    api_key:apiKey,
    request_id:base + '-INVALID',
    source_module:'P01_PERSISTENCE_E2E',
    source_record_id:base,
    actor:'FOUNDER_E2E_TEST'
  });

  const summary = {
    base,
    health,
    firstWrite,
    duplicateWrite,
    fileUpload,
    invalidAction
  };

  console.log(JSON.stringify(summary));
  return summary;
}

function postPersistenceTest_(url, payload) {
  const response = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify(payload),
    muteHttpExceptions:true,
    followRedirects:true
  });

  const text = response.getContentText();
  let body;
  try { body = JSON.parse(text); }
  catch (_) { body = {raw:text}; }

  return {
    http_status:response.getResponseCode(),
    body
  };
}
