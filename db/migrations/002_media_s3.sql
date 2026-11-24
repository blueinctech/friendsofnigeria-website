-- Media files may also live in an S3-compatible bucket (storage = 's3').
-- They are served from /media/<key> by the website, so the bucket can stay private.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'media'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%storage%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE media DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE media ADD CONSTRAINT media_storage_check CHECK (storage IN ('db', 'blob', 's3'));
