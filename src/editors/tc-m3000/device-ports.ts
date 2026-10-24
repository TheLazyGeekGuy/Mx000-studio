/** Port labels select candidates; only the Identity Reply establishes the device model. */
export const portLooksLikeMSeries=(name:string|null|undefined)=>/\bM\s?[23x]000\b|\bM[23]K\b/i.test(name??'')
type Port={id:string;name?:string|null;state?:string}
export function automaticMSeriesPair(inputs:readonly Port[],outputs:readonly Port[],available:(direction:'input'|'output',id:string)=>boolean,remembered:string|null){
 const ins=inputs.filter(p=>p.state==='connected'&&available('input',p.id)&&(remembered?p.name===remembered:portLooksLikeMSeries(p.name))),outs=outputs.filter(p=>p.state==='connected'&&available('output',p.id)&&(remembered?p.name===remembered:portLooksLikeMSeries(p.name)))
 const pairs=ins.flatMap(input=>outs.filter(output=>input.name&&input.name===output.name).map(output=>({input,output})))
 return pairs.length===1?pairs[0]:null
}
