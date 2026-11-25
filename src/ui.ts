import {Compartment,EditorState,Transaction,StateEffect,StateField} from "@codemirror/state"
import {Decoration,EditorView,keymap,drawSelection,placeholder,type ViewUpdate,type DecorationSet,WidgetType} from "@codemirror/view"
import {defaultKeymap,history,historyKeymap} from "@codemirror/commands"
import {markdown} from "@codemirror/lang-markdown"
import {appearance,capture,clip,decodeSidecar,digest,encodeSidecar,headings,kinds,loadMarks,mapMark,numericPageName,parsePage,relocate,safeBookmarks,serialize,cleanTitle,turnDirection,type Appearance,type Bookmark,type Mark,type MarkKind,type Page} from "./model"
import type {FileStore} from "./store"

const setDeco=StateEffect.define<DecorationSet>()
const liveDeco=StateField.define<DecorationSet>({create:()=>Decoration.none,update(value,tr){let d=value.map(tr.changes);for(const e of tr.effects)if(e.is(setDeco))d=e.value;return d},provide:f=>EditorView.decorations.from(f)})
class ListGlyph extends WidgetType {
 constructor(readonly glyph:string){super()}
 eq(other:ListGlyph){return other.glyph===this.glyph}
 toDOM(view:EditorView){const el=view.dom.ownerDocument.createElement("span");el.className="fb-read-glyph";el.textContent=this.glyph;return el}
}
type Mode="read"|"type"
type Panel="contents"|"bookmarks"|"appearance"|"marks"|null
type Session={id:string;offset:number;top:number}
const d=(parent:HTMLElement,tag:string,cls="",s="")=>{const e=parent.ownerDocument.createElement(tag);e.className=cls;if(s)e.textContent=s;parent.appendChild(e);return e}
const btn=(parent:HTMLElement,txt:string,fn:()=>unknown,label?:string,cls="")=>{
 const b=d(parent,"button",cls,txt) as HTMLButtonElement;b.type="button";if(label){b.setAttribute("aria-label",label);b.title=label}
 b.addEventListener("click",()=>{void fn()});return b
}
const input=(p:HTMLElement,label:string,value:string,type="text")=>{const e=d(p,"input","fb-input") as HTMLInputElement;e.type=type;e.value=value;e.setAttribute("aria-label",label);return e}

export class NotebookUI {
 readonly root:HTMLElement
 private doc:Document
 private cover:HTMLElement
 private book:HTMLElement
 private top:HTMLElement
 private spread:HTMLElement
 private left:HTMLElement
 private right:HTMLElement
 private body:HTMLElement
 private foot:HTMLElement
 private mini:HTMLElement
 private gutter:HTMLElement
 private status:HTMLElement
 private title!:HTMLInputElement
 private coverLabel!:HTMLElement
 private coverName!:HTMLElement
 private pageNo!:HTMLElement
 private prev!:HTMLButtonElement
 private next!:HTMLButtonElement
 private markButton!:HTMLButtonElement
 private typeButton!:HTMLButtonElement
 private bookmarkButton!:HTMLButtonElement
 private contentsButton!:HTMLButtonElement
 private appearanceButton!:HTMLButtonElement
 private bookmarksButton!:HTMLButtonElement
 private openButton!:HTMLButtonElement
 private editor?:EditorView
 private edit=new Compartment()
 private pages:Page[]=[]
 private current:Page|null=null
 private appearance=appearance(null)
 private metaRaw:string|null=null
 private markRaw:string|null=null
 private marks:Mark[]=[]
 private bookmarks:Bookmark[]=[]
 private panel:Panel=null
 private mode:Mode="read"
 private dirty=false
 private markDirty=false
 private timer:ReturnType<typeof setTimeout>|undefined
 private changeTimer:ReturnType<typeof setTimeout>|undefined
 private sessionTimer:ReturnType<typeof setTimeout>|undefined
 private queue:Promise<unknown>=Promise.resolve()
 private busy=false
 private destroyed=false
 private observer:ResizeObserver
 private win:Window
 private lastSession:Session|null=null
 private notebookRecord:Record<string,unknown>={}
 private positions=new Map<string,{offset:number;end:number;top:number}>()
 private turnStart:{id:number;x:number;y:number;t:number}|null=null
 private conflict=false
 private active=false
 private clock=0

 constructor(parent:HTMLElement,private store:FileStore,private cfg:{readSession:()=>Session|null; session:(s:Session)=>void; close:()=>void; notify:(s:string)=>void; recover?:(id:string,md:string)=>boolean}){
  this.doc=parent.ownerDocument;this.win=this.doc.defaultView!
  this.root=d(parent,"div","fb-root");this.root.dataset.layout="narrow";this.root.dataset.mode="read"
  this.cover=d(this.root,"div","fb-cover-screen")
  const back=btn(this.cover,"‹  Back",cfg.close,"Close Fieldbook","fb-cover-exit")
  back.style.alignSelf="flex-start"
  const leather=d(this.cover,"div","fb-leather")
  d(leather,"span","fb-cover-kicker","FIELD NOTES   /   OBSIDIAN")
  const name=d(leather,"div","fb-label");this.coverName=d(name,"strong","","Fieldbook");this.coverLabel=d(name,"span","","FJG / VAULT")
  const strap=d(leather,"span","fb-strap");strap.setAttribute("aria-hidden","true")
  const enter=btn(leather,"Open notebook   ›",()=>this.run(()=>this.openCover()),"Open notebook","fb-open-cover")
  let coverStart:number|null=null
  leather.addEventListener("pointerdown",e=>{coverStart=e.clientX})
  leather.addEventListener("pointerup",e=>{if(coverStart!==null&&coverStart-e.clientX>60&&e.target!==enter)void this.run(()=>this.openCover());coverStart=null})
  leather.addEventListener("pointercancel",()=>{coverStart=null})
  this.book=d(this.root,"div","fb-book");this.book.hidden=true
  this.top=d(this.book,"div","fb-top")
  btn(this.top,"‹",()=>this.run(()=>this.showCover()),"Back to cover")
  this.contentsButton=btn(this.top,"Contents",()=>this.togglePanel("contents"),"Contents")
  this.bookmarksButton=btn(this.top,"Saved",()=>this.togglePanel("bookmarks"),"Bookmarks")
  this.appearanceButton=btn(this.top,"Aa",()=>this.togglePanel("appearance"),"Appearance")
  this.openButton=btn(this.top,"↗",()=>this.run(async()=>{await this.flush();if(this.current)await this.store.open(this.current.path)}),"Open as a normal Obsidian note")
  this.spread=d(this.book,"div","fb-spread")
  this.left=d(this.spread,"aside","fb-facing")
  this.right=d(this.spread,"section","fb-page")
  const heading=d(this.right,"div","fb-page-head");this.pageNo=d(heading,"div","fb-folio","NO PAGE")
  this.bookmarkButton=btn(heading,"☆",()=>this.run(()=>this.toggleBookmark()),"Bookmark page","fb-star")
  this.title=input(this.right,"Page title","");this.title.classList.add("fb-title")
  this.title.addEventListener("input",()=>{if(this.current&&this.mode==="type"){this.dirty=true;this.conflict=false;this.saveSoon()}})
  this.title.addEventListener("blur",()=>{if(this.current&&this.mode==="type")this.title.value=cleanTitle(this.title.value)})
  this.body=d(this.right,"div","fb-body")
  this.mini=d(this.right,"div","fb-typebar");this.mini.hidden=true
  for(const [name,action] of [["Checklist",()=>this.prefix("- [ ] ")],["List",()=>this.prefix("- ")],["Heading",()=>this.prefix("## ")],["Done",()=>this.run(()=>this.setMode("read"))]] as const){
   const k=btn(this.mini,name,action);k.addEventListener("pointerdown",e=>e.preventDefault())
  }
  this.foot=d(this.book,"div","fb-foot")
  this.prev=btn(this.foot,"‹",()=>this.run(()=>this.turn(-1)),"Previous page")
  this.typeButton=btn(this.foot,"Type",()=>this.run(()=>this.setMode(this.mode==="type"?"read":"type")),"Type or finish editing")
  this.markButton=btn(this.foot,"Marks",()=>this.togglePanel("marks"),"Text marks")
  this.next=btn(this.foot,"›",()=>this.run(()=>this.turn(1)),"Next page")
  btn(this.foot,"＋",()=>this.run(()=>this.append()),"New page")
  this.gutter=d(this.right,"div","fb-gutter");this.gutter.setAttribute("aria-hidden","true")
  this.gutter.addEventListener("pointerdown",e=>{if(this.mode!=="read"||!this.appearance.swipe||e.pointerType==="mouse"||!e.isPrimary)return;this.turnStart={id:e.pointerId,x:e.clientX,y:e.clientY,t:e.timeStamp};this.gutter.setPointerCapture(e.pointerId)})
  this.gutter.addEventListener("pointerup",e=>{const a=this.turnStart;this.turnStart=null;if(!a||a.id!==e.pointerId)return;const direction=turnDirection(e.clientX-a.x,e.clientY-a.y,e.timeStamp-a.t);if(direction)void this.run(()=>this.turn(direction))})
  this.gutter.addEventListener("pointercancel",()=>{this.turnStart=null})
  this.status=d(this.root,"div","fb-status");this.status.setAttribute("role","status");this.status.hidden=true
  this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.root)
  this.win.visualViewport?.addEventListener("resize",this.keyboard)
  this.win.visualViewport?.addEventListener("scroll",this.keyboard)
  this.root.addEventListener("focusin",this.keyboard)
  this.root.addEventListener("focusout",this.keyboard)
 }
 async init(){
  this.active=true
  await this.run(async()=>{
   this.metaRaw=await this.store.read(this.store.meta())
   this.notebookRecord=decodeSidecar(this.metaRaw)
   this.appearance=appearance(this.notebookRecord.appearance)
   this.bookmarks=safeBookmarks(this.notebookRecord.bookmarks)
   this.lastSession=this.cfg.readSession()
   this.pages=await this.store.list();this.applyAppearance();this.layout();this.refresh()
  })
 }
 recheck(){
  if(!this.active||this.destroyed)return
  if(this.changeTimer)clearTimeout(this.changeTimer)
  this.changeTimer=setTimeout(()=>{void this.enqueue(async()=>{
   if(!this.active||this.destroyed)return
   try{
    const pgs=await this.store.list()
    this.pages=pgs.map(p=>this.current?.id===p.id?this.current:p)
    const changed=this.current&&pgs.find(p=>p.id===this.current!.id)
    if(this.current&&!changed){this.showStatus("This page moved outside Fieldbook or was removed. The open draft hasn’t been overwritten.");return}
    if(changed&&this.current){
     const markChanged=(await this.store.read(this.store.meta(changed.id)))!==this.markRaw
     if(changed.raw!==this.current.raw||changed.path!==this.current.path||markChanged){
      if(this.dirty||this.markDirty||this.mode==="type"){this.conflict=true;this.showStatus("A synced change arrived while editing. Your draft is still open. Copy it before loading the saved version.",true)}
      else await this.load(changed,this.editor?.state.selection.main.head)
     }
    }
    const latest=await this.store.read(this.store.meta())
    if(latest!==this.metaRaw&&this.panel!=="appearance"){
     const v=decodeSidecar(latest);this.metaRaw=latest;this.notebookRecord=v;this.appearance=appearance(v.appearance);this.bookmarks=safeBookmarks(v.bookmarks);this.applyAppearance()
    }
    if(this.panel!=="appearance")this.refresh()
   }catch(e){this.report(e)}
  })},230)
 }
 private layout(){
  const box=this.root.getBoundingClientRect()
  const wide=box.width>=710&&box.width/Math.max(1,box.height)>=1.09
  const previous=this.root.dataset.layout
  this.root.dataset.layout=wide?"wide":"narrow"
  if(previous!==this.root.dataset.layout&&this.panel===null)this.renderPanel()
  this.keyboard()
 }
 private keyboard=()=>{
  const v=this.win.visualViewport
  const focused=this.root.contains(this.doc.activeElement)
  const bottom=this.root.getBoundingClientRect().bottom
  const cover=v&&focused&&this.mode==="type"?Math.max(0,Math.min(340,bottom-v.height-v.offsetTop)):0
  this.root.style.setProperty("--fb-keyboard",cover+"px")
 }
 private enqueue<T>(task:()=>Promise<T>):Promise<T>{
  const p=this.queue.catch(()=>undefined).then(task);this.queue=p.catch(()=>undefined);return p
 }
 private async run(f:()=>Promise<void>){
  if(this.busy||this.destroyed)return
  this.busy=true
  try{await f()}catch(e){this.report(e)}finally{this.busy=false}
 }
 private showStatus(s:string,offerReload=false){
  this.status.replaceChildren();this.status.hidden=false;d(this.status,"span","",s)
  if(offerReload){
   btn(this.status,"Copy draft",()=>this.run(async()=>{
    if(!this.editor||!this.current)return
    await this.win.navigator.clipboard.writeText(serialize(this.current,this.title.value,this.editor.state.doc.toString()))
    this.cfg.notify("Fieldbook draft copied.")
   }))
   btn(this.status,"Reload saved",()=>this.run(async()=>{
    if(!this.win.confirm("Reload the saved version and discard this unsaved Fieldbook draft?"))return
    await this.enqueue(async()=>{
     if(!this.current)return
     if(this.timer){clearTimeout(this.timer);this.timer=undefined}
     const raw=await this.store.read(this.current.path)
     const p=raw===null?null:parsePage(raw,this.current.path,Date.now())
     if(!p)throw Error("The saved page could not be read.")
     this.dirty=false; this.markDirty=false;await this.load(p,this.editor?.state.selection.main.head);this.refresh()
    })
   }))
  }
  btn(this.status,"Hide",()=>{this.status.hidden=true})
 }
 private report(e:unknown){this.showStatus(e instanceof Error?e.message:String(e),this.conflict);this.cfg.notify("Fieldbook couldn’t complete that action.")}
 private hideStatus(){this.status.hidden=true;this.status.replaceChildren()}
 private async showCover(){await this.flush();this.record();this.book.hidden=true;this.cover.hidden=false;this.hideStatus()}
 private bookOn(){this.cover.hidden=true;this.book.hidden=false;this.layout()}
 private async openCover(){
  this.bookOn()
  const start=this.appearance.open
  if(start==="new"){await this.append();return}
  if(start==="contents"){this.panel="contents";this.refresh();return}
  const p=start==="latest"?[...this.pages].sort((a,b)=>b.mtime-a.mtime)[0]:this.pages.find(x=>x.id===this.lastSession?.id)??this.pages[0]
  if(p)await this.go(p,this.lastSession?.id===p.id?this.lastSession.offset:undefined,this.lastSession?.id===p.id?this.lastSession.top:undefined)
  else {this.panel="contents";this.refresh()}
 }
 private savePositionSoon=()=>{
  if(!this.active)return
  if(this.sessionTimer)clearTimeout(this.sessionTimer)
  this.sessionTimer=setTimeout(()=>{if(this.active)this.record()},300)
 }
 private record(){
  if(!this.current||!this.editor)return
  const s=this.editor.state.selection.main, top=this.editor.scrollDOM.scrollTop
  this.positions.set(this.current.id,{offset:s.anchor,end:s.head,top});this.lastSession={id:this.current.id,offset:s.head,top};this.cfg.session(this.lastSession)
 }
 private async append(){
  await this.flush()
  this.pages=await this.store.list()
  const page=await this.store.create(this.pages)
  this.pages.push(page)
  await this.go(page)
  await this.setMode("type",false)
  this.title.focus()
  this.title.select()
 }
 private async go(page:Page,offset?:number,top?:number,heading?:string|null){
  if(this.destroyed)return
  await this.flush();this.record()
  const fresh=await this.store.read(page.path)
  const read=fresh===null?null:parsePage(fresh,page.path,page.mtime)
  if(!read||read.id!==page.id)throw Error("The page moved. Reopen it from Contents.")
  if(heading){const h=headings(read.body).filter(r=>r.title===heading);if(h.length===1){offset=h[0].offset;top=undefined}}
  await this.load(read,offset,top)
  this.panel=null;this.bookOn();this.refresh()
 }
 private async load(p:Page,offset?:number,top?:number){
  const mPath=this.store.meta(p.id),mr=await this.store.read(mPath)
  const meta=decodeSidecar(mr),same=meta.basis===digest(p.body)
  const pos=this.positions.get(p.id)
  this.editor?.destroy();this.editor=undefined
  this.current=p;this.mode="read";this.dirty=false;this.markDirty=false;this.conflict=false
  this.pages=this.pages.map(a=>a.id===p.id?p:a)
  this.markRaw=mr
  this.marks=loadMarks(meta.marks).map(m=>relocate(p.body,m,same))
  const a=clip(offset??pos?.offset??0,p.body),h=clip(offset??pos?.end??0,p.body)
  this.title.value=p.title
  this.editor=new EditorView({parent:this.body,state:EditorState.create({doc:p.body,selection:{anchor:a,head:h},extensions:[
   markdown(),EditorView.lineWrapping,drawSelection(),history(),keymap.of([...defaultKeymap,...historyKeymap]),
   placeholder("Start writing…"),this.edit.of(this.editorMode()),liveDeco,
   EditorView.contentAttributes.of({"aria-label":"Notebook page body","spellcheck":"true"}),
   EditorView.updateListener.of(u=>this.onEdit(u))
  ]})})
  const el=this.editor
  this.updateDeco()
  el.scrollDOM.addEventListener("scroll",this.savePositionSoon,{passive:true})
  const scroll=top??(offset===undefined?pos?.top:undefined)
  if(scroll!==undefined)el.requestMeasure({read:()=>scroll,write:(y,v)=>{v.scrollDOM.scrollTop=y}})
  else if(offset!==undefined)el.dispatch({effects:EditorView.scrollIntoView(a,{y:"center"})})
  this.hideStatus()
 }
 private editorMode(){return [EditorState.readOnly.of(this.mode==="read"),EditorView.editable.of(this.mode==="type")]}
 private async setMode(m:Mode,focus=true){
  if(!this.editor)return
  if(m==="read"){this.title.blur();this.editor.contentDOM.blur();await this.flush()}
  this.mode=m
  this.editor.dispatch({effects:this.edit.reconfigure(this.editorMode())})
  this.updateDeco()
  this.applyMode()
  this.updateTurnControls()
  if(m==="type"&&focus)this.editor.focus()
 }
 private prefix(s:string){
  if(!this.editor||this.mode!=="type")return
  const l=this.editor.state.doc.lineAt(this.editor.state.selection.main.head)
  this.editor.dispatch({changes:{from:l.from,insert:s},annotations:Transaction.userEvent.of("input")})
  this.editor.focus()
 }
 private applyMode(){
  this.root.dataset.mode=this.mode
  this.mini.hidden=!this.current||this.mode!=="type"
  this.title.readOnly=this.mode!=="type"
  this.typeButton.textContent=this.mode==="type"?"Done":"Type"
  this.gutter.hidden=!this.appearance.swipe||this.mode!=="read"||!this.current
  this.keyboard()
 }
 private decorations(body:string){
  const rs=this.marks.flatMap(m=>m.state==="placed"&&m.from<m.to&&m.to<=body.length?[Decoration.mark({class:"fb-mark fb-mark-"+m.kind,inclusive:false}).range(m.from,m.to)]:[])
  if(this.mode==="read"){
   let at=0,fence=""
   for(const line of body.split("\n")){
    const f=/^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence="";at+=line.length+1;continue}
    if(!fence){
     const head=/^\s{0,3}(#{1,6})[ \t]+/.exec(line)
     const todo=/^\s*[-+*][ \t]+\[([ xX])\][ \t]+/.exec(line)
     const list=/^\s*[-+*][ \t]+/.exec(line)
     if(head){rs.push(Decoration.line({class:"fb-read-heading fb-read-h"+head[1].length}).range(at));rs.push(Decoration.replace({}).range(at,at+head[0].length))}
     else if(todo)rs.push(Decoration.replace({widget:new ListGlyph(todo[1].toLowerCase()==="x"?"☑ ":"☐ ")}).range(at,at+todo[0].length))
     else if(list)rs.push(Decoration.replace({widget:new ListGlyph("• ")}).range(at,at+list[0].length))
    }
    at+=line.length+1
   }
  }
  return Decoration.set(rs,true)
 }
 private updateDeco(){
  const ed=this.editor
  if(ed)ed.dispatch({effects:setDeco.of(this.decorations(ed.state.doc.toString()))})
 }
 private onEdit(v:ViewUpdate){
  if(!this.active)return
  if(v.selectionSet)this.savePositionSoon()
  if(!v.docChanged)return
  const b=v.state.doc.toString()
  this.marks=this.marks.map(m=>mapMark(b,m,(p,assoc)=>v.changes.mapPos(p,assoc),v.transactions.some(t=>t.isUserEvent("undo"))))
  this.dirty=true;this.markDirty=this.marks.length>0||this.markDirty
  this.saveSoon()
  queueMicrotask(()=>{if(this.editor===v.view&&this.active){this.updateDeco();if(this.panel==="marks")this.renderMarksStatus()}})
 }
 private saveSoon(){
  this.clock++
  if(this.timer)clearTimeout(this.timer)
  this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(e=>this.report(e))},350)
 }
 private flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=undefined}
  return this.enqueue(async()=>{
   const p=this.current, ed=this.editor
   if(!p||!ed||(!this.dirty&&!this.markDirty))return
   const tick=this.clock
   const b=ed.state.doc.toString(), t=cleanTitle(this.title.value)
   const raw=(b===p.body&&t===p.title)?p.raw:serialize(p,t,b)
   try{
    // Validate sidecar before saving; any later sidecar conflict is handled separately.
    if(this.markDirty&&(await this.store.read(this.store.meta(p.id)))!==this.markRaw)throw Error("Text marks changed on another device. Copy your draft before reloading.")
    if(this.dirty){
     await this.store.write(p.path,p.raw,raw)
     const saved=parsePage(raw,p.path,raw===p.raw?p.mtime:Date.now())!
     this.current=saved;this.pages=this.pages.map(x=>x.id===saved.id?saved:x)
     if(tick===this.clock)this.dirty=false
    }
    if(this.markDirty){
     const meta=decodeSidecar(this.markRaw)
     const marksRaw=encodeSidecar({...meta,basis:digest(b),marks:this.marks.map(m=>m.state==="placed"&&b.slice(m.from,m.to)!==m.quote?{...m,state:"review"}:m)})
     // Avoid saving ranges against a newer in-memory edit.
     if(tick===this.clock){
      await this.store.write(this.store.meta(p.id),this.markRaw,marksRaw)
      this.markRaw=marksRaw;if(tick===this.clock)this.markDirty=false
     }
    }
    this.conflict=false
   }catch(e){this.conflict=true;throw e}
  })
 }
 private async writeNotebook(patch:{appearance?:Appearance;bookmarks?:Bookmark[]}){
  return this.enqueue(async()=>{
   const next={...this.notebookRecord,...patch}
   const raw=encodeSidecar(next);await this.store.write(this.store.meta(),this.metaRaw,raw)
   this.metaRaw=raw;this.notebookRecord=next
   if(patch.appearance)this.appearance=patch.appearance
   if(patch.bookmarks)this.bookmarks=patch.bookmarks
  })
 }
 private async toggleBookmark(){
  const p=this.current, e=this.editor;if(!p||!e)return
  const offset=e.state.selection.main.head, hs=headings(e.state.doc.toString()).filter(h=>h.offset<=offset)
  const next=this.bookmarks.some(x=>x.id===p.id)?this.bookmarks.filter(x=>x.id!==p.id):[...this.bookmarks,{id:p.id,offset,heading:hs[hs.length-1]?.title??null}]
  await this.writeNotebook({bookmarks:next});this.refresh()
 }
 private async turn(dir:number){
  if(this.mode==="type")return
  const i=this.pages.findIndex(x=>x.id===this.current?.id)
  const p=this.pages[i+dir];if(!p)return
  await this.go(p)
  if(!this.win.matchMedia("(prefers-reduced-motion: reduce)").matches)this.right.animate([{opacity:0.55,transform:"translateX("+(dir*9)+"px)"},{opacity:1,transform:"none"}],{duration:190,easing:"ease-out"})
 }
 private togglePanel(p:Panel){this.panel=this.panel===p?null:p;this.refresh()}
 private applyAppearance(){
  const v=this.appearance
  Object.assign(this.root.dataset,{paper:v.paper,ruling:v.ruling,ink:v.ink,font:v.type,swipe:String(v.swipe)})
  this.root.style.setProperty("--fb-font-size",v.size+"px")
  this.coverName.textContent=v.title;this.coverLabel.textContent=v.label
  this.applyMode()
 }
 private updateTurnControls(){
  const i=this.pages.findIndex(x=>x.id===this.current?.id)
  this.prev.disabled=i<=0||this.mode==="type";this.next.disabled=i<0||i>=this.pages.length-1||this.mode==="type"
 }
 private refresh(){
  const p=this.current
  this.root.dataset.empty=String(!p)
  this.pageNo.textContent=p?"PAGE "+numericPageName(p)+"  /  "+this.pages.length:"YOUR NOTEBOOK"
  this.updateTurnControls()
  this.typeButton.disabled=this.markButton.disabled=this.bookmarkButton.disabled=this.openButton.disabled=!p
  this.bookmarkButton.textContent=p&&this.bookmarks.some(x=>x.id===p.id)?"★":"☆"
  this.bookmarkButton.setAttribute("aria-pressed",String(this.bookmarkButton.textContent==="★"))
  for(const [button,key] of [[this.contentsButton,"contents"],[this.bookmarksButton,"bookmarks"],[this.appearanceButton,"appearance"],[this.markButton,"marks"]] as const)button.setAttribute("aria-expanded",String(this.panel===key))
  this.applyMode()
  this.renderPanel()
 }
 private renderPanel(){
  this.left.replaceChildren()
  this.root.dataset.panel=String(!!this.panel)
  const panel=this.panel
  if(panel){
   const header=d(this.left,"div","fb-panel-head");d(header,"h2","",({contents:"Contents",bookmarks:"Bookmarks",appearance:"Appearance",marks:"Text marks"})[panel])
   btn(header,"×",()=>this.togglePanel(panel),"Close "+panel)
  }
  if(panel==="appearance"){this.renderAppearance();return}
  if(panel==="marks"){this.renderMarks();return}
  if(panel==="bookmarks"){
   if(!this.bookmarks.length)d(this.left,"p","fb-hint","Tap the star on a page to save your place.")
   for(const b of this.bookmarks){const p=this.pages.find(x=>x.id===b.id);if(p)btn(this.left,numericPageName(p)+"   "+p.title+(b.heading?" · "+b.heading:""),()=>this.run(()=>this.go(p,b.offset,undefined,b.heading)),undefined,"fb-index")}
   return
  }
  if(!panel&&this.current&&this.root.dataset.layout==="wide"){
   const i=this.pages.findIndex(p=>p.id===this.current!.id)
   const prev=this.pages[i-1]
   if(prev){
    d(this.left,"span","fb-folio","FACING PAGE  "+numericPageName(prev));d(this.left,"h2","fb-facing-title",prev.title)
    d(this.left,"p","fb-facing-text",prev.body.replace(/^#+ /gm,"").slice(0,3500)||"Blank page")
    btn(this.left,"Open page",()=>this.run(()=>this.go(prev)))
    return
   }
  }
  if(!panel)d(this.left,"h2","fb-facing-title","Contents")
  if(!this.pages.length)d(this.left,"p","fb-hint","A new notebook starts with one blank page.")
  for(const p of this.pages){
   const row=btn(this.left,numericPageName(p)+"   "+p.title,()=>this.run(()=>this.go(p)),undefined,"fb-index")
   if(p.id===this.current?.id)row.setAttribute("aria-current","page")
   if(panel==="contents")for(const h of headings(p.id===this.current?.id?this.editor?.state.doc.toString()??p.body:p.body).slice(0,30))btn(this.left,h.title,()=>this.run(()=>this.go(p,h.offset)),undefined,"fb-index fb-subheading")
  }
  btn(this.left,"＋ New page",()=>this.run(()=>this.append()),undefined,"fb-add-index")
 }
 private renderAppearance(){
  const saved={...this.appearance}
  const options=(label:string,items:readonly string[],current:string,change:(s:string)=>void)=>{
   const l=d(this.left,"label","fb-setting",label)
   const sel=d(l,"select","fb-input") as HTMLSelectElement;sel.setAttribute("aria-label",label)
   for(const item of items){const o=d(sel,"option","",item) as HTMLOptionElement;o.value=item}
   sel.value=current;sel.addEventListener("change",()=>change(sel.value))
  }
  const set=(k:keyof Appearance,v:unknown)=>{this.appearance=appearance({...this.appearance,[k]:v});this.applyAppearance()}
  for(const [label,key] of [["Notebook title","title"],["Cover label","label"]] as const){
   const l=d(this.left,"label","fb-setting",label), e=input(l,label,this.appearance[key]);e.addEventListener("input",()=>set(key,e.value))
  }
  options("When opening",["resume","latest","contents","new"],this.appearance.open,v=>set("open",v))
  options("Paper",["cream","rose","sky","contrast"],this.appearance.paper,v=>set("paper",v))
  options("Ruling",["lined","grid","dotted","plain"],this.appearance.ruling,v=>set("ruling",v))
  options("Ink",["green","black","blue","umber"],this.appearance.ink,v=>set("ink",v))
  options("Typeface",["serif","sans","script"],this.appearance.type,v=>set("type",v))
  const sz=input(d(this.left,"label","fb-setting","Text size"),"Text size",String(this.appearance.size),"range");sz.min="16";sz.max="30";sz.addEventListener("input",()=>set("size",Number(sz.value)))
  const swipe=input(d(this.left,"label","fb-setting fb-check","Edge swipe (preview)"),"Enable edge swipe","on","checkbox");swipe.checked=this.appearance.swipe;swipe.addEventListener("change",()=>set("swipe",swipe.checked))
  const actions=d(this.left,"div","fb-settings-actions")
  btn(actions,"Cancel",()=>{this.appearance=saved;this.panel=null;this.applyAppearance();this.refresh()})
  btn(actions,"Reset",()=>{this.appearance=appearance(null);this.applyAppearance();this.renderPanel()})
  btn(actions,"Save",()=>this.run(async()=>{await this.writeNotebook({appearance:this.appearance});this.panel=null;this.refresh()}),undefined,"fb-primary")
 }
 private renderMarks(){
  d(this.left,"p","fb-hint","Select text on the page, then choose a mark. Marks follow the words when the page reflows.")
  const tools=d(this.left,"div","fb-marks-tools")
  for(const k of kinds){
   const b=btn(tools,k[0].toUpperCase()+k.slice(1),()=>this.run(()=>this.mark(k)))
   b.addEventListener("pointerdown",e=>e.preventDefault())
  }
  btn(tools,"Remove selected marks",()=>this.run(()=>this.removeMarks()))
  d(this.left,"div","fb-marks-status");this.renderMarksStatus()
 }
 private renderMarksStatus(){
  const el=this.left.querySelector<HTMLElement>(".fb-marks-status");if(!el)return
  el.replaceChildren()
  const unplaced=this.marks.filter(m=>m.state==="review")
  d(el,"p","fb-hint",unplaced.length?unplaced.length+" mark(s) need review. Select the intended text, then choose Reattach.":"No marks need review.")
  for(const m of unplaced){
   d(el,"p","fb-quote",m.quote.slice(0,110))
   btn(el,"Reattach",()=>this.run(async()=>{
    const e=this.editor;const s=e?.state.selection.main;if(!e||!s||s.empty){this.cfg.notify("Select the intended text first.");return}
    this.marks=this.marks.map(x=>x.id===m.id?capture(e.state.doc.toString(),x,s.from,s.to):x)
    this.updateDeco();this.markDirty=true;this.clock++;this.renderMarksStatus();await this.flush()
   }))
   btn(el,"Discard",()=>this.run(async()=>{this.marks=this.marks.filter(x=>x.id!==m.id);this.markDirty=true;this.clock++;this.updateDeco();this.renderMarksStatus();await this.flush()}))
  }
 }
 private async mark(k:MarkKind){
  const e=this.editor,s=e?.state.selection.main
  if(!e||!s||s.empty||!e.state.doc.sliceString(s.from,s.to).trim()){this.cfg.notify("Select a word or phrase first.");return}
  this.marks.push(capture(e.state.doc.toString(),{id:globalThis.crypto.randomUUID(),kind:k},s.from,s.to))
  this.updateDeco();this.markDirty=true;this.clock++;this.renderMarksStatus();await this.flush()
 }
 private async removeMarks(){
  const e=this.editor,s=e?.state.selection.main;if(!s)return
  this.marks=this.marks.filter(m=>m.state!=="placed"||!(s.empty?(m.from<=s.from&&m.to>=s.from):(m.from<s.to&&m.to>s.from)))
  this.updateDeco();this.markDirty=true;this.clock++;await this.flush()
 }
 async destroy(){
  if(this.destroyed)return
  this.active=false
  this.record()
  try{await this.flush()}catch(e){
   if(this.current&&this.editor&&!this.cfg.recover?.(this.current.id,serialize(this.current,this.title.value,this.editor.state.doc.toString())))this.cfg.notify("Fieldbook closed before a conflicted draft could be saved.")
  }
  this.destroyed=true;this.observer.disconnect();this.editor?.destroy()
  if(this.timer)clearTimeout(this.timer)
  if(this.changeTimer)clearTimeout(this.changeTimer)
  if(this.sessionTimer)clearTimeout(this.sessionTimer)
  this.win.visualViewport?.removeEventListener("resize",this.keyboard)
  this.win.visualViewport?.removeEventListener("scroll",this.keyboard)
  this.root.remove()
 }
}
