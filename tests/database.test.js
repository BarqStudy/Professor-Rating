import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("database migration, privacy roles, moderation, aggregates, duplicates and rate limiting", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610240001_miyar.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const catalogue = async () =>
      (await db.query("select public.miyar_catalogue() as data")).rows[0].data;
    assert.equal((await catalogue()).colleges.length, 1);
    assert.equal((await catalogue()).doctors.length, 0);
    await t.test("anonymous and authenticated browser roles cannot read private tables or invoke write RPC", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (
          const table of [
            "miyar_users",
            "miyar_reviews",
            "miyar_doctors",
            "miyar_colleges",
            "miyar_majors",
          ]
        ) {
          await assert.rejects(
            db.query(`select * from public.${table}`),
            /permission denied/,
          );
        }
        await assert.rejects(
          db.query("select public.miyar_catalogue()"),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select public.miyar_submit_review(1,'a','b','c','d',90,90,90,90,'e')",
          ),
          /permission denied/,
        );
        await db.exec("reset role");
      }
    });
    await db.exec("set role service_role");
    await db.query(
      "insert into miyar_users(telegram_id,name) values(123,'طالب')",
    );
    const submit = async (subject = "ميكانيكا") =>
      (await db.query(
        "select miyar_submit_review(123,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',$1,92,90,80,70,'تجربة مفيدة وشرح واضح') as result",
        [subject],
      )).rows[0].result;
    const r = await submit();
    assert.equal(r.status, "pending");
    assert.equal(r.newDoctor, true);
    await t.test("pending doctors and reviews are absent from public catalogue", async () => {
      assert.equal((await catalogue()).doctors.length, 0);
      assert.equal((await catalogue()).stats.reviews, 0);
    });
    const doctor = (await db.query("select id from miyar_doctors")).rows[0].id;
    await db.query("select miyar_moderate_doctor($1,true)", [doctor]);
    assert.equal((await catalogue()).doctors[0].count, 0);
    await db.query("update miyar_reviews set status='published' where id=$1", [
      r.id,
    ]);
    await t.test("published aggregates are accurate and exclude authors and grades", async () => {
      const data = await catalogue();
      assert.equal(data.doctors[0].count, 1);
      assert.equal(data.doctors[0].score, 80);
      assert.deepEqual(data.doctors[0].scores, [90, 80, 70]);
      assert.equal(data.stats.reviews, 1);
      const str = JSON.stringify(data);
      assert.ok(!str.includes("user_id"));
      assert.ok(!str.includes("telegram_id"));
      assert.ok(!str.includes("grade"));
      assert.ok(!str.includes("92"));
    });
    await t.test("duplicate submissions, invalid hierarchy, restrictions and daily limit are enforced by PostgreSQL", async () => {
      await assert.rejects(submit(), /unique constraint/);
      await assert.rejects(
        db.query(
          "select miyar_submit_review(123,'كلية أخرى','الهندسة المدنية','أحمد محمد العتيبي','مادة',92,90,80,70,'تجربة مفيدة')",
        ),
        /INVALID_MAJOR/,
      );
      await db.query(
        "update miyar_users set status='restricted' where telegram_id=123",
      );
      await assert.rejects(submit("جديد"), /ACCOUNT_RESTRICTED/);
      await db.query(
        "update miyar_users set status='active' where telegram_id=123",
      );
      for (let i = 0; i < 4; i++) await submit("مادة " + i);
      await assert.rejects(submit("مادة سادسة"), /RATE_LIMIT/);
      assert.equal(
        (await db.query("select count(*)::int as n from miyar_reviews")).rows[0]
          .n,
        5,
      );
    });
    await t.test("archived doctors and their reviews disappear from public aggregates", async () => {
      await db.query("update miyar_doctors set status='archived' where id=$1", [
        doctor,
      ]);
      const data = await catalogue();
      assert.equal(data.doctors.length, 0);
      assert.equal(data.stats.reviews, 0);
    });
  } finally {
    await db.close();
  }
});
