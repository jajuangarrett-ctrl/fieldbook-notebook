import {chromium} from 'playwright-core'
import {mkdtemp,mkdir,writeFile,readFile,copyFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'

const root=await mkdtemp(join(tmpdir(),'fieldbook-host-smoke-'))
const profile=join(root,'profile'), vault=join(root,'Fieldbook Smoke Vault')
const config=join(vault,'.obsidian'), plugin=join(config,'plugins','fieldbook-notebook')
const obBin=process.env.OBSIDIAN_BIN??'/Applications/Obsidian.app/Contents/MacOS/Obsidian'
let app,child
const address=createServer()
await new Promise(r=>address.listen(0,"127.0.0.1",r))
const port=address.address().port
await new Promise(r=>address.close(r))
try{
 await mkdir(plugin,{recursive:true});await mkdir(profile,{recursive:true})
 for(const name of ['main.js','styles.css','manifest.json'])await copyFile('dist/'+name,join(plugin,name))
 await writeFile(join(config,'community-plugins.json'),'["fieldbook-notebook"]')
 await writeFile(join(config,'app.json'),'{"restrictedMode":false}')
 const existing=join(vault,'Reference Notes')
 await mkdir(join(existing,'Subfolder'),{recursive:true})
 const existingText='# Existing note\n\n**Already in the vault.**\n'
 await writeFile(join(existing,'Existing note.md'),existingText)
 await writeFile(join(existing,'Subfolder','Nested note.md'),'Nested vault page.')
 await writeFile(join(profile,'obsidian.json'),JSON.stringify({vaults:{a000000000000001:{path:vault,ts:Date.now(),open:true}}}))
 child=spawn(obBin,['--user-data-dir='+profile,'--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1','--no-first-run'],{stdio:'ignore'})
 let active=false
 for(let i=0;i<45;i++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/json/version');if(r.ok){active=true;break}}catch{}
  if(child.exitCode!==null)break
  await new Promise(r=>setTimeout(r,350))
 }
 assert.ok(active,'Isolated Obsidian did not expose a local test connection.')
 app=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000})
 const context=app.contexts()[0]
 const w=context.pages()[0]??await context.waitForEvent('page',{timeout:14000})
 const failures=[];w.on('pageerror',e=>failures.push(e.message))
 await w.waitForFunction(name=>window.app?.vault?.getName?.()===name,'Fieldbook Smoke Vault',{timeout:21000})
 const trust=w.getByRole('button',{name:'Trust author and enable plugins',exact:true})
 await trust.waitFor({timeout:6500}).catch(()=>undefined)
 // This prompt is only approved in the exact disposable vault identified above.
 if(await trust.isVisible())await trust.click()
 await w.waitForFunction(()=>window.app?.commands?.commands?.['fieldbook-notebook:open-fieldbook'],null,{timeout:11000})
 await w.evaluate(()=>window.app.commands.executeCommandById('fieldbook-notebook:open-fieldbook'))
 await w.getByRole('button',{name:'Open notebook',exact:true}).click({timeout:9000})
 await w.getByRole('button',{name:'Notebook tools',exact:true}).click()
 await w.locator('.fb-tools').getByRole('button',{name:'New page',exact:true}).click({timeout:9000})
 await w.getByRole('textbox',{name:'Page title'}).fill('Disposable host test')
 await w.locator('.fb-root .cm-content').fill('A normal Markdown note written inside Obsidian.')
 await w.getByRole('button',{name:'Done',exact:true}).click({timeout:9000})
 const pages=join(vault,'Fieldbook Notebook','Pages')
 const names=await readdir(pages)
 assert.equal(names.length,1)
 const contents=await readFile(join(pages,names[0]),'utf8')
 assert.match(contents,/# Disposable host test/)
 assert.match(contents,/A normal Markdown note/)
 await mkdir('test-output',{recursive:true})
 await w.locator('.fb-root').screenshot({path:'test-output/04-obsidian-host.png'})
 await w.getByRole('button',{name:'Notebook tools',exact:true}).click()
 await w.locator('.fb-tools').getByRole('button',{name:'Choose folder',exact:true}).click({timeout:6000})
 await w.locator('.suggestion-item').filter({hasText:/^Reference Notes$/}).click({timeout:6000})
 await w.locator('.fb-source-reader strong').filter({hasText:'Already in the vault.'}).waitFor({timeout:8000})
 assert.equal(await w.getByRole('button',{name:'Type or finish editing',exact:true}).count(),0)
 await w.getByRole('button',{name:'Notebook tools',exact:true}).click()
 await w.locator('.fb-tools').getByRole('button',{name:'Contents',exact:true}).click()
 await w.getByRole('button',{name:/Nested note/}).click()
 await w.locator('.fb-source-reader').getByText('Nested vault page.').waitFor()
 assert.equal(await readFile(join(existing,'Existing note.md'),'utf8'),existingText)
 assert.equal(await readFile(join(existing,'Subfolder','Nested note.md'),'utf8'),'Nested vault page.')
 await w.locator('.fb-root').screenshot({path:'test-output/05-existing-folder.png'})
 assert.deepEqual(failures.filter(m=>m.includes('Fieldbook')),[])
 console.log('PASS: actual Obsidian in isolated profile; plugin loaded, Open Fieldbook command opened cover, practice page persisted; native Markdown of selected folder and nested notes rendered read-only.')
}finally{
 await app?.close().catch(()=>undefined)
 if(child?.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,1500))])}
 await rm(root,{recursive:true,force:true})
}
