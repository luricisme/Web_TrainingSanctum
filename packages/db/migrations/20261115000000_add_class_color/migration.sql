-- Story 6.4: Class colour. Additive only. Existing Classes get a colour by
-- creation order per user (lavender, sky, mint, butter, rose, repeat); the
-- column is never null.
-- CreateEnum
CREATE TYPE "ClassColor" AS ENUM ('LAVENDER', 'SKY', 'MINT', 'BUTTER', 'ROSE');

-- AlterTable (temporary default so existing rows pass NOT NULL)
ALTER TABLE "classes" ADD COLUMN "color" "ClassColor" NOT NULL DEFAULT 'LAVENDER';

-- Backfill by creation order per user
UPDATE "classes" c
SET "color" = (ARRAY['LAVENDER','SKY','MINT','BUTTER','ROSE'])[1 + (r.rn - 1) % 5]::"ClassColor"
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS rn
  FROM "classes"
) r
WHERE c.id = r.id;

-- Drop the temporary default
ALTER TABLE "classes" ALTER COLUMN "color" DROP DEFAULT;
