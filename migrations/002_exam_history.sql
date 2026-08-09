-- เพิ่มคอลัมน์ให้ตาราง attempts เดิม รองรับการตอบข้อสอบ (แยกจากโจทย์ฝึกแยกบท)
alter table attempts add column if not exists exam_set text;
alter table attempts add column if not exists exam_session_id uuid;

-- ตารางใหม่: เก็บคะแนนรวมของการสอบแต่ละครั้ง (1 แถว = 1 ครั้งที่ส่งข้อสอบ)
create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_set text not null,
  total int not null,
  max int not null,
  created_at timestamptz not null default now()
);

alter table exam_sessions enable row level security;

create policy "select own exam sessions" on exam_sessions
  for select using (auth.uid() = user_id);

create policy "insert own exam sessions" on exam_sessions
  for insert with check (auth.uid() = user_id);
