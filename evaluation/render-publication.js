'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const svgToPDF = require('svg-to-pdfkit');
const { Resvg } = require('@resvg/resvg-js');
const { dpiPNG } = require('./publication');
const normalFont = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(fs.existsSync);
const boldFont = ['C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find(fs.existsSync);
function pdf(figures, file, run) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, info: { Title: `ALAGAD evaluation ${run.run_id}`, Subject: 'Intent recognition and separate factual answer review', Author: 'ALAGAD' } });
    const stream = fs.createWriteStream(file);
    stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject); doc.pipe(stream);
    for (const f of figures) {
      doc.addPage({ size: [f.width * 0.6, f.height * 0.6], margin: 0 });
      doc.save().scale(0.6);
      svgToPDF(doc, f.svg, 0, 0, { width: f.width, height: f.height, assumePt: true,
        fontCallback: (_family, bold) => (bold ? boldFont : normalFont) || (bold ? 'Helvetica-Bold' : 'Helvetica') });
      doc.restore();
    }
    doc.end();
  });
}
async function renderPublication(figures, output, run) {
  for (const f of figures) {
    const png = new Resvg(f.svg, { background: 'white', fitTo: { mode: 'width', value: Math.ceil(f.width * 2.5) },
      font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng();
    fs.writeFileSync(path.join(output, `${f.id}.png`), dpiPNG(png));
    await pdf([f], path.join(output, `${f.id}.pdf`), run);
  }
  await pdf(figures, path.join(output, 'complete-report.pdf'), run);
}
module.exports = { renderPublication, dpiPNG };
