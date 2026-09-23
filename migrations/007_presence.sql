-- 007_presence.sql — สถานะ live ว่านักเรียนกำลังทำข้อไหนอยู่
--
-- ฝั่งเด็กยิง heartbeat ทุก ~30 วิตอนเปิด /problem/[id] อยู่
-- ฝั่งครูอ่าน updated_at ถ้าเกิน 2 นาทีถือว่าออฟไลน์แล้ว (คำนวณฝั่ง client)
-- ตารางนี้เป็น ephemeral (ข้อมูลล่าสุดอย่างเดียวต่อคน) ไม่ใช่ประวัติ

create table if not exists presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  problem_id text,
  updated_at timestamptz not null default now()
);

alter table presence enable row level security;

drop policy if exists "presence write own"  on presence;
drop policy if exists "presence read own"   on presence;
drop policy if exists "presence teacher read" on presence;

-- นักเรียนเขียนแถวของตัวเองได้ (upsert ทุก heartbeat)
create policy "presence write own" on presence
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "presence read own" on presence
  for select using (user_id = auth.uid());

-- ครูอ่าน presence ของนักเรียนตัวเองได้ (ฟังก์ชัน teaches มาจาก 005)
create policy "presence teacher read" on presence
  for select using (public.teaches(user_id));
