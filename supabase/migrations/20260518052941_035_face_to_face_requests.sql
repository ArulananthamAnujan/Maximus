/*
  # Face-to-Face Session Request System

  ## Overview
  Students can request a face-to-face (live) session with a teacher for a specific course.
  The teacher receives a notification, reviews the request, and can approve it by providing
  a meeting link and scheduled time. The student is then notified with the details.

  ## New Tables
  - `f2f_requests` — stores student requests for face-to-face sessions
  - `f2f_notifications` — in-app notifications for teachers and students

  ## Flow
  1. Student views a course → clicks "Request Face-to-Face Session"
  2. Request saved to f2f_requests (status: pending)
  3. Teacher sees notification badge in their dashboard
  4. Teacher opens the request, approves with a meeting link + time slot
  5. Student is notified via f2f_notifications that session was approved
  6. Student sees the meeting link and scheduled time in their dashboard
*/

CREATE TABLE IF NOT EXISTS f2f_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  preferred_times text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  meeting_link text,
  scheduled_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 60,
  teacher_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE f2f_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own f2f requests"
  ON f2f_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view f2f requests for them"
  ON f2f_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Admins can view all f2f requests"
  ON f2f_requests FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Students can create f2f requests"
  ON f2f_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can cancel own pending requests"
  ON f2f_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id AND status = 'pending')
  WITH CHECK (auth.uid() = student_id AND status = 'cancelled');

CREATE POLICY "Teachers can update requests assigned to them"
  ON f2f_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- In-app notifications
CREATE TABLE IF NOT EXISTS f2f_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES f2f_requests(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('new_request', 'approved', 'rejected', 'cancelled')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE f2f_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON f2f_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark own notifications read"
  ON f2f_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON f2f_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger: auto-create notification when a new f2f request is submitted
CREATE OR REPLACE FUNCTION notify_teacher_on_f2f_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO f2f_notifications (user_id, request_id, type)
    VALUES (NEW.teacher_id, NEW.id, 'new_request');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
      INSERT INTO f2f_notifications (user_id, request_id, type)
      VALUES (NEW.student_id, NEW.id, 'approved');
    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
      INSERT INTO f2f_notifications (user_id, request_id, type)
      VALUES (NEW.student_id, NEW.id, 'rejected');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER f2f_request_notify
  AFTER INSERT OR UPDATE ON f2f_requests
  FOR EACH ROW EXECUTE FUNCTION notify_teacher_on_f2f_request();

CREATE INDEX IF NOT EXISTS idx_f2f_requests_student_id ON f2f_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_f2f_requests_teacher_id ON f2f_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_f2f_requests_status ON f2f_requests(status);
CREATE INDEX IF NOT EXISTS idx_f2f_notifications_user_id ON f2f_notifications(user_id, is_read);
