import test from "node:test"
import assert from "node:assert/strict"
import {ChangeSet} from "@codemirror/state"
import {appearance,capture,decodeSidecar,digest,encodeSidecar,headings,mapMark,newPage,parsePage,relocate,serialize,turnDirection,validateFolder,mergePageWrite,bottomClearance,pageLayout,folderPage,isFolderNote} from "../src/model"
const id="b0bfc881-433c-4618-8dc9-281b5c666b8e"
test("created page has stable identity, editable heading and normal Markdown body",()=>{
 const raw=newPage(id,3,"Sample");const p=parsePage(raw,"Fieldbook Notebook/Pages/Page 003.md")!
 assert.equal(p.id,id);assert.equal(p.number,3);assert.equal(p.body,"")
 const next=serialize(p,"Moved title","Text\n\n## A heading\n")
 const parsed=parsePage(next,"Notebooks/Pages/Renamed.md")!
 assert.equal(parsed.id,id);assert.equal(parsed.title,"Moved title");assert.equal(parsed.body,"Text\n\n## A heading\n")
})
test("ignore notes without identity and preserve unrelated metadata",()=>{
 assert.equal(parsePage("# Unrelated","x.md"),null)
 const raw=newPage(id,3,"Sample").replace("---\n\n#","tags: [work]\n---\n\n#")
 const p=parsePage(raw,"x.md")!
 assert.match(serialize(p,"Edited","Clean"),/tags: \[work\]/)
})
test("headings ignore fenced code and preserve exact offsets",()=>{
 const src="Paragraph\n\n```md\n# Not a heading\n```\n\n## First\n### Second"
 assert.deepEqual(headings(src).map(h=>[h.title,src.slice(h.offset,h.offset+h.level)]),[["First","##"],["Second","###"]])
})
test("mark expands through an edit inside the selection",()=>{
 const old="A warm handoff helps students find support."
 const i=old.indexOf("students")
 const m=capture(old,{id,kind:"circle"},i,i+8)
 const edits=ChangeSet.of([{from:i+7,insert:" new"}],old.length)
 const next=old.slice(0,i+7)+" new"+old.slice(i+7)
 const x=mapMark(next,m,(p,a)=>edits.mapPos(p,a))
 assert.equal(x.quote,"student news");assert.equal(x.state,"placed")
})
test("deletion leaves review tombstone and never silently marks a different copy; undo can restore",()=>{
 const old="one sample and sample"
 const start=old.indexOf("sample")
 const m=capture(old,{id,kind:"highlight"},start,start+6)
 const edits=ChangeSet.of([{from:start,to:start+6}],old.length)
 const next=old.slice(0,start)+old.slice(start+6)
 const x=mapMark(next,m,(p,a)=>edits.mapPos(p,a))
 assert.equal(x.state,"review");assert.equal(mapMark(next,x,p=>p).state,"review");assert.equal(relocate(next,x).state,"review")
 assert.equal(mapMark(old,x,p=>p,true).state,"placed")
})
test("unique external reattachment, repeated quote resolved only with both matching contexts",()=>{
 const old="prefix before word after suffix", at=old.indexOf("word")
 const m=capture(old,{id,kind:"underline"},at,at+4)
 assert.equal(relocate("Moved word elsewhere",m).from,6)
 assert.equal(relocate("New word plus word.",m).state,"review")
 assert.equal(relocate("word "+old,m).from,at+5)
 assert.equal(relocate(old,m,true).from,at)
 assert.notEqual(digest(old),digest(old+"!"))
})
test("metadata fenced JSON validation and normalized enums",()=>{
 assert.deepEqual(decodeSidecar(encodeSidecar({a:1})),{a:1})
 assert.deepEqual(decodeSidecar(null),{})
 assert.throws(()=>decodeSidecar("unrelated note"))
 assert.equal(appearance({size:55,paper:"nonsense"}).size,30)
 assert.equal(appearance({size:55,paper:"nonsense"}).paper,"white")
})
test("path scope and deliberate edge gesture",()=>{
 for(const p of ["My Fieldbook","Areas/Fieldbook"])assert.equal(validateFolder(p),true)
 for(const p of ["../bad","/Volumes","..","./bad","A//B","A\\B","A\nB"])assert.equal(validateFolder(p),false)
 assert.equal(turnDirection(-80,5,600),1)
 assert.equal(turnDirection(50,8,90),-1)
 assert.equal(turnDirection(-70,50,100),0)
 assert.equal(turnDirection(-40,2,900),0)
})

test("save guard preserves unrelated frontmatter and rejects changed text",()=>{
 const path="A/Pages/Test.md",r=newPage(id,1,"Page 1"),p=parsePage(r,path)!
 const actual=r.replace("fieldbook-page-order: 1","fieldbook-page-order: 1\nlocation: origin")
 const next=serialize(p,"Typed title","My text")
 const merged=mergePageWrite(actual,r,next,path)!
 assert.match(merged,/location: origin/);assert.match(merged,/# Typed title\n\nMy text/)
 assert.equal(mergePageWrite(serialize(p,p.title,"External text"),r,next,path),null)
 assert.equal(mergePageWrite(r.replace(id,"c"+id.slice(1)),r,next,path),null)
})
test("folder notes parse ordinary Markdown read-only without requiring frontmatter",()=>{
 const p=folderPage("# Original title\n\nExample","People/Nested/Existing.md",2)!
 assert.equal(p.title,"Existing");assert.match(p.body,/# Original title/)
 assert.equal(folderPage("# Changed","People/Nested/Existing.md",4)?.id,p.id)
 assert.equal(isFolderNote("People/Nested/Existing.md","People"),true)
 for(const path of ["People.txt","Unrelated/One.md","People/Fieldbook Data/Notebook.md","People/file.excalidraw.md","People/.obsidian/file.md"])assert.equal(isFolderNote(path,"People"),false)
})
test("single layout at folded and portrait sizes; dock inset only for actual overlap",()=>{
 assert.equal(pageLayout(386,678,false),"narrow")
 assert.equal(pageLayout(871,669,false),"wide")
 assert.equal(pageLayout(768,999,false),"narrow")
 assert.equal(pageLayout(871,669,true),"narrow")
 const pane={left:0,right:386,top:20,bottom:678}
 assert.equal(bottomClearance(pane,[{left:48,right:338,top:605,bottom:665}]),81)
 assert.equal(bottomClearance(pane,[{left:48,right:338,top:682,bottom:728}]),0)
 assert.equal(bottomClearance(pane,[{left:400,right:430,top:615,bottom:672}]),0)
})
test("Fieldbook metadata round-trips with other Obsidian properties in any order",()=>{
 const original="\uFEFF---\r\ntitle: Notebook\r\nfieldbook-sidecar: 1\r\nlocation: 'Fieldbook Notebook/Fieldbook Data'\r\ntags: []\r\n---\r\n\r\n```fieldbook-json\r\n{}\r\n```\r\n"
 assert.deepEqual(decodeSidecar(original),{})
 const saved=encodeSidecar({bookmarks:[]},original)
 assert.equal(saved.split("```fieldbook-json")[0],original.split("```fieldbook-json")[0])
 assert.deepEqual(decodeSidecar(saved),{bookmarks:[]})
 assert.throws(()=>encodeSidecar({},original.replace('fieldbook-sidecar: 1','fieldbook-sidecar: 2')))
 assert.throws(()=>encodeSidecar({},original.replace('fieldbook-sidecar: 1','fieldbook-sidecar: 1\r\nfieldbook-sidecar: 1')))
 assert.equal(folderPage(original,"Folder/Notebook.md",1),null)
})
