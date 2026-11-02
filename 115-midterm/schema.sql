-- 本功能使用獨立資料表，僅後端 service_role 能存取。
create table public.nature_correction_teachers (
 email text primary key check(email = lower(email)), created_at timestamptz not null default now()
);
create table public.nature_correction_classes (
 class_name text primary key check (char_length(class_name) between 1 and 20),
 seats integer[] not null default '{}', active boolean not null default true, updated_at timestamptz not null default now()
);
create table public.nature_correction_submissions (
 id uuid primary key default gen_random_uuid(),
 class_name text not null references public.nature_correction_classes(class_name),
 seat integer not null check(seat between 1 and 99),
 student_name text not null check(char_length(student_name) between 1 and 30),
 states jsonb not null check(jsonb_typeof(states)='object'),
 owner_hash text not null,
 submitted_at timestamptz not null default now(),
 unique(class_name,seat)
);
alter table public.nature_correction_teachers enable row level security;
alter table public.nature_correction_classes enable row level security;
alter table public.nature_correction_submissions enable row level security;
revoke all on public.nature_correction_teachers, public.nature_correction_classes, public.nature_correction_submissions from anon, authenticated;
grant all on public.nature_correction_teachers, public.nature_correction_classes, public.nature_correction_submissions to service_role;
create index nature_correction_submissions_time on public.nature_correction_submissions(submitted_at desc);
