-- Schedule dates become calendar dates.
--
-- They were timestamptz holding local midnight, which is 23:00 the previous
-- day in UTC, so a plan drafted in BST read back a day early and put work on a
-- Sunday. A due date is the same day in every office; it is not an instant.
--
-- The default cast interprets in the session timezone. That is inconsequential
-- here because project_tasks holds no rows on production: the planner shipped
-- on 24 Aug and no plan has been seeded against it.
ALTER TABLE "project_tasks" ALTER COLUMN "starts_on" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "project_tasks" ALTER COLUMN "due_on" SET DATA TYPE date;