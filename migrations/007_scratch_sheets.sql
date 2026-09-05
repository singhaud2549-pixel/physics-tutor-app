-- พื้นที่ทด (ลายมือของนักเรียน) — เก็บเป็น "เส้น" ไม่ใช่รูปภาพ
--
-- ทำไมเก็บเป็นเส้น ไม่เก็บเป็นรูป PNG:
--   PNG หนึ่งแผ่นราว 50-100 KB · เส้นชุดเดียวกันราว 3-5 KB
--   ที่ 7 คน × 8 ข้อ × 4 คาบ/เดือน → PNG กินราว 130 MB/ปี (จากโควต้าฟรี 500 MB)
--   แต่เส้นกินราว 1-2 MB/ปี · และวาดกลับที่ขนาดไหนก็คมเสมอ
--   (น้องเขียนบน iPad กว้าง 1024 → ครูเปิดบนโน้ตบุ๊กกว้าง 600 ก็ยังคม)
--
-- พิกัดในนี้เป็นสัดส่วนของความกว้าง (0..1) ไม่ใช่พิกเซล จึงไม่ผูกกับขนาดจอ

create table if not exists scratch_sheets (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  session_key uuid not null,
  -- [{ c: สี, w: ความหนา(สัดส่วนความกว้าง), p: [[x,y],...] }]
  strokes jsonb not null default '[]'::jsonb,
  -- สูง ÷ กว้าง ของแผ่นที่น้องเขียน — ใช้วาดกลับให้ได้สัดส่วนเดิม
  aspect real not null default 1,
  -- ตำแหน่งรูปโจทย์บนแผ่น { imageBox: [x, y, w, h] } (สัดส่วนความกว้าง)
  -- เก็บไว้เพราะถ้าไม่รู้ว่ารูปอยู่ตรงไหน ครูจะเห็นแค่ลูกศรลอย ๆ ไม่รู้ว่าน้องชี้อะไร
  layout jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- เปิดโจทย์หนึ่งครั้ง = หนึ่งแผ่น (เขียนเพิ่มคือทับแผ่นเดิม ไม่ใช่สร้างใหม่)
  unique (user_id, session_key)
);

create index if not exists scratch_sheets_user_idx on scratch_sheets (user_id, created_at desc);

alter table scratch_sheets enable row level security;

-- นักเรียนเขียนและแก้ของตัวเองได้
drop policy if exists "scratch insert own" on scratch_sheets;
create policy "scratch insert own" on scratch_sheets
  for insert with check (auth.uid() = user_id);

drop policy if exists "scratch update own" on scratch_sheets;
create policy "scratch update own" on scratch_sheets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "scratch read own" on scratch_sheets;
create policy "scratch read own" on scratch_sheets
  for select using (auth.uid() = user_id);

-- ครูอ่านของนักเรียนตัวเองได้ (นโยบาย select หลายอันถูก OR กัน)
drop policy if exists "scratch teacher read" on scratch_sheets;
create policy "scratch teacher read" on scratch_sheets
  for select using (public.teaches(user_id));
