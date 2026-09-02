export type ProfileKey = 'name'|'phone'|'email'|'currentCity'|'school'|'college'|'major'|'education'|'enrollmentDate'|'graduationDate'|'gender'|'birthDate'|'politicalStatus'|'ethnicity'|'github'|'homepage'|'portfolio'|'jobDirection'|'source'|'expectedCity'|'acceptTransfer'|'acceptOtherRole'|'expectedSalary'|'relativeEmployed'|'nonCompete';
export type FillPolicyKind = 'auto'|'confirm'|'forbidden';
export interface Profile { [key: string]: string|boolean|undefined }
export interface FieldMatch { elementId:string; key?:ProfileKey; label:string; confidence:number; policy:FillPolicyKind; reasons:string[]; kind:string; valuePreview?:string }
export interface SiteMapping { signature:string; key:ProfileKey }
export interface FillChange { element:HTMLElement; previous:string|boolean; key:ProfileKey }
export interface SiteAdapter { id:string; matches(url:URL):boolean; enhance(matches:FieldMatch[], root:Document):FieldMatch[] }
export interface FieldDetector { scan(root:Document):FieldMatch[] }
export interface FieldMapper { map(element:HTMLElement, context:string):FieldMatch }
export interface FillPolicy { policyFor(key?:ProfileKey, element?:HTMLElement):FillPolicyKind }
export interface JobExtractor { extract(root:Document):unknown }
export interface MatchScore { score:number; confidence:number; matchedRequirements:string[]; missingRequirements:string[]; riskFlags:string[]; explanation:string; provider:string }
export interface JobMatchScorer { score(job:unknown, profile:Profile):Promise<MatchScore> }
export interface SyncProvider { sync(data:unknown):Promise<void> }
export interface LocalServiceClient { request<T>(method:string, payload:unknown):Promise<T> }
