export const DEFAULT = {title:"Fieldbook", label:"FJG / VAULT", open:"resume", paper:"white", ruling:"lined", ink:"blue", type:"obsidian", size:null, swipe:false,single:false} as const
export type Appearance = {title:string; label:string; open:"resume"|"latest"|"contents"|"new"; paper:"white"|"cream"|"rose"|"sky"|"contrast"; ruling:"lined"|"grid"|"dotted"|"plain"; ink:"green"|"black"|"blue"|"umber"; type:"obsidian"|"serif"|"sans"|"script"; size:number|null; typographyRevision:1; swipe:boolean; single:boolean}
export type Page = {id:string; number:number; path:string; title:string; header:string; body:string; raw:string; mtime:number}
export type Bookmark = {id:string; offset:number; heading:string|null}
export type MarkKind = "highlight"|"underline"|"strike"|"circle"
export type Mark = {id:string; kind:MarkKind; from:number; to:number; quote:string; before:string; after:string; state:"placed"|"review"}
export const kinds:MarkKind[]=["highlight","underline","strike","circle"]
export const validID=(s:unknown):s is string=>typeof s==="string"&&/^[a-f0-9-]{24,40}$/.test(s)
export const cleanTitle=(s:string)=>s.replace(/[\r\n]+/g," ").trim().slice(0,120)||"Untitled page"
export function appearance(raw:unknown):Appearance {
 const a=(raw && typeof raw==="object"?raw:{}) as Record<string,unknown>
 const one=<T extends string>(k:string, vs:readonly T[], d:T):T=>vs.includes(a[k] as T)?a[k] as T:d
 // Move older notebooks to the Obsidian typeface. Preserve non-stock numeric sizes.
 const old=a.typographyRevision!==1
 const stockSize=old&&(a.size===26||(a.size===20&&a.sizeRevision!==1))
 const size=typeof a.size==="number"&&Number.isFinite(a.size)&&!stockSize
  ?Math.min(30,Math.max(16,a.size)):DEFAULT.size
 return {title:typeof a.title==="string"?cleanTitle(a.title):DEFAULT.title,label:typeof a.label==="string"?a.label.replace(/[\r\n]/g," ").slice(0,50):DEFAULT.label,
 open:one("open",["resume","latest","contents","new"],"resume"),paper:one("paper",["white","cream","rose","sky","contrast"],DEFAULT.paper),ruling:one("ruling",["lined","grid","dotted","plain"],"lined"),
 ink:one("ink",["green","black","blue","umber"],DEFAULT.ink),type:old?DEFAULT.type:one("type",["obsidian","serif","sans","script"],DEFAULT.type),
 size,typographyRevision:1, swipe:a.swipe===true,single:a.single===true}
}
export function parsePage(raw:string,path:string,mtime=0):Page|null {
 const m=/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/.exec(raw);if(!m)return null
 const id=/^fieldbook-page-id:\s*([a-f0-9-]+)[ \t]*\r?$/m.exec(m[1])?.[1]
 const n=Number(/^fieldbook-page-order:\s*(\d+)[ \t]*\r?$/m.exec(m[1])?.[1])
 if(!validID(id)||!Number.isSafeInteger(n)||n<1)return null
 const contents=m[2].replace(/^\r?\n/,"")
 const h=/^# ([^\r\n]+)(?:\r?\n|$)/.exec(contents)
 return {id,number:n,path,title:h?.[1]??path.split("/").pop()?.replace(/\.md$/,"")??"Untitled",header:m[1],body:h?contents.slice(h[0].length).replace(/^\r?\n/,""):contents,raw,mtime}
}
export const serialize=(p:Pick<Page,"header">,title:string,body:string)=>p.header+"\n# "+cleanTitle(title)+"\n\n"+body
export const newPage=(id:string,n:number,title:string)=>serialize({header:"---\nfieldbook-page-id: "+id+"\nfieldbook-page-order: "+n+"\n---\n"},title,"")
export const headings=(s:string)=>{const rows=s.split("\n");let at=0,fence="";return rows.flatMap(line=>{const offset=at;at+=line.length+1;const f=/^\s{0,3}(`{3,}|~{3,})/.exec(line);if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence="";return []}const m=!fence?/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line):null;return m?[{offset,title:m[2],level:m[1].length}]:[]})}
export function digest(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16)+":"+s.length}
export const clip=(p:number,s:string)=>Math.min(s.length,Math.max(0,Number.isFinite(p)?Math.floor(p):0))
export function capture(s:string,m:Pick<Mark,"id"|"kind">,from:number,to:number):Mark {
 from=clip(from,s);to=clip(to,s)
 return {...m,from,to,quote:s.slice(from,to),before:s.slice(Math.max(0,from-32),from),after:s.slice(to,to+32),state:"placed"}
}
export function relocate(s:string,m:Mark,same=false):Mark {
 if(!m.quote||m.state==="review")return {...m,state:"review"}
 if(same&&m.state==="placed"&&s.slice(m.from,m.to)===m.quote)return m
 const hits:number[]=[]
 for(let i=s.indexOf(m.quote);i>=0;i=s.indexOf(m.quote,i+1)){hits.push(i);if(hits.length>300)return {...m,state:"review"}}
 let match=hits.length===1?hits[0]:undefined
 if(hits.length>1){
  // Never guess on a tied match. Both nonempty adjacent contexts must support a repeated quote.
  const cand=hits.filter(i=>m.before.trim()&&m.after.trim()&&s.slice(Math.max(0,i-m.before.length),i)===m.before&&s.slice(i+m.quote.length,i+m.quote.length+m.after.length)===m.after)
  if(cand.length===1)match=cand[0]
 }
 return match===undefined?{...m,state:"review"}:capture(s,m,match,match+m.quote.length)
}
export function mapMark(s:string,m:Mark,map:(p:number,assoc:number)=>number,undo=false):Mark {
 if(m.state==="review"){
  if(undo&&m.quote&&s.slice(m.from,m.to)===m.quote&&s.slice(Math.max(0,m.from-m.before.length),m.from)===m.before&&s.slice(m.to,m.to+m.after.length)===m.after)return capture(s,m,m.from,m.to)
  return m
 }
 const from=map(m.from,1),to=map(m.to,-1)
 // Keep the saved quote on full deletion for a later undo / review.
 return from>=to||!s.slice(from,to).trim()?{...m,state:"review"}:capture(s,m,from,to)
}
export function numericPageName(p:Page){return String(p.number).padStart(2,"0")}
export function validateFolder(s:string){return !!s && !s.startsWith("/") && !s.includes("\\") && s.split("/").every(v=>!!v && !v.startsWith(".") && !/[\u0000-\u001f:#?*<>|"]/u.test(v) && v.trim()===v)}
function sidecarParts(raw:string){
 const m=/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(raw)
 const marker=m?.[1].split(/\r?\n/).filter(line=>/^fieldbook-sidecar[ \t]*:/.test(line))
 const body=m?/^\s*```fieldbook-json[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(raw.slice(m[0].length)):null
 if(!m||marker?.length!==1||!/^fieldbook-sidecar[ \t]*:[ \t]*1[ \t]*$/.test(marker[0])||!body)throw Error("Fieldbook metadata is not recognized. Existing file left alone.")
 const data:unknown=JSON.parse(body[1])
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid Fieldbook metadata. Existing file left alone.")
 return {header:m[0],data:data as Record<string,unknown>}
}
export function encodeSidecar(data:unknown,original:string|null=null){
 const header=original===null?"---\nfieldbook-sidecar: 1\n---\n":sidecarParts(original).header
 const eol=header.includes("\r\n")?"\r\n":"\n"
 return header+eol+"```fieldbook-json"+eol+JSON.stringify(data,null,2).replace(/\n/g,eol)+eol+"```"+eol
}
export function decodeSidecar(raw:string|null):Record<string,unknown>{return raw===null?{}:sidecarParts(raw).data}
export function loadMarks(raw:unknown):Mark[] {
 return Array.isArray(raw)?raw.filter((m):m is Mark=>m&&validID(m.id)&&kinds.includes(m.kind)&&Number.isSafeInteger(m.from)&&Number.isSafeInteger(m.to)&&m.from>=0&&m.to>=m.from&&typeof m.quote==="string"&&typeof m.before==="string"&&typeof m.after==="string"&&["placed","review"].includes(m.state)):[]
}
export function safeBookmarks(raw:unknown):Bookmark[]{
 return Array.isArray(raw)?raw.filter((b):b is Bookmark=>b&&validID(b.id)&&Number.isSafeInteger(b.offset)&&b.offset>=0&&(b.heading===null||typeof b.heading==="string")):[]
}
export function turnDirection(dx:number,dy:number,time:number):-1|0|1 {
 return Math.abs(dx)>Math.abs(dy)*1.7&&(Math.abs(dx)>=65||(Math.abs(dx)>=38&&Math.abs(dx)/Math.max(1,time)>=0.45))?(dx<0?1:-1):0
}

export function pageLayout(width:number,height:number,single:boolean):"wide"|"narrow"{
 return !single&&width>=710&&width/Math.max(1,height)>=1.09?"wide":"narrow"
}
export function mergePageWrite(actual:string,expected:string,next:string,path:string):string|null{
 if(actual===expected)return next
 const a=parsePage(actual,path), e=parsePage(expected,path), n=parsePage(next,path)
 if(!a||!e||!n||a.id!==e.id||n.id!==e.id||a.number!==e.number||n.number!==e.number)return null
 const norm=(s:string)=>s.replace(/\r\n/g,"\n")
 // A metadata-only change (e.g. properties or line endings) is not a competing text edit.
 if(a.title!==e.title||norm(a.body)!==norm(e.body))return null
 return serialize(a,n.title,n.body)
}
export function folderNoteID(path:string):string{
 return [0,1,2,3].map(i=>digest(String(i)+":"+path).split(":")[0].padStart(8,"0")).join("")
}
export function isFolderNote(path:string,folder:string):boolean{
 const rest=path.startsWith(folder+"/")?path.slice(folder.length+1):""
 return !!rest&&/\.md$/i.test(rest)&&!(/\.excalidraw\.md$/i.test(rest)||rest.split("/").some(s=>s.startsWith(".")||s==="Fieldbook Data"))
}
export function folderPage(raw:string,path:string,number:number,mtime=0):Page|null{
 if(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw)?.[0].split(/\r?\n/).some(l=>/^fieldbook-sidecar[ \t]*:/.test(l)))return null
 const body=raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,"").replace(/^\r?\n/,"")
 const filename=path.split("/").pop()?.replace(/\.md$/i,"")??"Untitled"
 return {id:folderNoteID(path),number,path,title:filename,header:"",body,raw,mtime}
}
export function bottomClearance(pane:{left:number;right:number;top:number;bottom:number}, docks:readonly {left:number;right:number;top:number;bottom:number}[]):number{
 const overlap=docks.map(d=>{
  const width=Math.min(pane.right,d.right)-Math.max(pane.left,d.left)
  const height=pane.bottom-pane.top
  if(width<=6||d.bottom<=pane.bottom-145||d.top>=pane.bottom||d.top<pane.top+height*.6)return 0
  return pane.bottom-d.top+8
 })
 return Math.round(Math.max(0,...overlap))
}
