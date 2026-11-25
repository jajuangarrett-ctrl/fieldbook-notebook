import {App, ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf} from "obsidian"
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
  const folder=this.plugin.folder
  const key="fieldbook:"+this.app.vault.getName()+":"+folder
  const sessionKey=key+":session"
  const local=this.contentEl.ownerDocument.defaultView
  this.ui=new NotebookUI(this.contentEl,new VaultStore(this.app,folder),{
   readSession:()=>{try{const a=JSON.parse(local?.localStorage.getItem(sessionKey)??"null");return a&&validID(a.id)&&Number.isFinite(a.offset)&&Number.isFinite(a.top)?a:null}catch{return null}},
   session:s=>{try{local?.localStorage.setItem(sessionKey,JSON.stringify(s))}catch{}},
   recover:(page,md)=>{
    try{local?.localStorage.setItem(key+":recovery:"+page,md);new Notice("Fieldbook kept a local recovery draft. Use the copy recovery command.");return true}catch{return false}
   },
   close:()=>this.leaf.detach(),
   notify:s=>new Notice(s)
  })
  const relevant=(file:{path:string},oldPath?:string)=>{if(file.path.startsWith(folder+"/")||oldPath?.startsWith(folder+"/"))this.ui?.recheck()}
  this.registerEvent(this.app.vault.on("modify",relevant))
  this.registerEvent(this.app.vault.on("create",relevant))
  this.registerEvent(this.app.vault.on("delete",relevant))
  this.registerEvent(this.app.vault.on("rename",relevant))
  await this.ui.init()
 }
 async onClose(){await this.ui?.destroy();this.ui=undefined}
}

export default class Fieldbook extends Plugin {
 folder=DEFAULT_FOLDER
 async onload(){
  const s=await this.loadData()
  if(typeof s?.folder==="string"&&validateFolder(s.folder))this.folder=s.folder
  this.registerView(VIEW,leaf=>new FieldbookView(leaf,this))
  this.addCommand({id:"open-fieldbook",name:"Open Fieldbook",callback:()=>void this.activate()})
  this.addRibbonIcon("book-open","Open Fieldbook",()=>{void this.activate()})
  this.addCommand({id:"copy-recovery-drafts",name:"Copy Fieldbook recovery drafts",callback:()=>void this.copyRecovery()})
  this.addSettingTab(new FieldbookSettings(this.app,this))
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
  await this.saveData({folder});this.folder=folder
 }
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
