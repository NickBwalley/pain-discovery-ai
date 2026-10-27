import { it, expect } from "vitest";
import { testDatabase } from "../scripts/test-database";

it("lets two confirmed accounts own separate workspaces and prevents cross-account access", async () => {
  const db=await testDatabase();
  const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002", unconfirmed="00000000-0000-4000-8000-000000000003";
  const pa="10000000-0000-4000-8000-000000000001",pb="10000000-0000-4000-8000-000000000002";
  const asUser=async (id:string,email:string) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email,role:"authenticated"})]);
  };
  try {
    await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${a}','alice@example.com',now(),'{"username":"Alice"}'),
      ('${b}','bob@example.com',now(),'{"username":"bob"}'),
      ('${unconfirmed}','unconfirmed@example.com',null,'{"username":"pending"}');`);
    const ensure=async()=> (await db.query<{ok:boolean}>("select public.ensure_user_profile() as ok")).rows[0].ok;
    await asUser(unconfirmed,"unconfirmed@example.com");
    expect(await ensure()).toBe(false);
    await expect(db.query("insert into public.research_projects(owner_id,title,mode) values($1,'Denied','niche')",[unconfirmed])).rejects.toThrow();
    for (const [id,email,project] of [[a,"alice@example.com",pa],[b,"bob@example.com",pb]]) {
      await asUser(id,email);
      expect(await ensure()).toBe(true);
      await db.query("insert into public.research_projects(id,owner_id,title,mode) values($1,$2,'My research','problem')",[project,id]);
      expect((await db.query<{id:string}>("select id from public.research_projects")).rows).toEqual([{id:project}]);
      expect((await db.query("select * from public.user_profiles")).rows).toHaveLength(1);
      await db.query("select public.enqueue_discovery($1,false,10,1)",[project]);
      await expect(db.query("select public.resolve_login_email('alice')")).rejects.toThrow();
    }
    await expect(db.query("select public.set_username('alice')")).rejects.toThrow();
    await db.query("select public.set_username('bob_new')");
    await expect(db.query("select public.enqueue_discovery($1,false,10,1)",[pa])).rejects.toThrow();
    expect((await db.query("update public.research_projects set title='stolen' where id=$1 returning id",[pa])).rows).toHaveLength(0);
    expect((await db.query("delete from public.research_projects where id=$1 returning id",[pa])).rows).toHaveLength(0);
    await expect(db.query("insert into public.research_projects(owner_id,title,mode) values($1,'stolen','niche')",[a])).rejects.toThrow();
    await expect(db.exec("update public.source_policies set enabled=true where source_id='g2'")).rejects.toThrow();
    await db.exec("reset role; set role service_role");
    expect((await db.query<{email:string}>("select public.resolve_login_email('BOB_NEW') as email")).rows[0].email).toBe("bob@example.com");
    expect((await db.query<{email:string|null}>("select public.resolve_login_email('pending') as email")).rows[0].email).toBeNull();
    const claims=[];
    for(let i=0;i<2;i++) claims.push((await db.query<{owner_id:string}>("select * from public.claim_discovery(null)")).rows[0].owner_id);
    expect(claims.sort()).toEqual([a,b]);
    expect((await db.query("select * from public.claim_discovery(null)")).rows).toHaveLength(0);
    await db.exec("reset role");
    await expect(db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('00000000-0000-4000-8000-000000000004','collision@example.com',now(),'{"username":"ALICE"}')`)).rejects.toThrow();
    await db.exec("set role anon");
    await expect(db.query("select public.ensure_user_profile()")).rejects.toThrow();
    await expect(db.query("select public.resolve_login_email('alice')")).rejects.toThrow();
    await expect(db.query("select public.enqueue_scheduled_discoveries()")).rejects.toThrow();
  } finally { await db.close(); }
},60000);

it("supports existing Auth accounts on fresh install and schedules every confirmed user", async () => {
  const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002";
  const db=await testDatabase(async auth => {
    await auth.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${a}','alice@example.com',now(),'{"username":"existing_user"}');`);
  });
  try {
    expect((await db.query<{username:string}>("select username from public.user_profiles")).rows[0].username).toBe("existing_user");
    await db.exec(`insert into public.research_projects(owner_id,title,mode,scheduled) values('${a}','First project','problem',true);
      insert into auth.users(id,email,email_confirmed_at) values('${b}','bob@example.com',now());
      insert into public.research_projects(owner_id,title,mode,scheduled) values('${b}','New project','niche',true);
      set role service_role;`);
    expect((await db.query<{n:number}>("select public.enqueue_scheduled_discoveries() as n")).rows[0].n).toBe(2);
    expect((await db.query<{n:number}>("select public.enqueue_scheduled_discoveries() as n")).rows[0].n).toBe(0);
    expect((await db.query<{ai_enabled:boolean}>("select ai_enabled from public.discovery_runs")).rows.every(r=>!r.ai_enabled)).toBe(true);
  } finally { await db.close(); }
},60000);
