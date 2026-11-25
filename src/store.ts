import {App,TFile,TFolder,normalizePath} from "obsidian"
import {Page,newPage,parsePage,validateFolder,validID,folderPage,isFolderNote,mergePageWrite} from "./model"
export interface FileStore {
 readonly sourceFolder?:string
 list():Promise<Page[]>
 parse(raw:string,page:Page):Page|null
 read(path:string):Promise<string|null>
 write(path:string,expected:string|null,next:string):Promise<string>
 create(pages:Page[]):Promise<Page>
 open(path:string):Promise<void>
 meta(id?:string):string
}
export class VaultStore implements FileStore {
 private dir:string
 constructor(private app:App,dir:string,readonly sourceFolder?:string){if(!validateFolder(dir)||sourceFolder&&!validateFolder(sourceFolder))throw Error("Choose a valid vault-relative notebook folder.");this.dir=normalizePath(dir)}
 parse(raw:string,p:Page){return this.sourceFolder?folderPage(raw,p.path,p.number,p.mtime):parsePage(raw,p.path,p.mtime)}
 private pageBase(){return this.dir+"/Pages"}
 meta(id?:string){if(id&&!validID(id))throw Error("Invalid page ID.");return this.dir+"/Fieldbook Data/"+(id??"Notebook")+".md"}
 private owns(path:string){return path.startsWith(this.dir+"/")&&!path.split("/").includes("..")}
 async list(){
  if(this.sourceFolder){
   const folder=this.sourceFolder
   if(!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder))throw Error("The chosen folder is not available. Choose another folder.")
   const candidates=this.app.vault.getMarkdownFiles().filter(f=>isFolderNote(f.path,folder)).sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true,sensitivity:"base"}))
   const rows:Page[]=[]
   for(let i=0;i<candidates.length;i+=12){
    const batch=await Promise.all(candidates.slice(i,i+12).map(async(f,j)=>folderPage(await this.app.vault.cachedRead(f),f.path,i+j+1,f.stat.mtime)))
    for(const row of batch)if(row){row.number=rows.length+1;rows.push(row)}
   }
   return rows
  }
  const files=this.app.vault.getMarkdownFiles().filter(f=>f.parent?.path===this.pageBase())
  const pages:Page[]=[]
  // Bounded groups keep cold starts and mobile I/O predictable.
  for(let i=0;i<files.length;i+=12)for(const p of await Promise.all(files.slice(i,i+12).map(async f=>parsePage(await this.app.vault.read(f),f.path,f.stat.mtime))))if(p)pages.push(p)
  const counts=new Map<string,number>()
  for(const p of pages)counts.set(p.id,(counts.get(p.id)??0)+1)
  if([...counts.values()].some(n=>n>1))throw Error("Two pages share a Fieldbook ID. Rename or remove the accidental duplicate before editing.")
  return pages.sort((a,b)=>a.number-b.number||a.id.localeCompare(b.id))
 }
 async read(path:string){
  if(!this.owns(path)&&!(this.sourceFolder&&isFolderNote(path,this.sourceFolder)))throw Error("Path is outside the notebook.")
  const f=this.app.vault.getAbstractFileByPath(path)
  if(!f)return null
  if(!(f instanceof TFile))throw Error("Expected a file: "+path)
  return this.app.vault.read(f)
 }
 private async folder(path:string){
  const pieces=path.split("/")
  for(let i=1;i<=pieces.length;i++){
   const p=pieces.slice(0,i).join("/")
   const known=this.app.vault.getAbstractFileByPath(p)
   if(known){if(!(known instanceof TFolder))throw Error("A file occupies "+p);continue}
   try{await this.app.vault.createFolder(p)}catch(e){if(!(this.app.vault.getAbstractFileByPath(p) instanceof TFolder))throw e}
  }
 }
 async write(path:string,expected:string|null,next:string){
  const isPage=path.startsWith(this.pageBase()+"/")&&!path.slice(this.pageBase().length+1).includes("/")
  const isMeta=path===this.meta()||path.startsWith(this.dir+"/Fieldbook Data/")&&/^[-a-f0-9]{24,40}\.md$/.test(path.slice((this.dir+"/Fieldbook Data/").length))
  if(!this.owns(path)||(!isMeta&&(!isPage||this.sourceFolder)))throw Error("Fieldbook leaves source notes as they are. Open the original to edit it.")
  if(expected===next)return next
  if(expected===null){
   await this.folder(path.slice(0,path.lastIndexOf("/")))
   await this.app.vault.create(path,next).catch(function(e){throw new Error("Couldn’t create the file. It may already exist. "+String(e))})
   return next
  }
  const f=this.app.vault.getAbstractFileByPath(path)
  if(!(f instanceof TFile))throw Error("File moved or disappeared. Your draft is still open.")
  return this.app.vault.process(f,(actual)=>{
   if(actual===expected)return next
   const merged=isPage?mergePageWrite(actual,expected,next,path):null
   if(merged!==null)return merged
   throw Error("Another edit changed this file. Your draft is still open; copy it before loading the synced version.")
  })
 }
 async create(pages:Page[]){
  if(this.sourceFolder)throw Error("Folder view is read-only.")
  const id=globalThis.crypto.randomUUID(),n=Math.max(0,...pages.map(p=>p.number))+1
  const path=this.pageBase()+"/Page "+String(n).padStart(3,"0")+" "+id.slice(0,8)+".md"
  const raw=newPage(id,n,"Page "+n)
  await this.write(path,null,raw)
  return parsePage(raw,path,Date.now())!
 }
 async open(path:string){
  if(!this.owns(path)&&!(this.sourceFolder&&isFolderNote(path,this.sourceFolder)))throw Error("Path is outside the notebook.")
  const f=this.app.vault.getAbstractFileByPath(path)
  if(f instanceof TFile)await this.app.workspace.getLeaf("tab").openFile(f)
 }
}
