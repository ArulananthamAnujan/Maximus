/*
  # 060: Lectures in learning order

  A finished AI lecture was placed above the module's first lesson when it finished. The
  parts of a lecture finish at different times, so part 2 could end up above part 1, and
  lectures were not counted towards finishing the course.

  From now on the lecture-video function puts each module in order whenever a lecture
  finishes. This puts the modules that already have lectures in the same order once:
  the lecture first (its parts in order), then the module's other lessons in their order.
  Lecture lessons also become required, like the module's other lessons (a teacher can
  still untick "Required" on any lesson).
*/

WITH lec AS (
  SELECT DISTINCT ON (lv.lesson_id) lv.lesson_id, lv.section_id, lv.part_index
  FROM lecture_videos lv
  JOIN lessons l ON l.id = lv.lesson_id AND l.section_id = lv.section_id
  WHERE lv.lesson_id IS NOT NULL
  ORDER BY lv.lesson_id, lv.part_index
),
ordered AS (
  SELECT l.id,
         (row_number() OVER (
           PARTITION BY l.section_id
           ORDER BY (lec.lesson_id IS NULL), lec.part_index, l.order_index, l.created_at, l.id
         ) - 1)::int AS pos
  FROM lessons l
  LEFT JOIN lec ON lec.lesson_id = l.id
  WHERE l.section_id IN (SELECT section_id FROM lec)
)
UPDATE lessons l
SET order_index = o.pos
FROM ordered o
WHERE o.id = l.id
  AND l.order_index IS DISTINCT FROM o.pos;

UPDATE lessons
SET is_required = true
WHERE is_required IS DISTINCT FROM true
  AND id IN (SELECT lesson_id FROM lecture_videos WHERE lesson_id IS NOT NULL);
