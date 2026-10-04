// Remove procedure labels, never factual values such as fees or processing times.
function cleanProcessActions(steps) {
  if (!Array.isArray(steps)) return [];
  const entries = steps.filter(step => typeof step === 'string')
    .flatMap(step => step.split(/\r?\n/))
    .map(step => step.trim().replace(/^[•*\-]\s*/, '')
      .replace(/^(?:step\s*\d+|\d+(?:\.\d+)*[.)]|[a-z][.)])\s*[:.)-]?\s*/i, '').trim())
    .filter(Boolean);
  const clientSteps = entries.filter(step => /^clients?\s*steps?\s*:/i.test(step));
  return (clientSteps.length ? clientSteps : entries)
    .filter(step => !/^(?:agency\s*actions?|office\s+or\s+division|classification|type\s+of\s+transaction|who\s+may\s+avail|fees?\s+to\s+be\s+paid|processing\s+time|person\s+responsible)\s*:/i.test(step))
    .map(step => step.replace(/^clients?\s*steps?\s*:\s*/i, '').trim())
    .filter(Boolean);
}

function formatServiceProcess(name, steps, language = 'english') {
  const actions = cleanProcessActions(steps);
  if (!actions.length) return '';
  const wording = {
    english: ['To complete', 'First', 'Next', 'Finally', 'follow these steps'],
    tagalog: ['Para makumpleto ang', 'Una', 'Pagkatapos', 'Panghuli', 'sundin ang mga hakbang na ito'],
    cebuano: ['Aron makompleto ang', 'Una', 'Sunod', 'Sa kataposan', 'sunda kini nga mga lakang'],
  }[language] || ['To complete', 'First', 'Next', 'Finally', 'follow these steps'];
  const sentences = actions.map((action, index) => {
    const text = action.replace(/[.;]+$/, '');
    const clause = /^[A-Z]{2,}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
    const transition = index === 0 ? wording[1] : index === actions.length - 1 ? wording[3] : wording[2];
    return actions.length === 1 ? `${clause}.` : `${transition}, ${clause}.`;
  });
  return `${wording[0]} ${name}, ${actions.length === 1
    ? sentences[0]
    : `${wording[4]}: ${sentences.join(' ')}`}`;
}

module.exports = { cleanProcessActions, formatServiceProcess };
