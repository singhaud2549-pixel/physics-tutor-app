-- เก็บเวลาที่ใช้ทำข้อสอบ + คำวิเคราะห์จาก AI ไว้กับแต่ละครั้งที่สอบ (ต่อยอด exam_sessions เดิม)
alter table exam_sessions add column if not exists duration_seconds int;
alter table exam_sessions add column if not exists analysis text;
