import { Client } from "pg";
const id = process.argv[2];
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let last = "";
for (let i = 0; i < 60; i++) {
  const t = await c.query(
    `select task_type, status from public.pipeline_tasks
      where subject_id=$1 and status <> 'waiting' order by created_at`, [id]);
  const line = t.rows.map(r => `${r.task_type}:${r.status}`).join(" | ");
  if (line !== last) { console.log(`[${i*15}s] ${line}`); last = line; }
  const active = t.rows.some(r => r.status === 'ready' || r.status === 'running');
  if (!active && i > 1) { console.log("no active tasks left"); break; }
  await new Promise(r => setTimeout(r, 15000));
}
await c.end();
