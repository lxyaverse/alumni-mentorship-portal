const Database = require('better-sqlite3'), bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path');
const dataDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const defaultDb = path.join(dataDir, 'portal.db');
const db = new Database(process.env.DB_FILE || defaultDb);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Core tables (original) ----
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,pw TEXT NOT NULL,role TEXT NOT NULL,
  active INTEGER DEFAULT 1,status TEXT,why TEXT,grad INTEGER,degree TEXT,org TEXT);
CREATE TABLE IF NOT EXISTS profiles(uid TEXT PRIMARY KEY REFERENCES users(id),designation TEXT,org TEXT,industry TEXT,domain TEXT,expertise TEXT,
  years INTEGER,grad INTEGER,intro TEXT,avail TEXT DEFAULT 'Available',cap INTEGER DEFAULT 3,complete INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS cats(name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,sid TEXT NOT NULL REFERENCES users(id),mid TEXT NOT NULL REFERENCES users(id),
  topic TEXT,domain TEXT,msg TEXT,slot TEXT,status TEXT DEFAULT 'Pending',created INTEGER,responded INTEGER,reason TEXT);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,rid TEXT NOT NULL REFERENCES requests(id),date TEXT,time TEXT,dur INTEGER,link TEXT,
  status TEXT DEFAULT 'Scheduled',reason TEXT);
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,sid TEXT NOT NULL REFERENCES sessions(id),stu TEXT,mid TEXT,
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),comment TEXT,t INTEGER,UNIQUE(sid,stu));
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,uid TEXT,msg TEXT,read INTEGER DEFAULT 0,t INTEGER);
CREATE TABLE IF NOT EXISTS audit(t INTEGER,actor TEXT,action TEXT);
`);

// ---- Traceability tables (new – migration safe) ----
db.exec(`
CREATE TABLE IF NOT EXISTS requirements(
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN('FR','NFR','BR')),
  title TEXT,
  description TEXT,
  priority TEXT,
  category TEXT
);
CREATE TABLE IF NOT EXISTS usecases(
  id TEXT PRIMARY KEY,
  name TEXT,
  primary_actor TEXT,
  secondary_actors TEXT,
  preconditions TEXT,
  main_flow TEXT,
  alt_flows TEXT,
  postconditions TEXT,
  related_fr TEXT,
  related_br TEXT,
  related_nfr TEXT
);
CREATE TABLE IF NOT EXISTS screens(
  id TEXT PRIMARY KEY,
  route TEXT,
  title TEXT,
  roles TEXT
);
CREATE TABLE IF NOT EXISTS trace_links(
  screen_id TEXT REFERENCES screens(id),
  element_selector TEXT,
  ref_type TEXT,
  ref_id TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS shortcut_events(
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  key_combo TEXT,
  action TEXT,
  screen_id TEXT,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS email_outbox(
  id TEXT PRIMARY KEY,
  to_email TEXT,
  subject TEXT,
  body TEXT,
  sent INTEGER DEFAULT 0,
  created INTEGER
);
`);

// ---- Indexes ----
db.exec(`
CREATE INDEX IF NOT EXISTS idx_requests_sid ON requests(sid);
CREATE INDEX IF NOT EXISTS idx_requests_mid ON requests(mid);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_sessions_rid ON sessions(rid);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_notes_uid ON notes(uid);
CREATE INDEX IF NOT EXISTS idx_shortcut_events_ts ON shortcut_events(ts);
CREATE INDEX IF NOT EXISTS idx_trace_links_screen ON trace_links(screen_id);
CREATE INDEX IF NOT EXISTS idx_trace_links_ref ON trace_links(ref_id);
`);

// ---- Seed ----
function seed(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM users').get().c) return;

  // Wipe trace tables for clean reload
  db.exec(`
    DELETE FROM trace_links;
    DELETE FROM screens;
    DELETE FROM usecases;
    DELETE FROM requirements;
    DELETE FROM email_outbox;
    DELETE FROM shortcut_events;
  `);

  const pw = bcrypt.hashSync('demo123', 10);

  // Categories (6 domains)
  ['Machine Learning','Web Development','Cybersecurity','Higher Studies','Product Management','Data Science']
    .forEach(c => db.prepare('INSERT OR IGNORE INTO cats VALUES(?)').run(c));

  // Users
  const u = db.prepare('INSERT OR IGNORE INTO users(id,name,email,pw,role,status) VALUES(?,?,?,?,?,?)');
  [
    ['s1','Aakansha Garg','student@demo.com','student',null],
    ['s2','Sumit Sharma','student2@demo.com','student',null],
    ['s3','Tanishka Khandelwal','student3@demo.com','student',null],
    ['m1','Rohit Verma','mentor@demo.com','alumnus','verified'],
    ['m2','Neha Kapoor','neha@demo.com','alumnus','verified'],
    ['m3','Arjun Rao','arjun@demo.com','alumnus','verified'],
    ['m4','Priya Singh','priya@demo.com','alumnus','verified'],
    ['m5','Vikram Nair','vikram@demo.com','alumnus','verified'],
    ['m6','Deepa Joshi','deepa@demo.com','alumnus','verified'],
    ['m7','Pankaj Jain','pending@demo.com','alumnus','pending'],
    ['c1','Meera Coordinator','coord@demo.com','coordinator',null],
    ['a1','Ravi Admin','admin@demo.com','admin',null],
  ].forEach(([id,name,email,role,status]) => u.run(id,name,email,pw,role,status));

  // Mentor profiles (6 domains)
  const p = db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,1)');
  p.run('m1','SDE II','Google','Software','Machine Learning','Deep Learning, MLOps, TensorFlow',6,2020,'ML engineer at Google helping students break into AI and ML roles.','Available',2);
  p.run('m2','Product Manager','Microsoft','Software','Product Management','Roadmaps, Interviews, Agile, User Research',8,2018,'PM at Microsoft. I help students transition into product roles from engineering.','Limited',3);
  p.run('m3','Security Engineer','CrowdStrike','Security','Cybersecurity','AppSec, Threat Modelling, CTF, Penetration Testing',5,2021,'Security careers and CTF prep. OSCP certified.','Available',4);
  p.run('m4','PhD Scholar','IIT Delhi','Academia','Higher Studies','GRE, GATE, Research, PhD Applications',3,2022,'Helping undergrads navigate grad school applications and research opportunities.','Available',5);
  p.run('m5','Data Scientist','Amazon','Data','Data Science','Python, Statistics, SQL, Machine Learning',7,2019,'Data Scientist at Amazon. Analytics and ML in production.','Limited',2);
  p.run('m6','Senior Developer','Flipkart','Software','Web Development','React, Node.js, System Design, DSA',4,2022,'Full-stack engineer. SDE interview prep and system design coaching.','Available',3);

  const nid = p => p + Math.random().toString(36).slice(2, 10);
  const now = Date.now();
  const DAY = 864e5;

  // Requests in every state
  const ins_req = db.prepare('INSERT OR IGNORE INTO requests(id,sid,mid,topic,domain,msg,slot,status,created,responded,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  ins_req.run('r1','s1','m1','ML Career Guidance','Machine Learning','I want to understand how to build a career in ML. Looking for guidance on what to learn.','Sat 6 PM IST','Accepted',now-10*DAY,now-9*DAY,null);
  ins_req.run('r2','s1','m2','Product Management Switch','Product Management','As a CS student, how do I break into PM roles post graduation?','Sun 11 AM IST','Pending',now-2*DAY,null,null);
  ins_req.run('r3','s1','m3','CTF and Security Careers','Cybersecurity','I want to participate in CTFs and eventually work in AppSec.','Mon 7 PM IST','Declined',now-5*DAY,now-4*DAY,'I am currently at capacity for new mentees.');
  ins_req.run('r4','s2','m1','Deep Learning Projects','Machine Learning','Need help picking deep learning projects for my portfolio.','Fri 4 PM IST','Referred',now-3*DAY,now-2*DAY,null);
  ins_req.run('r5','s3','m6','SDE Interview Prep','Web Development','I have campus placements in 6 months. Need a structured prep plan.','Sat 10 AM IST','Accepted',now-8*DAY,now-7*DAY,null);
  ins_req.run('r6','s2','m4','MS Applications','Higher Studies','Applying for MS in CS in US. Need help with SOP and college selection.','Sun 5 PM IST','Pending',now-DAY,null,null);
  // Expired request (older than 7 days, still Pending)
  ins_req.run('r7','s3','m5','Data Science Roadmap','Data Science','How do I build a strong data science portfolio?','Sat 3 PM IST','Expired',now-10*DAY,null,null);
  // Withdrawn
  ins_req.run('r8','s1','m6','Web Dev Advice','Web Development','I changed my mind and withdrew this request.','Mon 8 PM IST','Withdrawn',now-6*DAY,now-5*DAY,null);

  // Sessions
  const ins_ses = db.prepare('INSERT OR IGNORE INTO sessions(id,rid,date,time,dur,link,status,reason) VALUES(?,?,?,?,?,?,?,?)');
  const futDate = new Date(now + 3*DAY).toISOString().slice(0,10);
  const pastDate1 = new Date(now - 7*DAY).toISOString().slice(0,10);
  const pastDate2 = new Date(now - 14*DAY).toISOString().slice(0,10);
  ins_ses.run('ses1','r1',pastDate1,'18:00',60,'https://meet.google.com/abc-defg-hij','Completed',null);
  ins_ses.run('ses2','r1',pastDate2,'18:00',45,'https://meet.google.com/xyz-uvwx-yz','Completed',null);
  ins_ses.run('ses3','r5',futDate,'10:00',60,'https://meet.google.com/mno-pqrs-tuv','Scheduled',null);
  ins_ses.run('ses4','r1',new Date(now-20*DAY).toISOString().slice(0,10),'18:00',30,'https://meet.google.com/can-cell-ed1','Cancelled','Student had an emergency.');

  // Feedback
  const ins_fb = db.prepare('INSERT OR IGNORE INTO feedback(id,sid,stu,mid,rating,comment,t) VALUES(?,?,?,?,?,?,?)');
  ins_fb.run('fb1','ses1','s1','m1',5,'Excellent session. Very practical advice on ML career path.',now-6*DAY);
  ins_fb.run('fb2','ses2','s1','m1',4,'Good session on project selection.',now-13*DAY);

  // Notifications
  const ins_note = db.prepare('INSERT OR IGNORE INTO notes(id,uid,msg,read,t) VALUES(?,?,?,?,?)');
  ins_note.run(nid('n'),'s1','Your request to Rohit Verma was accepted.',1,now-9*DAY);
  ins_note.run(nid('n'),'s1','Your request to Arjun Rao was declined. Reason: I am currently at capacity.',1,now-4*DAY);
  ins_note.run(nid('n'),'s1','Session with Rohit Verma is scheduled for '+futDate+' at 10:00.',0,now-6*DAY);
  ins_note.run(nid('n'),'m1','New mentorship request from Aakansha Garg: ML Career Guidance.',1,now-10*DAY);
  ins_note.run(nid('n'),'m1','New mentorship request from Sumit Sharma: Deep Learning Projects.',0,now-3*DAY);
  ins_note.run(nid('n'),'c1','A mentorship request has been referred to you for reassignment.',0,now-2*DAY);

  // Audit
  const ins_aud = db.prepare('INSERT OR IGNORE INTO audit(t,actor,action) VALUES(?,?,?)');
  ins_aud.run(now-9*DAY,'Meera Coordinator','Verified alumnus Rohit Verma');
  ins_aud.run(now-8*DAY,'Meera Coordinator','Verified alumnus Neha Kapoor');
  ins_aud.run(now-7*DAY,'Meera Coordinator','Verified alumnus Arjun Rao');
  ins_aud.run(now-6*DAY,'Meera Coordinator','Verified alumnus Priya Singh');
  ins_aud.run(now-5*DAY,'Meera Coordinator','Verified alumnus Vikram Nair');
  ins_aud.run(now-4*DAY,'Meera Coordinator','Verified alumnus Deepa Joshi');
  ins_aud.run(now-DAY,'Ravi Admin','Changed role of m7 to alumnus');

  // ---- Load requirements.json into DB ----
  const reqFile = path.join(__dirname, 'data', 'requirements.json');
  if (fs.existsSync(reqFile)) {
    const reqData = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
    const ins_req2 = db.prepare('INSERT OR IGNORE INTO requirements(id,type,title,description,priority,category) VALUES(?,?,?,?,?,?)');
    (reqData.requirements || []).forEach(r => ins_req2.run(r.id,r.type,r.title,r.description,r.priority,r.category));

    const ins_uc = db.prepare('INSERT OR IGNORE INTO usecases(id,name,primary_actor,secondary_actors,preconditions,main_flow,alt_flows,postconditions,related_fr,related_br,related_nfr) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    (reqData.usecases || []).forEach(u => ins_uc.run(u.id,u.name,u.primaryActor,JSON.stringify(u.secondaryActors||[]),JSON.stringify(u.preconditions||[]),JSON.stringify(u.mainFlow||[]),JSON.stringify(u.altFlows||[]),JSON.stringify(u.postconditions||[]),JSON.stringify(u.relatedFR||[]),JSON.stringify(u.relatedBR||[]),JSON.stringify(u.relatedNFR||[])));

    const ins_sc = db.prepare('INSERT OR IGNORE INTO screens(id,route,title,roles) VALUES(?,?,?,?)');
    (reqData.screens || []).forEach(s => ins_sc.run(s.id,s.route,s.title,JSON.stringify(s.roles||[])));

    const ins_tl = db.prepare('INSERT INTO trace_links(screen_id,element_selector,ref_type,ref_id,note) VALUES(?,?,?,?,?)');
    (reqData.links || []).forEach(l => ins_tl.run(l.screen,l.selector||null,l.type,l.id,l.note||null));
  }

  console.log('✓ Database seeded successfully.');
}

seed(false);
module.exports = db;
module.exports.seed = seed;
