import {App, Component, FuzzySuggestModal, ItemView, MarkdownRenderer, Notice, Platform, Plugin, PluginSettingTab, Setting, WorkspaceLeaf} from "obsidian"
import {validateFolder,validID} from "./model"
import {VaultStore} from "./store"
import {NotebookUI} from "./ui"

const VIEW="fieldbook-notebook-view"
const DEFAULT_FOLDER="Fieldbook Notebook"

class FieldbookView extends ItemView {
 private ui?:NotebookUI
 constructor(leaf:WorkspaceLeaf,private plugin:Fieldbook){super(leaf)}
 getViewType(){return VIEW}
 getDisplayText(){return "Fieldbook Notebook"}
 getIcon(){return "book-open"}
 async onOpen(){
  this.contentEl.classList.add("fb-view")
  const relevant=(file:{path:string},oldPath?:string)=>{
   const dirs=[this.plugin.folder,this.plugin.sourceFolder].filter((s):s is string=>!!s)
   if(dirs.some(dir=>file.path===dir||file.path.startsWith(dir+"/")||oldPath===dir||oldPath?.startsWith(dir+"/")))this.ui?.recheck()
  }
  this.registerEvent(this.app.vault.on("modify",relevant))
  this.registerEvent(this.app.vault.on("create",relevant))
  this.registerEvent(this.app.vault.on("delete",relevant))
  this.registerEvent(this.app.vault.on("rename",relevant))
  await this.mount(false)
 }
 async chooseFolder(){
  new FolderPicker(this.app,this.plugin.folder,(path)=>void this.switch(path)).open()
 }
 private async switch(path:string|null){
  try{
   if(path===this.plugin.sourceFolder)return
   await this.ui?.prepareSwitch()
   await this.plugin.setSource(path)
   await this.ui?.destroy();this.ui=undefined
   await this.mount(!!path)
  }catch(e){new Notice("Fieldbook: "+(e instanceof Error?e.message:String(e)))}
 }
 private async mount(startOpen:boolean){
  const folder=this.plugin.folder
  const source=this.plugin.sourceFolder??undefined
  const key="fieldbook:"+this.app.vault.getName()+":"+folder
  const sessionKey=key+(source?":source:"+source:"")+":session"
  const local=this.contentEl.ownerDocument.defaultView
  this.ui=new NotebookUI(this.contentEl,new VaultStore(this.app,folder,source),{
   mobile:Platform.isMobile, choose:()=>void this.chooseFolder(),
   render:async(el,md,path)=>{const c=new Component();c.load();try{await MarkdownRenderer.render(this.app,md,el,path,c);return ()=>c.unload()}catch(e){c.unload();throw e}},
   readSession:()=>{try{const a=JSON.parse(local?.localStorage.getItem(sessionKey)??"null");return a&&validID(a.id)&&Number.isFinite(a.offset)&&Number.isFinite(a.top)?a:null}catch{return null}},
   session:s=>{try{local?.localStorage.setItem(sessionKey,JSON.stringify(s))}catch{}},
   recover:(page,md)=>{
    try{local?.localStorage.setItem(key+":recovery:"+page,md);new Notice("Fieldbook kept a local recovery draft. Use the copy recovery command.");return true}catch{return false}
   },
   close:()=>this.leaf.detach(),
   notify:s=>new Notice(s)
  })
  await this.ui.init(startOpen)
 }
 async onClose(){await this.ui?.destroy();this.ui=undefined}
}

export default class Fieldbook extends Plugin {
 folder=DEFAULT_FOLDER
 sourceFolder:string|null=null
 async onload(){
  const s=await this.loadData()
  if(typeof s?.folder==="string"&&validateFolder(s.folder))this.folder=s.folder
  if(typeof s?.sourceFolder==="string"&&validateFolder(s.sourceFolder))this.sourceFolder=s.sourceFolder
  this.registerView(VIEW,leaf=>new FieldbookView(leaf,this))
  this.addCommand({id:"open-fieldbook",name:"Open Fieldbook",callback:()=>void this.activate()})
  this.addCommand({id:"choose-folder",name:"Choose folder",callback:()=>void this.chooseFolder()})
  this.addRibbonIcon("book-open","Open Fieldbook",()=>{void this.activate()})
  this.addCommand({id:"copy-recovery-drafts",name:"Copy Fieldbook recovery drafts",callback:()=>void this.copyRecovery()})
  this.addSettingTab(new FieldbookSettings(this.app,this))
 }
 private async chooseFolder(){
  await this.activate()
  const v=this.app.workspace.getLeavesOfType(VIEW)[0]?.view
  if(v instanceof FieldbookView)await v.chooseFolder()
 }
 private async activate(){
  try{
   let leaf=this.app.workspace.getLeavesOfType(VIEW)[0]
   if(!leaf){leaf=this.app.workspace.getLeaf("tab");await leaf.setViewState({type:VIEW,active:true})}
   await this.app.workspace.revealLeaf(leaf)
  }catch(e){new Notice("Fieldbook: "+String(e))}
 }
 private async copyRecovery(){
  try{
   const prefix="fieldbook:"+this.app.vault.getName()+":"
   const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)&&k.includes(":recovery:")).sort()
   if(!keys.length){new Notice("No Fieldbook recovery drafts on this device.");return}
   const body=keys.map(k=>localStorage.getItem(k)).filter(Boolean).join("\n\n<!-- Next recovery draft -->\n\n")
   await navigator.clipboard.writeText(body)
   new Notice("Copied "+keys.length+" Fieldbook recovery draft(s).")
  }catch{new Notice("Couldn’t copy Fieldbook drafts. Clipboard access may be unavailable.")}
 }
 async setFolder(folder:string){
  if(!validateFolder(folder))throw Error("Use a vault-relative folder such as Notebooks/Fieldbook.")
  if(this.app.workspace.getLeavesOfType(VIEW).length)throw Error("Close the Fieldbook tab before changing the notebook folder.")
  await this.saveData({folder,sourceFolder:this.sourceFolder});this.folder=folder
 }
 async setSource(sourceFolder:string|null){
  if(sourceFolder&&!validateFolder(sourceFolder))throw Error("Invalid folder.");
  await this.saveData({folder:this.folder,sourceFolder});this.sourceFolder=sourceFolder
 }
}
class FolderPicker extends FuzzySuggestModal<{path:string|null}>{
 constructor(app:App,private managed:string,private pick:(path:string|null)=>void){super(app);this.setPlaceholder("Choose a vault folder to read as a notebook")}
 getItems(){return [{path:null},...this.app.vault.getAllFolders().map(f=>f.path).filter(p=>validateFolder(p)&&p!==this.managed&&!p.split("/").includes("Fieldbook Data")).sort((a,b)=>a.localeCompare(b)).map(path=>({path}))]}
 getItemText(p:{path:string|null}){return p.path??"Fieldbook notebook (create and edit pages)"}
 onChooseItem(p:{path:string|null}){this.pick(p.path)}
}
class FieldbookSettings extends PluginSettingTab {
 constructor(app:App,private plugin:Fieldbook){super(app,plugin)}
 display(){
  this.containerEl.empty()
  new Setting(this.containerEl).setName("Notebook folder").setDesc("Fieldbook keeps pages under Pages and metadata under Fieldbook Data in this vault-relative folder. Existing unrelated notes are untouched.")
   .addText(t=>{
    t.setValue(this.plugin.folder)
    t.inputEl.addEventListener("change",()=>void this.plugin.setFolder(t.getValue().trim()).catch((e:Error)=>{new Notice(e.message);t.setValue(this.plugin.folder)}))
   })
  new Setting(this.containerEl).setName("Open the notebook").setDesc("Use the ribbon book icon or the Fieldbook Notebook: Open Fieldbook command. No note is created until you ask for a new page.")
 }
}
