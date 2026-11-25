import test from "node:test"
import assert from "node:assert/strict"
import {ChangeSet} from "@codemirror/state"
import {appearance,capture,decodeSidecar,digest,encodeSidecar,headings,mapMark,newPage,parsePage,relocate,serialize,turnDirection,validateFolder} from "../src/model"
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
 assert.equal(appearance({size:55,paper:"nonsense"}).paper,"cream")
})
test("path scope and deliberate edge gesture",()=>{
 for(const p of ["My Fieldbook","Areas/Fieldbook"])assert.equal(validateFolder(p),true)
 for(const p of ["../bad","/Volumes","..","./bad","A//B","A\\B","A\nB"])assert.equal(validateFolder(p),false)
 assert.equal(turnDirection(-80,5,600),1)
 assert.equal(turnDirection(50,8,90),-1)
 assert.equal(turnDirection(-70,50,100),0)
 assert.equal(turnDirection(-40,2,900),0)
})
