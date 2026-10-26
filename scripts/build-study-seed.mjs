// Generate a new immutable seed migration from the reviewed public catalogue.
import { readFileSync, writeFileSync } from 'node:fs';
const plans=JSON.parse(readFileSync(new URL('../data/study-plans.json',import.meta.url),'utf8'));
if(JSON.stringify(plans).includes('$study_plans$'))throw new Error('Invalid seed delimiter');
const sql=`begin;
-- Public curricula supplied by the owner; no students, doctors or reviews seeded.
do $seed$
declare plan jsonb; course jsonb; uni bigint; college bigint; major bigint;
begin
 select id into uni from miyar_universities where name='جامعة نجران';
 if uni is null then raise exception 'Najran University is required for these plans'; end if;
 insert into miyar_colleges(university_id,name) values(uni,'كلية الهندسة') on conflict(university_id,name) do nothing;
 select id into college from miyar_colleges where university_id=uni and name='كلية الهندسة';
 for plan in select value from jsonb_array_elements($study_plans$${JSON.stringify(plans)}$study_plans$::jsonb) loop
  select m.id into major from miyar_majors m where m.college_id=college
   and (m.name=plan->>'major' or m.name in(select jsonb_array_elements_text(coalesce(plan->'majorAliases','[]'::jsonb))))
   order by (m.name=plan->>'major') desc,m.id limit 1;
  if major is null then
   insert into miyar_majors(college_id,name) values(college,plan->>'major') returning id into major;
  end if;
  insert into miyar_study_plans(id,major_id,metadata) values(plan->>'id',major,plan-'courses');
  for course in select value from jsonb_array_elements(plan->'courses') loop
   if course->>'kind'='course' then
    insert into miyar_study_courses(id,plan_id,code,name,linkable) values(course->>'id',plan->>'id',course->>'code',course->>'name',(course->>'linkable')::boolean);
   end if;
  end loop;
 end loop;
end; $seed$;
commit;
`;
writeFileSync(new URL('../supabase/migrations/202610260002_study_seed.sql',import.meta.url),sql);
console.log('Generated',plans.length,'plans');
