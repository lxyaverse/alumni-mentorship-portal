const Database = require('better-sqlite3'), bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path');
const dataDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const defaultDb = path.join(dataDir, 'portal.db');
const db = new Database(process.env.DB_FILE || defaultDb);
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,pw TEXT NOT NULL,role TEXT NOT NULL,
  active INTEGER DEFAULT 1,status TEXT,why TEXT,grad INTEGER,degree TEXT,org TEXT);
CREATE TABLE IF NOT EXISTS profiles(uid TEXT PRIMARY KEY REFERENCES users(id),designation TEXT,org TEXT,industry TEXT,domain TEXT,expertise TEXT,
  years INTEGER,grad INTEGER,intro TEXT,avail TEXT DEFAULT 'Available',cap INTEGER DEFAULT 3,complete INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS cats(name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,sid TEXT NOT NULL REFERENCES users(id),mid TEXT NOT NULL REFERENCES users(id),topic TEXT,domain TEXT,
  msg TEXT,slot TEXT,status TEXT DEFAULT 'Pending',created INTEGER,responded INTEGER,reason TEXT);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,rid TEXT NOT NULL REFERENCES requests(id),date TEXT,time TEXT,dur INTEGER,link TEXT,
  status TEXT DEFAULT 'Scheduled',reason TEXT);
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,sid TEXT NOT NULL REFERENCES sessions(id),stu TEXT,mid TEXT,rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,t INTEGER,UNIQUE(sid,stu));
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,uid TEXT,msg TEXT,read INTEGER DEFAULT 0,t INTEGER);
CREATE TABLE IF NOT EXISTS audit(t INTEGER,actor TEXT,action TEXT);
`);
function seed(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const pw = bcrypt.hashSync('demo123', 10);
  ['Machine Learning','Web Development','Cybersecurity','Higher Studies','Product Management','Data Science'].forEach(c => db.prepare('INSERT OR IGNORE INTO cats VALUES(?)').run(c));
  const u = db.prepare('INSERT OR IGNORE INTO users(id,name,email,pw,role,status) VALUES(?,?,?,?,?,?)');
  [['s1','Aakansha Garg','student@demo.com','student'],['s2','Sumit Sharma','student2@demo.com','student'],['m1','Rohit Verma','mentor@demo.com','alumnus','verified'],
   ['m2','Neha Kapoor','neha@demo.com','alumnus','verified'],['m3','Arjun Rao','arjun@demo.com','alumnus','verified'],['m4','Pankaj Jain','pending@demo.com','alumnus','pending'],
   ['c1','Meera (Coordinator)','coord@demo.com','coordinator'],['a1','Ravi (Admin)','admin@demo.com','admin']].forEach(([i,n,e,r,s]) => u.run(i,n,e,pw,r,s||null));
  const p = db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,1)');
  p.run('m1','SDE II','Google','Software','Machine Learning','Deep Learning, MLOps',6,2020,'ML engineer helping students break into AI.','Available',2);
  p.run('m2','Product Manager','Microsoft','Software','Product Management','Roadmaps, Interviews',8,2018,'PM mentor for career switches.','Limited',3);
  p.run('m3','Security Engineer','CrowdStrike','Security','Cybersecurity','AppSec, Threat Modelling',5,2021,'Security careers and CTF prep.','Available',4);
}
seed(false);
module.exports = db; module.exports.seed = seed;
