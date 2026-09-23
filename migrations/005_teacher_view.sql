-- 005_teacher_view.sql — เปิด "ฝั่งครู"
--
-- ปัญหาเดิม: ทุกตารางตั้ง RLS ไว้ว่า "เห็นได้เฉพาะข้อมูลของตัวเอง"
-- ซึ่งปิดตายแม้แต่กับผู้สอน — ต่อให้ล็อกอินก็เห็นแค่ข้อมูลตัวเอง
-- ไฟล์นี้เพิ่มบทบาท "ผู้สอน" ที่เห็นข้อมูลของนักเรียนที่ผูกกับตัวเองได้

-- ─────────────────────────────────────────────────────────────
-- 1) ตารางโปรไฟล์ — ใครเป็นครู ใครเป็นนักเรียน ใครสอนใคร
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,                                  -- ชื่อเล่น เช่น "ติณ"
  role             text not null default 'student'
                     check (role in ('student', 'teacher')),
  teacher_id       uuid references auth.users(id) on delete set null,
  grade            text,                                  -- "ม.2", "ม.5", ...
  max_difficulty   int,                                   -- เพดานระดับความยาก (null = ไม่จำกัด)
  last_reviewed_at timestamptz,                           -- ครูเปิดรายงานครั้งล่าสุดเมื่อไหร่
  created_at       timestamptz not null default now()
);

alter table profiles enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2) ฟังก์ชันช่วยเช็คสิทธิ์
--    ต้องเป็น security definer เพื่อไม่ให้ RLS ของ profiles
--    เรียกตัวเองวนไม่รู้จบตอนตรวจสิทธิ์
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.teaches(student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from profiles s
    join profiles t on t.user_id = auth.uid()
    where s.user_id  = student
      and s.teacher_id = auth.uid()
      and t.role = 'teacher'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) สิทธิ์บนตาราง profiles
-- ─────────────────────────────────────────────────────────────
drop policy if exists "profiles read own"            on profiles;
drop policy if exists "profiles teacher read"        on profiles;
drop policy if exists "profiles insert own"          on profiles;
drop policy if exists "profiles teacher insert"      on profiles;
drop policy if exists "profiles teacher update"      on profiles;

create policy "profiles read own" on profiles
  for select using (user_id = auth.uid());

create policy "profiles teacher read" on profiles
  for select using (public.teaches(user_id));

create policy "profiles insert own" on profiles
  for insert with check (user_id = auth.uid());

-- ครูสร้างโปรไฟล์ให้นักเรียนได้ แต่ต้องผูกไว้กับตัวเองเท่านั้น
create policy "profiles teacher insert" on profiles
  for insert with check (public.is_teacher() and teacher_id = auth.uid());

create policy "profiles teacher update" on profiles
  for update using (public.teaches(user_id))
          with check (public.teaches(user_id));

-- ครูต้องแก้แถวของตัวเองได้ด้วย (เช่น อัปเดต last_reviewed_at)
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles
  for update using (user_id = auth.uid())
          with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4) ให้ครูอ่านข้อมูลการเรียนของนักเรียนตัวเองได้
--    (เป็น policy เพิ่ม ไม่แตะของเดิม — Postgres จะ OR รวมกันให้)
-- ─────────────────────────────────────────────────────────────
alter table attempts       enable row level security;
alter table exam_sessions  enable row level security;

drop policy if exists "attempts teacher read"      on attempts;
create policy "attempts teacher read" on attempts
  for select using (public.teaches(user_id));

drop policy if exists "exam_sessions teacher read" on exam_sessions;
create policy "exam_sessions teacher read" on exam_sessions
  for select using (public.teaches(user_id));

-- ─────────────────────────────────────────────────────────────
-- 5) ดัชนี — รายงานจะ query ด้วย user_id + เรียงตามเวลา
-- ─────────────────────────────────────────────────────────────
create index if not exists attempts_user_created_idx on attempts (user_id, created_at desc);
create index if not exists profiles_teacher_idx      on profiles (teacher_id);

-- ─────────────────────────────────────────────────────────────
-- 6) "รหัสครู" — ให้นักเรียนผูกตัวเองกับครูได้ตอนเข้าใช้ครั้งแรก
--    (แอปไม่มี service_role key จึงสร้างบัญชีแทนนักเรียนตรง ๆ ไม่ได้
--     วิธีนี้ครูยังคุมได้ 100% เพราะไม่มีรหัส = เข้าระบบของครูไม่ได้)
-- ─────────────────────────────────────────────────────────────
alter table profiles add column if not exists invite_code text;
create unique index if not exists profiles_invite_code_idx
  on profiles (invite_code) where invite_code is not null;

-- นักเรียนเรียกฟังก์ชันนี้พร้อมรหัสของครู → ผูกตัวเองเข้ากับครูคนนั้น
-- security definer เพราะต้องอ่านแถวของครู ซึ่ง RLS ปกติปิดไว้
create or replace function public.join_teacher(code text)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare
  t uuid;
begin
  select user_id into t
  from profiles
  where invite_code = upper(trim(code)) and role = 'teacher';

  if t is null then
    return false;
  end if;

  insert into profiles (user_id, teacher_id, role)
  values (auth.uid(), t, 'student')
  on conflict (user_id) do update set teacher_id = excluded.teacher_id;

  return true;
end;
$$;

revoke all on function public.join_teacher(text) from public;
grant execute on function public.join_teacher(text) to authenticated;
