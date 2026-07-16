const data = require('./src/data/walkableRoutes.json', { with: { type: 'json' } });
const lines = data.features.filter(f => f.geometry?.type === 'LineString');

function hav(c1,c2){const R=6371000,tr=d=>d*Math.PI/180,dLa=tr(c2[1]-c1[1]),dLo=tr(c2[0]-c1[0]);const a=Math.sin(dLa/2)**2+Math.cos(tr(c1[1]))*Math.cos(tr(c2[1]))*Math.sin(dLo/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function ck(c){return c[0].toFixed(7)+','+c[1].toFixed(7);}

// Build graph
const graph = new Map();
const coords = new Map();
function ensureNode(c){const k=ck(c);if(!graph.has(k)){graph.set(k,[]);coords.set(k,[c[0],c[1]]);}return k;}
function addEdge(cA,cB){const kA=ensureNode(cA),kB=ensureNode(cB);if(kA===kB)return;const w=hav(coords.get(kA),coords.get(kB));if(!graph.get(kA).some(e=>e.key===kB))graph.get(kA).push({key:kB,weight:w});if(!graph.get(kB).some(e=>e.key===kA))graph.get(kB).push({key:kA,weight:w});}

const lineCoords = lines.map(l => l.geometry.coordinates.map(c => [c[0], c[1]]));
for(const lc of lineCoords) for(let i=0;i<lc.length-1;i++) addEdge(lc[i],lc[i+1]);
for(let li=0;li<lineCoords.length;li++){for(const vert of lineCoords[li]){for(let lj=0;lj<lineCoords.length;lj++){if(li===lj)continue;const other=lineCoords[lj];for(let s=0;s<other.length-1;s++){const A=other[s],B=other[s+1],dx=B[0]-A[0],dy=B[1]-A[1];let t=0;if(dx!==0||dy!==0)t=Math.max(0,Math.min(1,((vert[0]-A[0])*dx+(vert[1]-A[1])*dy)/(dx*dx+dy*dy)));const proj=[A[0]+t*dx,A[1]+t*dy];if(hav(vert,proj)<5){addEdge(vert,other[s]);addEdge(vert,other[s+1]);}}}}}

console.log('Graph nodes:', graph.size);

// P. Lana St. corridor nodes — street diagonal from SW to NE
const lanaNodes = [];
for(const [k,c] of coords){
  const relLng = c[0]-125.12350;
  const expectedLat = 8.15607 + relLng*1.103;
  const latDiff = Math.abs(c[1]-expectedLat);
  if(latDiff < 0.00020 && c[0] >= 125.1234 && c[0] <= 125.1246 && c[1] >= 8.1558 && c[1] <= 8.1573){
    lanaNodes.push({key:k, coord:c, edges:graph.get(k).length});
  }
}
lanaNodes.sort((a,b) => a.coord[0]-b.coord[0]);

console.log('\nNodes along P. Lana St. corridor (sorted SW->NE):');
lanaNodes.forEach((n,i) => {
  const neighbors = graph.get(n.key);
  const nbDescs = neighbors.map(nb => {
    const nc = coords.get(nb.key);
    return '[' + nc[0].toFixed(5) + ',' + nc[1].toFixed(5) + '](' + nb.weight.toFixed(1) + 'm)';
  });
  console.log('  ' + i + ': [' + n.coord[0].toFixed(6) + ',' + n.coord[1].toFixed(6) + '] edges=' + n.edges);
});

console.log('\nGaps between consecutive P. Lana corridor nodes:');
for(let i=0;i<lanaNodes.length-1;i++){
  const d = hav(lanaNodes[i].coord, lanaNodes[i+1].coord);
  const connected = graph.get(lanaNodes[i].key).some(e => e.key === lanaNodes[i+1].key);
  const marker = d > 10 && !connected ? ' *** DISCONNECTED GAP ***' : '';
  console.log('  ' + i + ' -> ' + (i+1) + ': ' + d.toFixed(1) + 'm ' + (connected ? 'CONNECTED' : 'not directly connected') + marker);
}

// A* search
function nearest(lng, lat) {
  let best = null, bestD = Infinity;
  for (const [k, c] of coords) {
    const d = hav([lng, lat], c);
    if (d < bestD) { bestD = d; best = k; }
  }
  return { key: best, coord: coords.get(best), dist: bestD };
}

function astar(startK, endK) {
  if (startK === endK) return { path: [coords.get(startK)], dist: 0 };
  const goalC = coords.get(endK);
  const gScore = new Map([[startK, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const open = [[startK, hav(coords.get(startK), goalC)]];
  while (open.length) {
    open.sort((a,b) => a[1] - b[1]);
    const [curK] = open.shift();
    if (curK === endK) {
      const path = [];
      let k = endK;
      while (k) { path.push(coords.get(k)); k = cameFrom.get(k); }
      path.reverse();
      let totalDist = 0;
      for (let i = 0; i < path.length - 1; i++) totalDist += hav(path[i], path[i+1]);
      return { path, dist: totalDist };
    }
    if (closed.has(curK)) continue;
    closed.add(curK);
    const curG = gScore.get(curK);
    for (const nb of (graph.get(curK) || [])) {
      if (closed.has(nb.key)) continue;
      const tentG = curG + nb.weight;
      if (tentG < (gScore.get(nb.key) ?? Infinity)) {
        gScore.set(nb.key, tentG);
        cameFrom.set(nb.key, curK);
        open.push([nb.key, tentG + hav(coords.get(nb.key), goalC)]);
      }
    }
  }
  return null;
}

// Buildings near P. Lana St.
const buildings = {
  'COT':      [125.12370801, 8.15658096],
  'NEW CAS':  [125.12365509, 8.15650215],
  'CAS':      [125.12396593, 8.15635698],
  'NEW Cafeteria': [125.12347550, 8.15634822],
  'COM':      [125.12314618, 8.15654148],
  'Auditorium': [125.12440538, 8.15665576],
  'Museum':   [125.12449045, 8.15645884],
  'CPAG':     [125.12465760, 8.15667174],
  'FINANCE':  [125.12447452, 8.15695463],
  'ESL':      [125.12417750, 8.15713315],
  'SSL':      [125.12356882, 8.15700957],
  'Library':  [125.12458827, 8.15616895],
};

// Test routes from each building to COT and see which ones use P. Lana vs detour
console.log('\n=== Routes TO COT bldg. ===');
const cotNode = nearest(125.12370801, 8.15658096);
for (const [name, coord] of Object.entries(buildings)) {
  if (name === 'COT') continue;
  const sn = nearest(coord[0], coord[1]);
  const result = astar(sn.key, cotNode.key);
  if (result) {
    // Check if route goes through P. Lana area (lat ~8.156-8.157, straight path)
    // vs P.A. Ramos area (lat > 8.157)
    const maxLat = Math.max(...result.path.map(c => c[1]));
    const usesRamos = maxLat > 8.15710;
    console.log('  ' + name.padEnd(15) + '-> ' + result.dist.toFixed(1) + 'm, ' + result.path.length + ' nodes' + (usesRamos ? ' [via P.A. Ramos - NORTH detour]' : ' [direct/P. Lana]'));
  } else {
    console.log('  ' + name + ' -> NO PATH');
  }
}

// Also test from common start points along P. Lana St. to various destinations
console.log('\n=== Routes FROM P. Lana St. midpoint to nearby buildings ===');
const lanaStart = [125.12400, 8.15660]; // mid P. Lana
const lsn = nearest(lanaStart[0], lanaStart[1]);
console.log('Start node: [' + lsn.coord[0].toFixed(5) + ',' + lsn.coord[1].toFixed(5) + '] (' + lsn.dist.toFixed(1) + 'm from target)');
for (const [name, coord] of Object.entries(buildings)) {
  const en = nearest(coord[0], coord[1]);
  const result = astar(lsn.key, en.key);
  if (result) {
    console.log('  -> ' + name.padEnd(15) + result.dist.toFixed(1) + 'm, ' + result.path.length + ' nodes');
  }
}
