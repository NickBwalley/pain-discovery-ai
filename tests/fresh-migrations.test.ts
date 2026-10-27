import { it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { testDatabase } from "../scripts/test-database";

it("installs the current schema from exactly three ordered fresh migrations", async () => {
  expect(readdirSync("supabase/migrations").filter(name=>name.endsWith(".sql")).sort()).toEqual([
    "20261027000100_schema.sql",
    "20261027000200_auth_and_rls.sql",
    "20261027000300_operations.sql",
  ]);
  const db=await testDatabase();
  try {
    const tables=(await db.query<{table_name:string}>("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows.map(r=>r.table_name);
    expect(tables).toHaveLength(17);
    expect(tables).toContain("user_profiles");
    expect(tables).not.toContain("owner_profiles");
    expect((await db.query("select * from information_schema.tables where table_schema='app_private'")).rows).toHaveLength(0);
    expect((await db.query("select proname from pg_proc where proname in ('claim_owner_account','check_worker_owner','set_owner_username','owner_username_matches')")).rows).toHaveLength(0);
    const policies=(await db.query<{source_id:string}>("select source_id from public.source_policies where enabled order by source_id")).rows;
    expect(policies).toEqual([{source_id:"hacker_news"},{source_id:"manual"}]);
    for(const name of ["research_projects","pain_signals","outreach_drafts"])
      expect((await db.query(`select * from public.${name}`)).rows).toHaveLength(0);
  } finally { await db.close(); }
},60000);
