-- Add super_admin role and conversation status helpers

-- Extend role constraint to include super_admin
alter table agents drop constraint if exists agents_role_check;
alter table agents add constraint agents_role_check
  check (role in ('super_admin', 'admin', 'agent'));
