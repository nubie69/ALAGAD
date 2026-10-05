// Room identifiers must retain their digits. Semantic similarity and typo
// correction cannot safely distinguish, for example, COMLAB 1 from COMLAB 10.
const normalizeRoomName = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/([a-z])(\d)/g, '$1 $2')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

function roomNames(record) {
  const name = String(record.canonical_name || '');
  // Parenthesized abbreviations come from the stored name, not guessed aliases.
  const names = [name, name.replace(/\([^)]*\)/g, ' '),
    ...Array.from(name.matchAll(/\(([^)]+)\)/g), match => match[1])]
    .map(normalizeRoomName).filter(Boolean);
  // "Room 204" is an identifier explicitly present in a longer stored name.
  for (const value of [...names]) {
    const identifier = value.match(/\b(?:room|kwarto|silid) \d+$/);
    if (identifier) names.push(identifier[0]);
  }
  return [...new Set(names)];
}

function containsName(query, name) {
  // A following number means a more specific room, not this shorter name.
  const position = ` ${query} `.indexOf(` ${name} `);
  if (position < 0) return false;
  const remainder = ` ${query} `.slice(position + name.length + 2);
  return !/^\d+\b/.test(remainder);
}

function resolveRequestedRoom(query, records = []) {
  const text = normalizeRoomName(query);
  const rooms = records.filter(record => String(record.type).toLowerCase() === 'room');
  let matches = rooms.filter(record => roomNames(record).some(name => containsName(text, name)));
  const numberedFamilies = rooms.flatMap(roomNames)
    .filter(name => / \d+$/.test(name)).map(name => name.replace(/ \d+$/, ''));
  const explicitNumber = /\b(?:room|kwarto|silid|laboratory|lab|classroom) (?:[a-z]+ )?\d+\b/.test(text)
    || numberedFamilies.some(family => new RegExp(`(?:^| )${family} \\d+(?: |$)`).test(text))
    || /\b[a-z]+\d*[-#]\d+\b/i.test(String(query || ''));
  let families = numberedFamilies.filter(family => family.length > 2
    && !/^(?:room|kwarto|silid)$/.test(family) && containsName(text, family));
  const longestFamily = Math.max(0, ...families.map(family => family.length));
  families = families.filter(family => family.length === longestFamily);
  if (!matches.length && !explicitNumber && families.length) {
    matches = rooms.filter(record => roomNames(record)
      .some(name => families.some(family => name.startsWith(`${family} `))));
  }
  const requested = matches.length > 0 || explicitNumber || /\b(?:room|kwarto|silid)\b/.test(text);
  // If the query names a building, keep its rooms only. Do not silently fall
  // back to the same room number in a different building.
  const buildingNames = [...new Set(records.map(record => normalizeRoomName(record.assigned_building)).filter(Boolean))];
  const buildingMatches = buildingNames.flatMap(name => [name, name.replace(/\s+(?:building|bldg)$/, '')]
    .filter(alias => alias && containsName(text, alias)).map(alias => ({ name, length: alias.length })));
  const longestBuilding = Math.max(0, ...buildingMatches.map(match => match.length));
  const buildings = buildingMatches.filter(match => match.length === longestBuilding).map(match => match.name);
  if (buildings.length) {
    matches = matches.filter(record => buildings.includes(normalizeRoomName(record.assigned_building)));
  }
  return { requested, matches };
}

module.exports = { resolveRequestedRoom, normalizeRoomName };
