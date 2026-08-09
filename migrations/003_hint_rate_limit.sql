-- ป้องกัน /api/hint จากการถูกยิงฟรี/ยิงเกิน
-- นับจำนวนคำใบ้ที่เรียก Claude จริงต่อ user ต่อวัน + ยอดรวมทั้งระบบต่อวัน แบบ atomic

create table if not exists hint_usage_daily (
  user_id uuid not null,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table hint_usage_daily enable row level security;

create table if not exists hint_usage_totals (
  day date primary key,
  count int not null default 0
);
alter table hint_usage_totals enable row level security;

-- ไม่มี policy ใดๆ = deny-all ผ่าน REST/ตรง แม้แต่ user ที่ login แล้วก็ query/insert ตรงไม่ได้
-- เข้าได้ทางเดียวคือผ่านฟังก์ชัน SECURITY DEFINER ด้านล่างเท่านั้น
revoke all on hint_usage_daily from anon, authenticated;
revoke all on hint_usage_totals from anon, authenticated;

-- นับ 1 ครั้ง (per-user + รวมทั้งระบบ) แบบ atomic ในทรานแซกชันเดียว คืนค่าล่าสุดทั้งคู่กลับมา
-- ใช้ auth.uid() จาก JWT ที่ผูกมากับ request เอง ไม่รับ user_id จาก client กัน spoof
create or replace function public.increment_hint_usage()
returns table(user_count int, total_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_uid uuid := auth.uid();
  v_user_count int;
  v_total_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into hint_usage_daily (user_id, day, count)
  values (v_uid, v_today, 1)
  on conflict (user_id, day) do update set count = hint_usage_daily.count + 1
  returning count into v_user_count;

  insert into hint_usage_totals (day, count)
  values (v_today, 1)
  on conflict (day) do update set count = hint_usage_totals.count + 1
  returning count into v_total_count;

  return query select v_user_count, v_total_count;
end;
$$;

revoke all on function public.increment_hint_usage() from public;
grant execute on function public.increment_hint_usage() to authenticated;
