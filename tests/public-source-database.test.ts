import { it, expect } from "vitest";
import { testDatabase } from "../scripts/test-database";

it("requires administrator approval and an exact public page; browsers cannot insert fetched pages", async () => {
  const db = await testDatabase();
  const owner="00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.com',now());
      select set_config('request.jwt.claims','{"role":"service_role"}',false);`);
    const insert = (url:string) => db.query(`insert into public.source_items(owner_id,source,external_id,canonical_url,title,permitted_excerpt,content_hash,expires_at)
      values($1,'public_web',$2,$2,'Public discussion','Reporting takes hours',$2,now()+interval '30 days')`,[owner,url]);
    await expect(insert("https://community.example.com/discussion")).rejects.toThrow("Source is not enabled");
    await db.exec(`update public.source_policies set enabled=true,automated_fetch=true,approval_status='approved',
      limits='{"pages":[{"url":"https://community.example.com/discussion","permission_confirmed":true,"public_discussion_confirmed":true}]}' where source_id='public_web';`);
    await expect(insert("https://community.example.com/other")).rejects.toThrow("Public page permission is missing");
    await insert("https://community.example.com/discussion");
    const expiry=(await db.query<{days:number}>("select extract(epoch from expires_at-now())/86400 as days from public.source_items")).rows[0].days;
    expect(Number(expiry)).toBeLessThanOrEqual(7);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,email:"owner@example.com",role:"authenticated"})]);
    await expect(db.exec("update public.source_policies set enabled=true where source_id='g2'")).rejects.toThrow();
    await expect(insert("https://community.example.com/discussion")).rejects.toThrow("Only permission-confirmed manual imports");
  } finally { await db.close(); }
},60000);
