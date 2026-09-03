const OPD_TABS = new Set(['Case Registry','Doctor Review','Medication Lines']);
const REGISTER_TABS = new Set([
  'Patient_Registration_Audit','DayCare_Observation','Emergency_Inventory',
  'Medicine_Temperature','Medicine_Expiry','Dispensing_Log','ADR_Log',
  'Lab_Sample_Log','Referral_Log','Complaint_Log','QA_QI_Incident',
  'Infection_Control','Waste_Disposal','Consent_Refusal','Staff_Training',
  'Admin_Incoming_Diary','Admin_Outgoing_Dispatch','Admin_Office_Order_Notice'
]);

function doGet() {
  return json_({ok:true, service:'PHC Compliance OS persistence adapter', version:'0.1', writes:'backend-only'});
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ok:false,error:'BUSY_NO_RETRY'});
  try {
    const payload = parse_(e);
    authorize_(payload);
    validateTenant_(payload);

    if (payload.action === 'health') return json_({ok:true, tenant:tenantId_(), version:'0.1'});
    if (!payload.request_id) throw new Error('request_id required for write actions');

    const prior = findSync_(payload.request_id);
    if (prior) {
      return json_({ok: prior.result === 'SUCCESS', duplicate:true, request_id:payload.request_id, prior_result:prior.result, message:'No automatic retry performed'});
    }

    const syncRow = beginSync_(payload);
    try {
      let result;
      switch (payload.action) {
        case 'append_opd': result = appendOpd_(payload); break;
        case 'append_register': result = appendRegister_(payload); break;
        case 'index_evidence': result = indexEvidence_(payload); break;
        case 'upload_evidence': result = uploadEvidence_(payload); break;
        default: throw new Error('Unsupported action');
      }
      finishSync_(syncRow, 'SUCCESS', '');
      return json_({ok:true, request_id:payload.request_id, result});
    } catch (err) {
      finishSync_(syncRow, 'FAILED', String(err && err.message || err));
      return json_({ok:false, request_id:payload.request_id, error:String(err && err.message || err), retry:'MANUAL_ONLY'});
    }
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  } finally {
    lock.releaseLock();
  }
}

function appendOpd_(p) {
  if (!OPD_TABS.has(p.tab)) throw new Error('OPD tab not allowed');
  const id = prop_('OPD_SHEET_ID');
  return appendByHeader_(id, p.tab, p.record || {});
}

function appendRegister_(p) {
  if (!REGISTER_TABS.has(p.tab)) throw new Error('Register tab not allowed');
  const id = prop_('COMPLIANCE_SHEET_ID');
  return appendByHeader_(id, p.tab, p.record || {});
}

function appendByHeader_(spreadsheetId, tab, record) {
  const sh = SpreadsheetApp.openById(spreadsheetId).getSheetByName(tab);
  if (!sh) throw new Error('Target tab not found');
  const lastCol = sh.getLastColumn();
  if (!lastCol) throw new Error('Target tab has no header');
  const headers = sh.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const row = headers.map(h => Object.prototype.hasOwnProperty.call(record,h) ? safeCell_(record[h]) : '');
  sh.appendRow(row);
  return {spreadsheet_id:spreadsheetId, tab, row:sh.getLastRow()};
}

function indexEvidence_(p) {
  const controlId = prop_('CONTROL_SHEET_ID');
  const sh = SpreadsheetApp.openById(controlId).getSheetByName('Evidence_Index');
  if (!sh) throw new Error('Evidence_Index missing');
  const m = p.evidence || {};
  const evidenceId = m.Evidence_ID || Utilities.getUuid();
  sh.appendRow([
    evidenceId, tenantId_(), m.Case_ID || '', m.Indicator || '', m.Register || '',
    m.Evidence_Type || '', m.File_Name || '', m.Drive_File_ID || '', m.Folder_ID || '',
    m.Created_At || new Date(), m.Created_By || p.actor || '', m.Redaction_Status || 'UNREVIEWED'
  ]);
  return {evidence_id:evidenceId,row:sh.getLastRow()};
}

function uploadEvidence_(p) {
  if (!p.file || !p.file.base64 || !p.file.name) throw new Error('file.name and file.base64 required');
  const bytes = Utilities.base64Decode(p.file.base64);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('File exceeds 8 MB pilot limit');

  const folderKey = String(p.folder || '').toUpperCase();
  const folderId = folderKey === 'OPD' ? prop_('OPD_ATTACHMENTS_FOLDER_ID') :
                   folderKey === 'COMPLIANCE' ? prop_('COMPLIANCE_EVIDENCE_FOLDER_ID') :
                   folderKey === 'EXPORT' ? prop_('EXPORTS_FOLDER_ID') : '';
  if (!folderId) throw new Error('Folder route not allowed');

  const mime = p.file.mime_type || 'application/octet-stream';
  const blob = Utilities.newBlob(bytes, mime, sanitizeName_(p.file.name));
  const file = DriveApp.getFolderById(folderId).createFile(blob);

  const ev = Object.assign({}, p.evidence || {}, {
    File_Name:file.getName(), Drive_File_ID:file.getId(), Folder_ID:folderId,
    Created_At:new Date(), Created_By:(p.evidence && p.evidence.Created_By) || p.actor || ''
  });
  const indexed = indexEvidence_({evidence:ev,actor:p.actor});
  return {file_id:file.getId(),evidence_id:indexed.evidence_id,folder_id:folderId};
}

function authorize_(p) {
  const expected = prop_('PERSISTENCE_API_KEY');
  if (!expected || !p.api_key || String(p.api_key) !== String(expected)) throw new Error('UNAUTHORIZED');
}

function validateTenant_(p) {
  if (String(p.tenant_id || '') !== tenantId_()) throw new Error('TENANT_MISMATCH');
}

function tenantId_() { return prop_('TENANT_ID'); }
function prop_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Missing Script Property: ' + name);
  return value;
}

function beginSync_(p) {
  const sh = syncSheet_();
  sh.appendRow([
    p.request_id, tenantId_(), p.source_module || '', p.source_record_id || '', p.action || '',
    p.tab || p.folder || '', 'STARTED', new Date(), p.actor || '', '', 0,
    'No automatic retries; duplicate request_id is blocked'
  ]);
  return sh.getLastRow();
}

function finishSync_(row, result, error) {
  const sh = syncSheet_();
  sh.getRange(row,7).setValue(result);
  sh.getRange(row,8).setValue(new Date());
  sh.getRange(row,10).setValue(error || '');
}

function findSync_(requestId) {
  const sh = syncSheet_();
  if (sh.getLastRow() < 2) return null;
  const found = sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(String(requestId)).matchEntireCell(true).findNext();
  if (!found) return null;
  return {row:found.getRow(),result:String(sh.getRange(found.getRow(),7).getDisplayValue() || '')};
}

function syncSheet_() {
  const sh = SpreadsheetApp.openById(prop_('CONTROL_SHEET_ID')).getSheetByName('Sync_Log');
  if (!sh) throw new Error('Sync_Log missing');
  return sh;
}

function safeCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function sanitizeName_(name) {
  return String(name).replace(/[\\/:*?"<>|]/g,'_').slice(0,180);
}

function parse_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('POST JSON required');
  return JSON.parse(e.postData.contents);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
