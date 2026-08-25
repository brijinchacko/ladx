-- Schedule dates become calendar dates.
--
-- They were timestamptz holding local midnight, which is 23:00 the previous
-- day in UTC, so a plan drafted in BST read back a day early and put work on a
-- Sunday. A due date is the same day in every office; it is not an instant.
--
-- The default cast interprets in the session timezone, which would matter if
-- any row carried a value. None does: production holds 17 tasks from one
-- seeded plan and every due_on is NULL, because the seed did not date its
-- tasks until the commit that added this column. So the cast moves nothing.
ALTER TABLE "project_tasks" ALTER COLUMN "starts_on" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "project_tasks" ALTER COLUMN "due_on" SET DATA TYPE date;