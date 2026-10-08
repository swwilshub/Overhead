#!/usr/bin/env node
// Fills data/world.json "cities" from US Census Bureau files (public domain; see data/SOURCES.md).
// Needs the network, so it is run by hand when the city list changes; the build only reads world.json.
//   node tools/fetch_cities.mjs              download the files, then update world.json
//   node tools/fetch_cities.mjs --dir DIR    use files already downloaded to DIR (unzipped gazetteer is fine)
import fs from 'fs'; import path from 'path'; import zlib from 'zlib';

const SRC = {
  places: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv',
  metros: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/metro/totals/cbsa-est2024-alldata.csv',
  gazetteer: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_place_national.zip',
};
// [name shown in the game, state, Census place name, Census metro area (CBSA) name]
const CITIES = [
  ['Akron', 'OH', 'Akron city', 'Akron, OH'],
  ['Albuquerque', 'NM', 'Albuquerque city', 'Albuquerque, NM'],
  ['Allentown', 'PA', 'Allentown city', 'Allentown-Bethlehem-Easton, PA-NJ'],
  ['Atlanta', 'GA', 'Atlanta city', 'Atlanta-Sandy Springs-Roswell, GA'],
  ['Birmingham', 'AL', 'Birmingham city', 'Birmingham, AL'],
  ['Boise', 'ID', 'Boise City city', 'Boise City, ID'],
  ['Buffalo', 'NY', 'Buffalo city', 'Buffalo-Cheektowaga, NY'],
  ['Charlotte', 'NC', 'Charlotte city', 'Charlotte-Concord-Gastonia, NC-SC'],
  ['Chattanooga', 'TN', 'Chattanooga city', 'Chattanooga, TN-GA'],
  ['Chicago', 'IL', 'Chicago city', 'Chicago-Naperville-Elgin, IL-IN'],
  ['Cleveland', 'OH', 'Cleveland city', 'Cleveland, OH'],
  ['Dallas', 'TX', 'Dallas city', 'Dallas-Fort Worth-Arlington, TX'],
  ['Dayton', 'OH', 'Dayton city', 'Dayton-Kettering-Beavercreek, OH'],
  ['Denver', 'CO', 'Denver city', 'Denver-Aurora-Centennial, CO'],
  ['Des Moines', 'IA', 'Des Moines city', 'Des Moines-West Des Moines, IA'],
  ['Detroit', 'MI', 'Detroit city', 'Detroit-Warren-Dearborn, MI'],
  ['Fort Wayne', 'IN', 'Fort Wayne city', 'Fort Wayne, IN'],
  ['Grand Rapids', 'MI', 'Grand Rapids city', 'Grand Rapids-Wyoming-Kentwood, MI'],
  ['Greenville', 'SC', 'Greenville city', 'Greenville-Anderson-Greer, SC'],
  ['Houston', 'TX', 'Houston city', 'Houston-Pasadena-The Woodlands, TX'],
  ['Knoxville', 'TN', 'Knoxville city', 'Knoxville, TN'],
  ['Louisville', 'KY', 'Louisville/Jefferson County metro government (balance)', 'Louisville/Jefferson County, KY-IN'],
  ['Memphis', 'TN', 'Memphis city', 'Memphis, TN-MS-AR'],
  ['Milwaukee', 'WI', 'Milwaukee city', 'Milwaukee-Waukesha, WI'],
  ['Minneapolis', 'MN', 'Minneapolis city', 'Minneapolis-St. Paul-Bloomington, MN-WI'],
  ['Omaha', 'NE', 'Omaha city', 'Omaha, NE-IA'],
  ['Peoria', 'IL', 'Peoria city', 'Peoria, IL'],
  ['Philadelphia', 'PA', 'Philadelphia city', 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD'],
  ['Phoenix', 'AZ', 'Phoenix city', 'Phoenix-Mesa-Chandler, AZ'],
  ['Pittsburgh', 'PA', 'Pittsburgh city', 'Pittsburgh, PA'],
  ['Portland', 'OR', 'Portland city', 'Portland-Vancouver-Hillsboro, OR-WA'],
  ['Reno', 'NV', 'Reno city', 'Reno, NV'],
  ['Rockford', 'IL', 'Rockford city', 'Rockford, IL'],
  ['Sacramento', 'CA', 'Sacramento city', 'Sacramento-Roseville-Folsom, CA'],
  ['Spokane', 'WA', 'Spokane city', 'Spokane-Spokane Valley, WA'],
  ['Springfield', 'MO', 'Springfield city', 'Springfield, MO'],
  ['Toledo', 'OH', 'Toledo city', 'Toledo, OH'],
  ['Tucson', 'AZ', 'Tucson city', 'Tucson, AZ'],
  ['Tulsa', 'OK', 'Tulsa city', 'Tulsa, OK'],
  ['Wichita', 'KS', 'Wichita city', 'Wichita, KS'],
  ['Worcester', 'MA', 'Worcester city', 'Worcester, MA'],
  ['Youngstown', 'OH', 'Youngstown city', 'Youngstown-Warren, OH'],
];
const STATE = { AL: 'Alabama', AZ: 'Arizona', CA: 'California', CO: 'Colorado', GA: 'Georgia', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', NC: 'North Carolina', NE: 'Nebraska', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', SC: 'South Carolina', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', WA: 'Washington', WI: 'Wisconsin' };

const dirArg = process.argv.indexOf('--dir');
const dir = dirArg > 0 ? process.argv[dirArg + 1] : null;
async function get(key) {
  const name = path.basename(SRC[key]);
  if (dir) {
    const p = path.join(dir, name), txt = path.join(dir, name.replace(/\.zip$/, '.txt'));
    if (fs.existsSync(p)) return fs.readFileSync(p);
    if (fs.existsSync(txt)) return fs.readFileSync(txt);
    throw new Error(`missing ${p}`);
  }
  const r = await fetch(SRC[key]); if (!r.ok) throw new Error(`${SRC[key]}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
// the first file in a zip archive (enough for the single-file gazetteer download)
function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf; // already a plain file
  const method = buf.readUInt16LE(8), nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
  let size = buf.readUInt32LE(18);
  if (!size) { const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const cd = buf.readUInt32LE(eocd + 16); size = buf.readUInt32LE(cd + 20); }
  const start = 30 + nameLen + extraLen, data = buf.subarray(start, start + size);
  return method === 8 ? zlib.inflateRawSync(data) : data;
}
function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...rest] = rows; return rest.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

const places = csv((await get('places')).toString('latin1'));
const metros = csv((await get('metros')).toString('latin1')).filter(r => r.LSAD === 'Metropolitan Statistical Area');
const gaz = unzipFirst(await get('gazetteer')).toString('latin1').split(/\r?\n/).slice(1).map(l => l.split('\t').map(s => s.trim())).filter(r => r.length > 11);
const out = CITIES.map(([name, st, place, cbsa]) => {
  const p = places.find(r => (r.SUMLEV === '162' || r.SUMLEV === '170') && r.STNAME === STATE[st] && r.NAME === place);
  const m = metros.find(r => r.NAME === cbsa);
  const g = gaz.find(r => r[0] === st && r[3] === place);
  if (!p || !m || !g) throw new Error(`no match for ${name}, ${st}: place ${!!p}, metro ${!!m}, gazetteer ${!!g}`);
  return { name: `${name}, ${st}`, pop: +p.ESTIMATESBASE2020, metro: +m.ESTIMATESBASE2020, lat: +(+g[10]).toFixed(3), lon: +(+g[11]).toFixed(3), place, cbsa };
});
const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'world.json');
const text = fs.readFileSync(file, 'utf8');
JSON.parse(text); // must be valid before we touch it
// replace only the cities list, one city per line, so the hand-written rest of the file keeps its layout
const next = text.replace(/"cities": \[[\s\S]*?\]\n}\s*$/, () => `"cities": [\n${out.map(c => '    ' + JSON.stringify(c)).join(',\n')}\n  ]\n}\n`);
JSON.parse(next);
fs.writeFileSync(file, next);
console.log(`wrote ${out.length} cities to data/world.json`);
