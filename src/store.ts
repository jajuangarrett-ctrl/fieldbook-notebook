import {App,TFile,TFolder,normalizePath} from "obsidian"
import {Page,newPage,parsePage,validateFolder,validID} from "./model"
export interface FileStore {
 list():Promise<Page[]>
 read(path:string):Promise<string|null>
 write(path:string,expected:string|null,next:string):Promise<void>
 create(pages:Page[]):Promise<Page>
 open(path:string):Promise<void>
 meta(id?:string):string
}
export class VaultStore implements FileStore {
 private dir:string
 constructor(private app:App,dir:string){if(!validateFolder(dir))throw Error("Choose a valid vault-relative notebook folder.");this.dir=normalizePath(dir)}
 private pageBase(){return this.dir+"/Pages"}
 meta(id?:string){if(id&&!validID(id))throw Error("Invalid page ID.");return this.dir+"/Fieldbook Data/"+(id??"Notebook")+".md"}
 private owns(path:string){return path.startsWith(this.dir+"/")&&!path.split("/").includes("..")}
 async list(){
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
  if(!this.owns(path))throw Error("Path is outside the notebook.")
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
  if(!this.owns(path))throw Error("Path is outside the notebook.")
  if(expected===next)return
  if(expected===null){
   await this.folder(path.slice(0,path.lastIndexOf("/")))
   await this.app.vault.create(path,next).catch(function(e){throw new Error("Couldn’t create the file. It may already exist. "+String(e))})
  } else {
   const f=this.app.vault.getAbstractFileByPath(path)
   if(!(f instanceof TFile))throw Error("File moved or disappeared. Your draft is still open.")
   await this.app.vault.process(f,(actual)=>{
    if(actual!==expected)throw Error("Another edit changed this file. Your draft is still open; copy it before loading the synced version.")
    return next
   })
  }
 }
 async create(pages:Page[]){
  const id=globalThis.crypto.randomUUID(),n=Math.max(0,...pages.map(p=>p.number))+1
  const path=this.pageBase()+"/Page "+String(n).padStart(3,"0")+" "+id.slice(0,8)+".md"
  const raw=newPage(id,n,"Page "+n)
  await this.write(path,null,raw)
  return parsePage(raw,path,Date.now())!
 }
 async open(path:string){
  if(!this.owns(path))throw Error("Path is outside the notebook.")
  const f=this.app.vault.getAbstractFileByPath(path)
  if(f instanceof TFile)await this.app.workspace.getLeaf("tab").openFile(f)
 }
}
