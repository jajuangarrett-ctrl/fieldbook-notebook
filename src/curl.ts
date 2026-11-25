// Both the real paper and the translucent roll share the same curved reveal edge.
// Percent coordinates keep the animation responsive without measuring or cloning note DOM.
export function curlFrames(direction:-1|1,incoming:boolean):{paper:Keyframe[];roll:Keyframe[]}{
 const paper:Keyframe[]=[],roll:Keyframe[]=[]
 const x=(n:number)=>direction===1?n:100-n
 const point=(v:number,y:number)=>x(v).toFixed(2)+"% "+y+"%"
 const shape=(points:string[])=>"polygon("+points.join(",")+")"
 for(let i=0;i<=12;i++){
  const t=i/12
  const arc=Math.sin(Math.PI*t), center=100-100*t
  const edge=Array.from({length:13},(_,j)=>{
   const y=j/12
   // The bottom corner leads; the belly of the fold rounds as it crosses the page.
   return {y:100*y,x:center+arc*(14*Math.sin(Math.PI*y)-23*(y-.5))}
  })
  const side=incoming?100:0
  const band=incoming?-1:1
  paper.push({offset:t,clipPath:shape([point(side,0),...edge.map(p=>point(p.x,p.y)),point(side,100)])})
  const back=edge.map(p=>point(p.x+band*arc*(9+11*Math.sin(Math.PI*p.y/100)),p.y)).reverse()
  const track=100*(x(center+(incoming?-5:5))-19)/62
  roll.push({offset:t,clipPath:shape([...edge.map(p=>point(p.x,p.y)),...back]),backgroundPosition:track.toFixed(2)+"% 0",opacity:Math.min(1,arc*4)})
 }
 return {paper,roll}
}
