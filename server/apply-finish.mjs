import {neon} from '@neondatabase/serverless';
import {readFileSync} from 'node:fs';
const sql=neon(process.env.DATABASE_URL);
const source=readFileSync(new URL('./session-finish.sql',import.meta.url),'utf8');
const statements=source.match(/(?:[^;$]|\$(?!\$)|\$\$[\s\S]*?\$\$)+;/g).map(s=>s.trim().replace(/;$/,''));
await sql.transaction(statements.map(s=>sql.query(s,[])));
console.log('Session finishing migration applied.');
