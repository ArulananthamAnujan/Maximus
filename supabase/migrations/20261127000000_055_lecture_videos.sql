/*
  # 055 — AI avatar lecture videos

  One AI-presented lecture per module (section). A lecture is written as a script,
  reviewed by the teacher, rendered by an outside avatar-video service, then saved to
  private course storage and added to the module as a normal video lesson.

  A lecture longer than the service's per-video script limit is split into parts; each
  part is one row here and becomes one lesson.

  All writes go through the `lecture-video` edge function (service role). Course staff
  can read their own rows to show progress. Idempotent.
*/

CREATE TABLE IF NOT EXISTS lecture_videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id        uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  part_index        integer NOT NULL DEFAULT 0,
  part_count        integer NOT NULL DEFAULT 1,
  title             text NOT NULL DEFAULT '',
  script            text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'rendering', 'saving', 'ready', 'failed')),
  provider          text NOT NULL DEFAULT 'heygen',
  provider_video_id text,
  avatar_id         text,
  voice_id          text,
  storage_path      text,
  lesson_id         uuid REFERENCES lessons(id) ON DELETE SET NULL,
  duration_seconds  integer,
  error_message     text,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, part_index)
);

CREATE INDEX IF NOT EXISTS idx_lecture_videos_course ON lecture_videos(course_id);
CREATE INDEX IF NOT EXISTS idx_lecture_videos_status ON lecture_videos(status) WHERE status IN ('rendering', 'saving');

DROP TRIGGER IF EXISTS lecture_videos_updated_at ON lecture_videos;
CREATE TRIGGER lecture_videos_updated_at
  BEFORE UPDATE ON lecture_videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lecture_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Course staff can view lecture videos" ON lecture_videos;
CREATE POLICY "Course staff can view lecture videos"
  ON lecture_videos FOR SELECT TO authenticated
  USING (can_manage_course(course_id));
