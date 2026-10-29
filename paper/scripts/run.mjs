import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { benchmark, run, scoreStabilityFiles } from '../../dist/index.js';
import { mockAdapter, mulberry32 } from 'benchmark-core';
import { mean, bootstrap, wilson } from '../template/stats.mjs';
const tasks = await benchmark.listTasks(), config = JSON.parse(await readFile('paper/config.json'));
const hash = x => createHash('sha256').update(x).digest('hex');
const save = (name, x) => writeFile(`paper/data/${name}.generated.json`, JSON.stringify(x) + '\n');
await Promise.all(['paper/data','artifacts/paper'].map(p => mkdir(p,{recursive:true})));
const options = {seed:1, concurrency:1, retries:0, budgetUsd:0};
const semantic = r => ({model:r.model, rows:r.rows.map(({taskId,submission,score,reason})=>({taskId,submission,score,reason}))});
async function execute(id, answer) {
  const r = await run({id, complete:async (prompt,{task})=>({content:answer(prompt,task)}), chat:async()=>{throw Error('Unexpected chat');}},options);
  assert.equal(r.rows.length,tasks.length); assert.ok(r.rows.every(x=>!x.error)); assert.equal(r.totals.costUsd??0,0); return r;
}
const policies = {empty:()=>'',zero:()=> '0','forty-two':()=> '42',echo:p=>p,refusal:()=> 'I cannot help with that request.','first-number':p=>p.match(/\d+/)?.[0]??'','last-number':p=>p.match(/\d+/g)?.at(-1)??'','answer-key':(_,t)=>t.expected};
const reports=[], repeats=[], policyStats=[];
for (const name of [...Object.keys(policies),'mock']) {
  const get = ()=>name==='mock'?run(mockAdapter({seed:1}),options):execute(name,policies[name]);
  const r=await get(), repeat=await get(), digest=hash(JSON.stringify(semantic(r)));
  assert.ok(r.rows.every(x=>!x.error)); assert.equal(r.totals.costUsd??0,0); assert.equal(digest,hash(JSON.stringify(semantic(repeat))));
  reports.push(r); repeats.push({report:repeat,sha256:digest,repeatSha256:hash(JSON.stringify(semantic(repeat)))});
  const items=[...new Set(tasks.map(t=>t.metadata.item))].map(i=>r.rows.filter((_,j)=>tasks[j].metadata.item===i).map(x=>x.score));
  policyStats.push({name,score:bootstrap([items],gs=>mean(gs[0].flat())),allVariants:wilson(items.filter(a=>a.every(x=>x===1)).length,items.length)});
}
await save('runs',reports); await save('repeat',repeats);
async function analyze(rs, tag, independent=false) {
  const paths=[];
  for (let i=0;i<rs.length;i++) { const p=`artifacts/paper/report-${i}.json`; await writeFile(p,JSON.stringify({...rs[i],rows:rs[i].rows.map(r=>({...r,taskId:independent?r.taskId.replace('-v','-prompt'):r.taskId}))})); paths.push(p); }
  const result=await scoreStabilityFiles(paths,{seed:7,resamples:500,svgPath:'artifacts/paper/volatility.svg'});
  return {tag,...result,volatilityChart:'artifacts/paper/volatility.svg'};
}
const raw=[], analyses=[], ablations=[];
for (const population of [2,4,8]) for (const gap of [0,.05,.15]) for (let seed=1;seed<=12;seed++) {
  const random=mulberry32(seed), rs=[];
  for (let agent=0;agent<population;agent++) for (let repeat=0;repeat<3;repeat++) {
    const wins=Array.from({length:60},()=>random()<.55+(agent===0?gap:0));
    const r=await execute(`simulated-${agent}`,(_,t)=>wins[t.metadata.item-1]?t.expected:'');
    rs.push({model:r.model,rows:r.rows.map(({taskId,score})=>({taskId,score}))});
  }
  const tag=`simulated-n${population}-gap${gap}-seed${seed}`, result=await analyze(rs,tag);
  raw.push({tag,population,gap,seed,reports:rs}); analyses.push({population,gap,simulationSeed:seed,...result});
  if(population===2&&gap===.05) ablations.push({seed,clustered:result,independent:await analyze(rs,tag+'-independent',true)});
}
const promptReports=[];
for(let a=0;a<2;a++) promptReports.push(semantic(await execute(`simulated-prompt-${a}`,(_,t)=>(a===0?t.metadata.variant<=2:t.metadata.variant>=3)?t.expected:'')));
const prompt=await analyze(promptReports,'simulated-prompt');
const oracle=semantic(reports.find(r=>r.model==='answer-key'));
const tie=await analyze([{...oracle,model:'tie-a'},{...oracle,model:'tie-b'}],'exact-tie');
await save('simulation-inputs',raw); await save('simulation-analysis',analyses); await save('ablations',ablations); await save('controls',{promptReports,prompt,tie});
const leader = r=>r.models.find(m=>m.model==='simulated-0');
const estimate = xs=>bootstrap([xs],gs=>mean(gs[0]));
const cells=[2,4,8].flatMap(population=>[0,.05,.15].map(gap=>{const rs=analyses.filter(r=>r.population===population&&r.gap===gap);return {population,gap,share:estimate(rs.map(r=>leader(r).probabilityFirst)),tau:estimate(rs.map(r=>r.meanKendallTau)),width:estimate(rs.map(r=>leader(r).rankInterval95.high-leader(r).rankInterval95.low))};}));
const contrasts=[2,4,8].map(population=>{const a=analyses.filter(r=>r.population===population&&r.gap===0), b=analyses.filter(r=>r.population===population&&r.gap===.15);return {population,shareDifference:estimate(b.map((r,i)=>leader(r).probabilityFirst-leader(a[i]).probabilityFirst))};});
const ablation={shareDifference:estimate(ablations.map(r=>leader(r.independent).probabilityFirst-leader(r.clustered).probabilityFirst)),widthDifference:estimate(ablations.map(r=>(leader(r.independent).rankInterval95.high-leader(r.independent).rankInterval95.low)-(leader(r.clustered).rankInterval95.high-leader(r.clustered).rankInterval95.low)))};
const coverage=[...new Set(tasks.map(t=>t.metadata.family))].map(family=>({family,items:new Set(tasks.filter(t=>t.metadata.family===family).map(t=>t.metadata.item)).size,rows:tasks.filter(t=>t.metadata.family===family).length}));
await save('summary',{schema_version:1,kind:'scripted-controls-and-simulated-populations',tasks:tasks.length,items:60,variants:5,families:coverage.length,coverage,policyStats,cells,contrasts,ablation,rivalProbability:.55,simulationSeeds:12,repeatedRuns:3,resamples:500,ciLevel:95,simulationReports:raw.reduce((s,r)=>s+r.reports.length,0),policyExecutions:reports.length*2,costUsd:0,repeatIdentical:true,freeModels:{status:'not-run',reason:'Free hosted inference is not configured for this study; availability is not probed.'}});
const frozen=['data/tasks.jsonl','src/stability.ts','src/answer.ts','src/index.ts','package-lock.json'];
for(const p of frozen) assert.equal(hash(await readFile(p)),hash(execFileSync('git',['show',`${config.source_commit}:${p}`])));
const sources=[...frozen,'paper/PREREG.md','paper/scripts/run.mjs','paper/template/stats.mjs'];
await save('provenance',{source_commit:config.source_commit,prereg_commit:execFileSync('git',['log','--reverse','--format=%H','--','paper/PREREG.md'],{encoding:'utf8'}).trim().split('\n')[0],node:process.version,files:Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(p))]))),semanticHashes:reports.map(r=>hash(JSON.stringify(semantic(r)))),simulationHash:hash(await readFile('paper/data/simulation-inputs.generated.json'))});
console.log(`Completed ${raw.length} simulated cells; ${reports.length} repeated controls; API cost USD 0`);
