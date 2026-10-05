'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { model, artifacts } = require('./publication');

function viewer(run = null) {
  const renderer = fs.readFileSync(path.join(__dirname, 'publication.js'), 'utf8');
  const data = JSON.stringify(run).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALAGAD evaluation publication report</title><style>
body{background:white;color:#111;font:16px Arial,sans-serif;margin:24px}button,input{font:inherit;padding:8px;margin:5px}button{background:white;border:1px solid #555;border-radius:4px;cursor:pointer}section{border-top:1px solid #bbb;margin-top:24px;padding-top:12px}.figure{overflow:auto}.figure svg{width:100%;min-width:720px;height:auto;max-width:1200px}#error{color:#111;font-weight:bold}small{display:block;line-height:1.6}label{font-weight:bold}@media print{.controls{display:none}section{break-before:page;border:none}.figure svg{min-width:0;width:100%}body{margin:0}}
</style><h1>ALAGAD evaluation report</h1><p>Import one saved run. All figures and exports use that selected run. No scores are shown before evaluation.</p>
<div class="controls"><label>Selected run JSON <input id="file" type="file" accept=".json,application/json"></label><button id="all">Print complete report / Save as PDF</button><button id="json">Export selected run JSON</button><small>SVG and PDF retain vector text. PNG exports use 300 DPI (8 inches wide or more). For PDF, choose Save as PDF in the print dialog; disable browser headers and footers.</small></div>
<p id="error" role="alert"></p><div id="reviews" class="controls"></div><div id="report"></div><script>${renderer}</script><script>
'use strict';let selected=${data}; const api=window.ALAGADPublication;
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function filename(id){return String(selected?.run_id||selected?.finished_at||'not-evaluated').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+id}
function printFigures(figures){const win=window.open('','_blank');if(!win)throw Error('Allow the report print window to export PDF.');win.document.write('<!doctype html><html><head><title>'+api.esc(filename('report'))+'</title><style>@page{size:A4 landscape;margin:12mm}body{margin:0}section{break-after:page}section:last-child{break-after:auto}svg{width:100%;height:auto;max-height:175mm}</style></head><body>'+figures.map(f=>'<section>'+f.svg+'</section>').join('')+'</body></html>');win.document.close();win.focus();setTimeout(()=>win.print(),250)}
// Insert a PNG pHYs chunk: 11811 pixels/metre is 300 DPI.
const dpiPNG=api.dpiPNG;
async function png(f){const url=URL.createObjectURL(new Blob([f.svg],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=Math.ceil(f.width*2.5);canvas.height=Math.ceil(f.height*2.5);if(canvas.width*canvas.height>100000000)throw Error('Figure too large for PNG; use vector SVG or PDF.');const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG export failed. Use SVG.');download(new Blob([dpiPNG(new Uint8Array(await blob.arrayBuffer()))],{type:'image/png'}),filename(f.id)+'.png')}finally{URL.revokeObjectURL(url)}}
function reviewControls(){const host=document.getElementById('reviews');host.innerHTML=selected?'<details><summary>Manual factual answer review (save using Export selected run JSON)</summary><p>Verify references against approved records. Allow equivalent wording and translations. Changes remain local until exported.</p>'+selected.predictions.map((r,i)=>'<fieldset><legend>Question '+(i+1)+': '+api.esc(r.query||r.question)+'</legend>'+['correctness','completeness','response_language'].map(field=>{const options={correctness:['not reviewed','correct','partially correct','incorrect'],completeness:['not reviewed','complete','incomplete'],response_language:['not reviewed','appropriate','inappropriate']}[field];return '<label>'+field.replace(/_/g,' ')+' <select data-row="'+i+'" data-field="'+field+'">'+options.map(v=>'<option'+((r.review?.[field]||'not reviewed')===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label> '}).join('')+'<label>Reference verified against approved records <input type="checkbox" data-row="'+i+'" data-field="reference_verified"'+(r.reference_verified===true?' checked':'')+'></label><label>Reviewer notes <input data-row="'+i+'" data-field="notes" value="'+api.esc(r.review?.notes||'')+'"></label><p>Dataset review note: '+api.esc(r.review_note||'None')+'</p></fieldset>').join('')+'</details>':'';host.querySelectorAll('[data-field]').forEach(input=>input.onchange=()=>{const r=selected.predictions[Number(input.dataset.row)];if(input.dataset.field==='reference_verified')r.reference_verified=input.checked;else{r.review=r.review||{};r.review[input.dataset.field]=input.value}render();document.querySelector('#reviews details').open=true})}
function render(){const figures=api.artifacts(api.model(selected));reviewControls();document.getElementById('report').innerHTML=figures.map((f,i)=>'<section><div class="controls"><h2>'+api.esc(f.title)+'</h2><button data-i="'+i+'" data-format="svg">Export SVG</button><button data-i="'+i+'" data-format="png">Export PNG (300 DPI)</button><button data-i="'+i+'" data-format="pdf">Export PDF</button></div><div class="figure">'+f.svg+'</div></section>').join('');document.querySelectorAll('[data-format]').forEach(b=>b.onclick=async()=>{try{const f=figures[Number(b.dataset.i)];if(b.dataset.format==='svg')download(new Blob([f.svg],{type:'image/svg+xml'}),filename(f.id)+'.svg');if(b.dataset.format==='png')await png(f);if(b.dataset.format==='pdf')printFigures([f])}catch(e){document.getElementById('error').textContent=e.message}});document.getElementById('all').onclick=()=>{try{printFigures(figures)}catch(e){document.getElementById('error').textContent=e.message}}}
document.getElementById('file').onchange=async e=>{try{const candidate=JSON.parse(await e.target.files[0].text());api.model(candidate);selected=candidate;render();document.getElementById('error').textContent=''}catch(err){document.getElementById('error').textContent=err.message}};
document.getElementById('json').onclick=()=>{if(!selected){document.getElementById('error').textContent='Not evaluated: select a run first.';return}download(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}),filename('run')+'.json')};render();
</script></html>`;
}

async function main(args) {
  let runPath, output, datasetPath;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run') runPath = args[++i];
    else if (args[i] === '--out') output = args[++i];
    else if (args[i] === '--dataset') datasetPath = args[++i];
    else throw Error('Usage: node evaluation/export-publication.js [--run saved-run.json] [--dataset matching-dataset.json] --out directory');
  }
  if (!output) throw Error('--out directory is required');
  let run = runPath ? JSON.parse(fs.readFileSync(runPath, 'utf8')) : null;
  if (datasetPath) {
    if (!run) throw Error('--dataset requires --run');
    const raw = fs.readFileSync(datasetPath);
    if (createHash('sha256').update(raw).digest('hex') !== run.dataset_sha256) throw Error('Dataset hash differs from the selected run. References cannot be attached.');
    const dataset = JSON.parse(raw);
    run = { ...run, predictions: run.predictions.map(row => {
      const reference = dataset.find(r => r.id === row.id && (r.question || r.query) === (row.question || row.query) && r.expected_intent === row.expected_intent);
      if (!reference) throw Error('Dataset row does not match the selected run.');
      return { ...row, language: row.language ?? reference.language, expected_answer: row.expected_answer ?? reference.expected_answer,
        expected_target: row.expected_target ?? reference.expected_target,
        reference_verified: row.reference_verified === true, review_note: row.review_note ?? reference.review_note };
    }), reference_attachment_policy: 'Reference text and language attached from the exact SHA-256 dataset snapshot; predictions unchanged.' };
  }
  if (run && !run.run_id) run = { ...run, run_id: path.basename(runPath, '.json') };
  const m = model(run);
  const previous = path.join(output, 'selected-run.json');
  if (run && fs.existsSync(previous)) {
    const saved = JSON.parse(fs.readFileSync(previous, 'utf8'));
    if (saved.run_id !== run.run_id || saved.dataset_sha256 !== run.dataset_sha256 || saved.total_questions !== run.total_questions) {
      throw Error('Output directory belongs to a different run. Choose a separate output directory to keep exports consistent.');
    }
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'evaluation-report.html'), viewer(run));
  if (run) {
    const figures = artifacts(m);
    for (const f of figures) fs.writeFileSync(path.join(output, `${f.id}.svg`), f.svg);
    await require('./render-publication').renderPublication(figures, output, run);
    fs.writeFileSync(path.join(output, 'selected-run.json'), JSON.stringify(run, null, 2));
    const columns = ['run_id', 'dataset_version', 'sample_size', 'intent_denominator', 'id', 'query', 'language', 'expected_intent', 'predicted_intent', 'native_predicted_intent', 'expected_target', 'predicted_target', 'target_correct', 'expected_answer', 'actual_answer', 'response_time_ms', 'error', 'reference_verified', 'correctness', 'completeness', 'response_language', 'reviewer_notes', 'dataset_review_note'];
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvRows = run.predictions.map(r => [run.run_id, run.dataset_version || run.dataset_sha256, m.attempted, m.completed,
      r.id, r.query || r.question, r.language, r.expected_intent, r.predicted_intent, r.native_predicted_intent,
      r.expected_target, r.predicted_target, r.target_correct, r.expected_answer, r.actual_answer ?? r.reply, r.response_time_ms ?? r.duration_ms,
      r.error, r.reference_verified === true, r.review?.correctness || 'not reviewed', r.review?.completeness || 'not reviewed', r.review?.response_language || 'not reviewed', r.review?.notes, r.review_note]);
    fs.writeFileSync(path.join(output, 'results.csv'), '\ufeff' + [columns, ...csvRows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n');
  }
  console.log(`Publication viewer: ${path.resolve(output, 'evaluation-report.html')}`);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { viewer, main };
