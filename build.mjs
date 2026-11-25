import {build} from 'esbuild'
import {mkdir,copyFile,readFile,readdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
await mkdir('dist',{recursive:true})
const result=await build({entryPoints:['src/main.ts'],bundle:true,format:'cjs',target:'es2021',outfile:'dist/main.js',external:['obsidian'],minify:true,legalComments:'linked',logLevel:'info',metafile:true})
for (const name of ['manifest.json','styles.css']) await copyFile(name,'dist/'+name)
const packages=new Set()
for(const source of Object.keys(result.metafile.inputs)) {
 const m=/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)
 if(m)packages.add(m[1])
}
const sections=[]
for (const p of [...packages].sort()){
 const dir=join('node_modules',p), meta=JSON.parse(await readFile(join(dir,'package.json'),'utf8'))
 const candidates=(await readdir(dir)).filter(f=>/^(?:licen[cs]e|copying)(?:[._-][^/]+)?$/i.test(f))
 if(!candidates.length)throw Error("No distribution notice found for "+p)
 sections.push(p+' '+meta.version+' ('+meta.license+')\n\n'+(await Promise.all(candidates.map(f=>readFile(join(dir,f),'utf8')))).join('\n\n'))
}
await writeFile('dist/THIRD-PARTY-NOTICES.txt','Third-party dependencies included in the Fieldbook JavaScript bundle\n\n'+sections.join('\n\n------------------------------------------------------------\n\n')+'\n')
