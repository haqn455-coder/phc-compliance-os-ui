export const LEAD_STATUSES=['SNAPSHOT_CREATED','QUALIFIED','NOT_QUALIFIED','PILOT_WAITLIST','PILOT_OFFERED','PILOT_ACCEPTED','CLOSED'];
export const PILOT_STATUSES=['WAITLIST_UNTIL_PRODUCTION_PACK','NOT_OFFERED','OFFERED','ACCEPTED','DECLINED','COMPLETED','STOPPED'];
export const PRE_RELEASE_LEAD_STATUSES=['SNAPSHOT_CREATED','QUALIFIED','NOT_QUALIFIED','PILOT_WAITLIST','CLOSED'];
export const PRE_RELEASE_PILOT_STATUSES=['WAITLIST_UNTIL_PRODUCTION_PACK','NOT_OFFERED','DECLINED','STOPPED'];

export function buildStatusPatch(nextLead,nextPilot,{productionPackReleased=false}={}){
  if(!LEAD_STATUSES.includes(nextLead))throw Error('unsupported lead status');
  if(!PILOT_STATUSES.includes(nextPilot))throw Error('unsupported pilot status');
  if(!productionPackReleased&&!PRE_RELEASE_LEAD_STATUSES.includes(nextLead))throw Error('pilot offer/activation lead state blocked until production pack release');
  if(!productionPackReleased&&!PRE_RELEASE_PILOT_STATUSES.includes(nextPilot))throw Error('pilot activation blocked until production pack release');
  return {lead_status:nextLead,pilot_status:nextPilot};
}

export function assertReopenMatch(storedRuleIds,evaluatedActions){
  const expected=storedRuleIds||[];
  const actual=(evaluatedActions||[]).map(x=>x.rule_id);
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('stored snapshot no longer matches frozen deterministic evaluation');
  return true;
}
