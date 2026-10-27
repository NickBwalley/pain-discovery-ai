import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "../scripts/test-database";
const OWNER = "00000000-0000-4000-8000-000000000001",
  OTHER = "00000000-0000-4000-8000-000000000002";
const PROJECT = "10000000-0000-4000-8000-000000000001",
  PROJECT2 = "10000000-0000-4000-8000-000000000002";
const ITEM = "20000000-0000-4000-8000-000000000001",
  ITEM2 = "20000000-0000-4000-8000-000000000002";
const PROSPECT = "30000000-0000-4000-8000-000000000001",
  PROSPECT2 = "30000000-0000-4000-8000-000000000002";
let db: PGlite;
async function asUser(id = OWNER, email = "owner@example.com") {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, email, role: "authenticated" }),
  ]);
}
async function admin() {
  await db.exec("reset role");
}
async function count(table: string) {
  const r = await db.query<{ count: number }>(
    `select count(*)::integer as count from public.${table}`,
  );
  return r.rows[0].count;
}
beforeAll(async () => {
  db = await testDatabase();
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${OWNER}','owner@example.com',now()),('${OTHER}','intruder@example.com',now());`);
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("migrations and database access boundaries", () => {
  it("enables RLS for every exposed base table", async () => {
    const result = await db.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("owner can create and read projects", async () => {
    await asUser();
    await db.exec(
      `insert into public.research_projects(id,owner_id,title,mode,keywords) values('${PROJECT}','${OWNER}','Reporting','problem','["reporting"]'),('${PROJECT2}','${OWNER}','Reporting again','problem','["reporting"]');`,
    );
    expect(await count("research_projects")).toBe(2);
  });
  it("users cannot read or insert another user's data, and mismatched JWT emails are rejected", async () => {
    await asUser(OTHER, "intruder@example.com");
    expect(await count("research_projects")).toBe(0);
    await expect(
      db.exec(
        `insert into public.research_projects(owner_id,title,mode) values('${OWNER}','Unauthorized','niche')`,
      ),
    ).rejects.toThrow();
    await asUser(OWNER, "wrong@example.com");
    expect(await count("research_projects")).toBe(0);
  });
  it("anonymous users cannot read or enqueue", async () => {
    await admin();
    await db.exec("set role anon");
    // Depending on platform default grants this is permission denied or zero rows; never data.
    try {
      expect(await count("research_projects")).toBe(0);
    } catch (error) {
      expect(String(error)).toContain("permission denied");
    }
    await expect(
      db.query("select public.enqueue_discovery($1,false,30,5)", [PROJECT]),
    ).rejects.toThrow();
  });
  it("enqueues atomically, prevents duplicate active runs and browser claims", async () => {
    await asUser();
    await db.query("select public.enqueue_discovery($1,true,30,5)", [PROJECT]);
    await expect(
      db.query("select public.enqueue_discovery($1,true,30,5)", [PROJECT]),
    ).rejects.toThrow();
    await expect(
      db.query("select * from public.claim_discovery($1)", [OWNER]),
    ).rejects.toThrow();
    await admin();
    await db.exec("set role service_role");
    const result = await db.query<{ state: string }>(
      "select * from public.claim_discovery($1)",
      [OWNER],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].state).toBe("running");
    expect(
      (await db.query("select * from public.claim_discovery($1)", [OWNER]))
        .rows,
    ).toHaveLength(0);
  });
  it("manual sources require permission and unsupported connectors cannot insert", async () => {
    await asUser();
    await expect(
      db.exec(
        `insert into public.source_items(owner_id,source,external_id,canonical_url,title,permitted_excerpt,content_hash,expires_at) values('${OWNER}','reddit','r1','https://reddit.com/r/test','test','test','rhash',now()+interval '1 day')`,
      ),
    ).rejects.toThrow();
    for (const [id, external, hash] of [
      [ITEM, "m1", "hash1"],
      [ITEM2, "m2", "hash2"],
    ])
      await db.exec(
        `insert into public.source_items(id,owner_id,source,external_id,canonical_url,author_handle,title,permitted_excerpt,content_hash,expires_at,metadata) values('${id}','${OWNER}','manual','${external}','https://example.com/${external}','public_author','reporting','Reporting takes hours','${hash}',now()+interval '20 days','{"permission_confirmed":true}')`,
      );
    expect(await count("source_items")).toBe(2);
  });
  it("composite foreign keys reject mismatched owners", async () => {
    await admin();
    await expect(
      db.exec(
        `insert into public.project_source_items(owner_id,project_id,item_id) values('${OTHER}','${PROJECT}','${ITEM}')`,
      ),
    ).rejects.toThrow();
  });
  it("drafts require review and cannot use another candidate's source", async () => {
    await asUser();
    const candidate = "30000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into public.prospects(id,owner_id,project_id,source_item_id,public_handle) values('${candidate}','${OWNER}','${PROJECT2}','${ITEM}','public_author')`,
    );
    await expect(
      db.query(
        "select public.create_outreach($1,$2,'email','interview','Hi','[]','[]')",
        [candidate, ITEM2],
      ),
    ).rejects.toThrow("matching prospect");
    const result = await db.query<{ id: string }>(
      "select public.create_outreach($1,$2,'email','interview','Hi, you wrote Reporting takes hours.','[]','[]') as id",
      [candidate, ITEM],
    );
    const draft = result.rows[0].id;
    await expect(
      db.query(
        "update public.outreach_drafts set review_status='reviewed' where id=$1",
        [draft],
      ),
    ).rejects.toThrow();
    await db.query(
      "update public.outreach_drafts set claims_confirmed=true,review_status='reviewed' where id=$1",
      [draft],
    );
    await expect(
      db.query(
        "update public.outreach_drafts set body='New unsupported edit',claims_confirmed=false where id=$1",
        [draft],
      ),
    ).rejects.toThrow();
    await db.query("delete from public.prospects where id=$1", [candidate]);
    expect(await count("outreach_drafts")).toBe(0);
  });
  it("global do-not-contact blocks drafts across projects and propagates", async () => {
    await asUser();
    await db.exec(
      `insert into public.prospects(id,owner_id,project_id,source_item_id,public_handle) values('${PROSPECT}','${OWNER}','${PROJECT}','${ITEM}','public_author'),('${PROSPECT2}','${OWNER}','${PROJECT2}','${ITEM2}','public_author');`,
    );
    await db.exec(
      `update public.prospects set do_not_contact=true where id='${PROSPECT}';`,
    );
    const r = await db.query<{ do_not_contact: boolean }>(
      `select do_not_contact from public.prospects where id='${PROSPECT2}'`,
    );
    expect(r.rows[0].do_not_contact).toBe(true);
    await expect(
      db.query(
        "select public.create_outreach($1,$2,'email','interview','Hi','[]','[]')",
        [PROSPECT2, ITEM2],
      ),
    ).rejects.toThrow("globally suppressed");
    await expect(
      db.exec("delete from public.contact_suppressions"),
    ).rejects.toThrow();
  });
  it("deleting a source cascades analysis/candidates and tombstones prevent reimport", async () => {
    await asUser();
    await db.query("select public.remove_source($1)", [ITEM]);
    expect(await count("prospects")).toBe(1);
    expect(await count("source_items")).toBe(1);
    await expect(
      db.exec(
        `insert into public.source_items(owner_id,source,external_id,canonical_url,title,permitted_excerpt,content_hash,expires_at,metadata) values('${OWNER}','manual','m1','https://example.com/m1','test','Reporting takes hours','hash1',now()+interval '1 day','{"permission_confirmed":true}')`,
      ),
    ).rejects.toThrow("removed");
  });
  it("expiry immediately hides sources and prospects", async () => {
    await admin();
    await db.exec(
      `update public.source_items set expires_at=now()-interval '1 day' where id='${ITEM2}'`,
    );
    await asUser();
    expect(await count("source_items")).toBe(0);
    expect(await count("prospects")).toBe(0);
  });
});
