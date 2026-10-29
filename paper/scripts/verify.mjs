import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {benchmark,scoreStabilityFiles} from '../../dist/index.js';
import {mulberry32} from 'benchmark-core';
import {bootstrap,mean,wilson} from '../template/stats.mjs';
const read=async n=>JSON.parse(await readFile(`paper/data/${n}.generated.json`)), hash=x=>createHash('sha256').update(x).digest('hex');
const [s,runs,repeats,raw,analyses,prov]=await Promise.all(['summary','runs','repeat','simulation-inputs','simulation-analysis','provenance'].map(read));
const tasks=await benchmark.listTasks(), semantic=r=>({model:r.model,rows:r.rows.map(({taskId,submission,score,reason})=>({taskId,submission,score,reason}))});
for(const [p,digest] of Object.entries(prov.files)) assert.equal(hash(await readFile(p)),digest,`Source changed: ${p}`);
assert.equal(prov.simulationHash,hash(await readFile('paper/data/simulation-inputs.generated.json')));
assert.equal(execFileSync('git',['show',`${prov.prereg_commit}:paper/PREREG.md`],{encoding:'utf8'}),await readFile('paper/PREREG.md','utf8'));
assert.throws(()=>execFileSync('git',['cat-file','-e',`${prov.prereg_commit}:paper/data/runs.generated.json`],{stdio:'pipe'}));
for(let j=0;j<runs.length;j++) {
 const r=runs[j], itemScores=Array.from({length:s.items},(_,i)=>r.rows.filter((_,k)=>tasks[k].metadata.item===i+1).map(x=>x.score));
 assert.equal(hash(JSON.stringify(semantic(r))),repeats[j].sha256); assert.equal(hash(JSON.stringify(semantic(repeats[j].report))),repeats[j].sha256);
 assert.deepEqual(bootstrap([itemScores],gs=>mean(gs[0].flat())),s.policyStats[j].score); assert.deepEqual(wilson(itemScores.filter(a=>a.every(x=>x===1)).length,s.items),s.policyStats[j].allVariants);
 for(let k=0;k<r.rows.length;k++) assert.equal((await benchmark.score(tasks[k],r.rows[k].submission)).score,r.rows[k].score);
}
for(let j=0;j<raw.length;j++) {
 const cell=raw[j],random=mulberry32(cell.seed), paths=[];
 for(let r=0;r<cell.reports.length;r++) {const report=cell.reports[r], wins=Array.from({length:s.items},()=>+(random()<s.rivalProbability+(r<3?cell.gap:0)));assert.deepEqual(report.rows.map(x=>x.score),tasks.map(t=>wins[t.metadata.item-1]));const path=`artifacts/paper/verify-${r}.json`;await writeFile(path,JSON.stringify(report));paths.push(path);}
 const actual=await scoreStabilityFiles(paths,{seed:7,resamples:s.resamples,svgPath:'artifacts/paper/volatility.svg'});
 const {population,gap,simulationSeed,tag,...expected}=analyses[j];assert.equal(population,cell.population);assert.equal(gap,cell.gap);assert.equal(simulationSeed,cell.seed);assert.equal(tag,cell.tag);assert.deepEqual(actual,{...expected,seed:7});
}
const leader=r=>r.models.find(m=>m.model==='simulated-0'), estimate=xs=>bootstrap([xs],gs=>mean(gs[0]));
for(const c of s.cells) {const rs=analyses.filter(r=>r.population===c.population&&r.gap===c.gap);assert.deepEqual(estimate(rs.map(r=>leader(r).probabilityFirst)),c.share);assert.deepEqual(estimate(rs.map(r=>r.meanKendallTau)),c.tau);}
const ablations=await read('ablations'), controls=await read('controls');
assert.equal(controls.tie.meanKendallTau,1);assert.ok(controls.tie.models.every(m=>m.rank===1.5&&m.probabilityFirst===.5));
for(const a of ablations) {const cell=raw.find(r=>r.population===2&&r.gap===.05&&r.seed===a.seed),paths=[];for(let i=0;i<cell.reports.length;i++){const path=`artifacts/paper/ablation-${i}.json`;await writeFile(path,JSON.stringify({...cell.reports[i],rows:cell.reports[i].rows.map(r=>({...r,taskId:r.taskId.replace('-v','-prompt')}))}));paths.push(path);}const actual=await scoreStabilityFiles(paths,{seed:7,resamples:s.resamples,svgPath:'artifacts/paper/volatility.svg'});const {tag,...expected}=a.independent;assert.ok(tag.endsWith('-independent'));assert.deepEqual(actual,expected);}
assert.deepEqual(estimate(ablations.map(r=>leader(r.independent).probabilityFirst-leader(r.clustered).probabilityFirst)),s.ablation.shareDifference);
for(const c of s.contrasts){const a=analyses.filter(r=>r.population===c.population&&r.gap===0),b=analyses.filter(r=>r.population===c.population&&r.gap===.15);assert.deepEqual(estimate(b.map((r,i)=>leader(r).probabilityFirst-leader(a[i]).probabilityFirst)),c.shareDifference);}
const meta=JSON.parse(await readFile('paper/meta.json'));assert.ok(meta.abstract.length<=1920&&/^[\x00-\x7F]*$/.test(meta.abstract));assert.equal(meta.license,'CC-BY-4.0');
const text=execFileSync('pdftotext',['paper/'+meta.artifact_name,'-'],{encoding:'utf8'}), pages=Number(execFileSync('pdfinfo',['paper/'+meta.artifact_name],{encoding:'utf8'}).match(/Pages:\s+(\d+)/)[1]);
assert.ok(pages>=8);assert.ok(!text.includes('\u2014'));for(let n=1;n<=3;n++)assert.ok(text.includes(`Figure ${n}:`));assert.ok(!/Overfull|undefined (references|citations)/.test(await readFile('paper/paper.log','utf8')));
await writeFile('paper/data/verification.generated.json',JSON.stringify({status:'passed',pages,policyReports:runs.length,simulatedCells:raw.length,rawToSummary:true,repeatedTraces:true,allSimulatedAnalysesRecomputed:true,pdfSha256:hash(await readFile('paper/'+meta.artifact_name))})+'\n');console.log(`Verified ${pages} pages, ${runs.length} repeated controls, ${raw.length} simulated analyses, and raw-to-summary agreement`);
