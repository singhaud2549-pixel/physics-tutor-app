-- 006_hint_transcript.sql — เก็บบทสนทนากับ AI + เวลาที่ใช้ต่อข้อ
--
-- เดิมระบบเก็บแค่ "ตอบอะไร ถูก/ผิด ขอคำใบ้กี่ครั้ง"
-- ส่วนบทสนทนาจริงอยู่แค่ในหน้าจอนักเรียน ปิดแท็บแล้วหายถาวร
-- ทั้งที่เส้นทางการตอบ (ผิด → ใบ้ → ผิด → ใบ้ → ถูก) บอกได้ว่าติดตรงไหนจริง ๆ
-- และเป็นทางเดียวที่ผู้สอนจะตรวจได้ว่า "AI ใบ้ดีจริงไหม"

-- ─────────────────────────────────────────────────────────────
-- 1) เวลาที่ใช้ต่อข้อ — นับจากตอนเปิดโจทย์ถึงตอนกดส่งคำตอบครั้งนั้น
-- ─────────────────────────────────────────────────────────────
alter table attempts add column if not exists seconds_on_problem int;
alter table attempts add column if not exists session_key uuid;

-- ─────────────────────────────────────────────────────────────
-- 2) บทสนทนา — 1 แถว = 1 ข้อความในกล่องแชท
-- ─────────────────────────────────────────────────────────────
create table if not exists hint_messages (
  id                 bigserial primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  problem_id         text not null,
  session_key        uuid not null,           -- หนึ่งครั้งที่เปิดโจทย์ = หนึ่ง key
  seq                int  not null,           -- ลำดับข้อความในครั้งนั้น
  role               text not null,           -- student | hint | correct | solution | ask | blocked
  text               text not null,
  seconds_on_problem int,
  created_at         timestamptz not null default now(),
  unique (user_id, session_key, seq)
);

create index if not exists hint_messages_user_problem_idx
  on hint_messages (user_id, problem_id, created_at desc);
create index if not exists hint_messages_session_idx
  on hint_messages (session_key, seq);

alter table hint_messages enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3) สิทธิ์ — นักเรียนเขียน/อ่านของตัวเอง · ผู้สอนอ่านของนักเรียนตัวเอง
-- ─────────────────────────────────────────────────────────────
drop policy if exists "hint_messages insert own"  on hint_messages;
drop policy if exists "hint_messages read own"    on hint_messages;
drop policy if exists "hint_messages teacher read" on hint_messages;

create policy "hint_messages insert own" on hint_messages
  for insert with check (user_id = auth.uid());

create policy "hint_messages read own" on hint_messages
  for select using (user_id = auth.uid());

create policy "hint_messages teacher read" on hint_messages
  for select using (public.teaches(user_id));
