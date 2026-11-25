import {EditorView} from "@codemirror/view"
import {NotebookUI} from "../src/ui"
import {newPage,serialize,parsePage,mergePageWrite,folderPage} from "../src/model"
import type {Page} from "../src/model"
import type {FileStore} from "../src/store"
let serial=0
const files=new Map<string,string>()
const rawPages=():Page[]=>[...files].flatMap(([p,v])=>{const parsed=parsePage(v,p,serial);return parsed?[parsed]:[]}).sort((a,b)=>a.number-b.number)
const left="fixture/Pages/"
let calls=0; let session:{id:string;offset:number;top:number}|null=null
const local=new Map<string,string>(), notices:string[]=[]
const store:FileStore={
 parse:(raw,p)=>parsePage(raw,p.path,p.mtime),
 async list(){return rawPages()},
 async read(k){return files.get(k)??null},
 async write(k,expected,next){const actual=files.get(k)??null;const out=actual===expected?next:(actual!==null&&expected!==null?mergePageWrite(actual,expected,next,k):null);if(out===null)throw Error("Another edit changed this file.");files.set(k,out);return out},
 async create(ps){
  const n=ps.length+1;serial++;calls++
  const path=left+n+".md", id=crypto.randomUUID(), raw=newPage(id,n,"Page "+n)
  await this.write(path,null,raw);return parsePage(raw,path,n)!
 },
 async open(){},
 meta:id=>"fixture/Data/"+(id??"notebook")
}
const holder=document.getElementById("app")!
let ui:NotebookUI
function start(){ui=new NotebookUI(holder,store,{mobile:true,readSession:()=>session,session:s=>{session=s},recover:(id,md)=>{local.set(id,md);return true},close:()=>void ui.destroy(),notify:s=>notices.push(s)});return ui.init()}
Object.assign(window,{fixture:{
 start, destroy:()=>ui.destroy(), count:()=>calls, pages:()=>rawPages(), notices:()=>notices,
 recover:()=>[...local.values()], recheck:()=>ui.recheck(),
 props:()=>{const p=rawPages()[0];files.set(p.path,p.raw.replace("fieldbook-page-order: 1","fieldbook-page-order: 1\nlocation: mobile-note"));ui.recheck()},
 change:(n:number,s:string)=>{const p=rawPages()[n-1];files.set(p.path,serialize(p,p.title,s));ui.recheck()},
 focusPage:(from:number,to:number)=>{
  const e=holder.querySelector<HTMLElement>(".cm-editor");if(!e)throw Error("Editor missing")
  const view=EditorView.findFromDOM(e);if(!view)throw Error("No view")
  view.focus();view.dispatch({selection:{anchor:from,head:to}})
 }
}})
void start()
