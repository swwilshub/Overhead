// People, places and text that the generated world data doesn't cover: applicant names, street and company names.
// Jobs, departments and traits come from data/world.json via src/gen/data.js; this module adds the lookups the
// simulation uses.
import { JOBS as JOB_LIST, DEPTS as DEPT_LIST, ATTR_GROUPS, DRAWBACK_TRAITS } from '../gen/data.js';

export { ATTR_GROUPS, JOB_LIST, DEPT_LIST };
export const ATTRS = ATTR_GROUPS.flatMap(([, a]) => a.map(([k]) => k));
export const ATTR_LABEL = Object.fromEntries(ATTR_GROUPS.flatMap(([, a]) => a));
// Traits where a high score is a problem, not a strength.
export const NEGATIVE_ATTRS = new Set(DRAWBACK_TRAITS);

// Jobs by key. collar 'white' needs a desk; 'blue' works on the floor. pay is a multiple of the city's average
// salary, w the trait weights that make up job fit, roles what the simulation lets the job do.
export const JOBS = Object.fromEntries(JOB_LIST.map(j => [j.key, j]));
export const DEPTS = Object.fromEntries(DEPT_LIST.map(d => [d.key, d]));
export const deptName = key => DEPTS[key]?.name ?? key;
export const deptColor = key => DEPTS[key]?.color ?? '#8a929a';
export const hasRole = (e, role) => !!JOBS[e.job]?.roles.includes(role);
// the first job (in list order) that has a role, e.g. the job to suggest hiring for it
export const jobFor = role => JOB_LIST.find(j => j.roles.includes(role) && !j.lead) || JOB_LIST.find(j => j.roles.includes(role));
// floor jobs that can run a production machine or work in a cell
export const RUNS_MACHINES = ['operator', 'foreman', 'researcher'];
export const canRunMachine = e => RUNS_MACHINES.some(r => hasRole(e, r));
// "a" or "an" before a job title (or any noun), worked out from how the word starts so no text hard-codes the
// article: aOrAn('Machine Operator') is "a Machine Operator", aOrAn('engineer', true) is "An engineer". Words that
// start with a vowel letter but a consonant sound (unit, user, one, Euro) take "a"; a silent h (hour, honest) takes "an".
export function aOrAn(word, capital = false) {
  const w = String(word).trim();
  const an = /^(hour|honest|honou?r|heir)/i.test(w) || (/^[aeiou]/i.test(w) && !/^(u[nr]i|us[eu]|uti|eu|one\b|once\b)/i.test(w));
  const art = an ? 'an' : 'a';
  return `${capital ? 'A' + art.slice(1) : art} ${w}`;
}

export const FIRST_M = 'James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Zachary Peter Kyle Ethan Walter Noah Jeremy Christian Keith Roger Terry Gerald Harold Sean Austin Carl Arthur Lawrence Dylan Jesse Jordan Bryan Billy Joe Bruce Gabriel Logan Albert Willie Alan Juan Wayne Elijah Randy Roy Vincent Ralph Eugene Russell Bobby Mason Philip Louis Marcus Darnell Hector Luis Omar Rafael Kenji Hiro Ravi Arjun Tomas Andre Malik Desmond Felix Ivan Mateo'.split(' ');
export const FIRST_F = 'Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle Carol Amanda Dorothy Melissa Deborah Stephanie Rebecca Sharon Laura Cynthia Kathleen Amy Angela Shirley Anna Brenda Pamela Emma Nicole Helen Samantha Katherine Christine Debra Rachel Carolyn Janet Catherine Maria Heather Diane Ruth Julie Olivia Joyce Virginia Victoria Kelly Lauren Christina Joan Evelyn Judith Megan Andrea Cheryl Hannah Jacqueline Martha Gloria Teresa Ann Sara Madison Frances Kathryn Janice Jean Abigail Alice Judy Sophia Grace Denise Amber Doris Marilyn Danielle Beverly Isabella Theresa Diana Natalie Brittany Charlotte Marie Kayla Alexis Lori Rosa Yolanda Keisha Mei Priya Aiko Lucia Ingrid Nadia Fatima Elena Monique Tamika Leah Simone'.split(' ');
export const LAST = 'Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Gonzales Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton Graham Reynolds Griffin Wallace Moreno West Cole Hayes Bryant Herrera Gibson Ellis Tran Medina Aguilar Stevens Murray Ford Castro Marshall Owens Harrison Fernandez McDonald Woods Washington Kennedy Wells Vargas Henry Chen Freeman Webb Tucker Guzman Burns Crawford Olson Simpson Porter Hunter Gordon Mendez Silva Shaw Snyder Mason Dixon Munoz Hunt Hicks Holmes Palmer Wagner Black Robertson Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Garza Daniels Ferguson Nichols Stephens Soto Weaver Ryan Gardner Payne Grant Dunn Kowalski Lindqvist Okafor Yamamoto Novak Petrov Haddad Mbeki Larsen'.split(' ');
export const STREETS = 'Main,Industrial,Commerce,Foundry,Mill,Factory,Railroad,Depot,Harbor,Canal,Lincoln,Washington,Franklin,Jefferson,Madison,Monroe,Jackson,Grant,Elm,Oak,Maple,Cedar,Pine,Birch,Walnut,Chestnut,Spruce,Willow,Hickory,Poplar,Front,Water,River,Bridge,Market,Union,Liberty,Central,Park,Lake,Hill,Ridge,Valley,Meadow,Prairie,Summit,Forge,Anvil,Kiln,Quarry,Warehouse,Freight,Dock,Pier,Terminal,Spur,Junction,Crossing,Mercantile,Enterprise'.split(',');
export const STREET_TYPES = ['St.', 'Ave.', 'Blvd.', 'Rd.', 'Way', 'Pkwy.'];
export const FIRM_SUFFIX = ['Industries', 'Manufacturing', 'Mfg. Co.', 'Works', 'Products', 'Supply', 'Fabrication', 'Corp.', '& Sons', 'Brothers', 'Holdings', 'Technologies', 'Assembly', 'Materials', 'Components'];
export const FIRM_PREFIX = ['Acme', 'Apex', 'Summit', 'Keystone', 'Liberty', 'Pioneer', 'Frontier', 'Allied', 'United', 'Consolidated', 'Continental', 'Midland', 'Great Lakes', 'Pacific', 'Atlantic', 'Northern', 'Southern', 'Tri-State', 'Metro', 'Ironside', 'Bluestone', 'Redwood', 'Silver Creek', 'Twin Rivers', 'Copperline', 'Starlight', 'Bright Star', 'Polar', 'Granite', 'Beacon', 'Harbor', 'Ridgeway', 'Crown', 'Eagle', 'Falcon', 'Mustang', 'Sterling', 'Vanguard', 'Zenith', 'Orbit'];

