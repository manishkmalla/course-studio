import { useEffect, useRef, useState } from "react";
import { LessonEditor } from "@/components/LessonEditor";
import { StatsCard } from "@/components/StatsCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import type { CourseDetail, CourseStats, EditableLesson, Lesson } from "@/types";

interface CourseEditorPageProps {
  courseId: string;
  onBack: () => void;
}

function toEditable(lessons: Lesson[]): EditableLesson[] {
  return lessons.map((lesson) => ({
    clientKey: lesson.id,
    id: lesson.id,
    title: lesson.title,
    body: lesson.body,
  }));
}

function snapshotOf(title: string, description: string, lessons: EditableLesson[]): string {
  return JSON.stringify({
    title,
    description,
    lessons: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, body: lesson.body })),
  });
}

function isConflictBody(body: unknown): body is { current: CourseDetail } {
  return !!body && typeof body === "object" && "current" in body;
}

// The Save/Publish buttons aren't inside a <form>, so the inputs' `required`
// attribute never triggers browser validation — check the same rules the
// API enforces here, before sending anything, so a blank field shows a
// clear message instead of the server's raw Zod error text.
function validate(title: string, description: string, lessons: EditableLesson[]): string | null {
  if (title.trim().length === 0) return "Title can't be empty.";
  if (description.trim().length === 0) return "Description can't be empty.";
  const blankLessonIndex = lessons.findIndex(
    (lesson) => lesson.title.trim().length === 0 || lesson.body.trim().length === 0,
  );
  if (blankLessonIndex !== -1) {
    return `Lesson ${blankLessonIndex + 1} needs both a title and a body.`;
  }
  return null;
}

export function CourseEditorPage({ courseId, onBack }: CourseEditorPageProps) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lessons, setLessons] = useState<EditableLesson[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CourseDetail | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [stats, setStats] = useState<CourseStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const conflictRef = useRef<HTMLDivElement>(null);

  const dirty = snapshotOf(title, description, lessons) !== savedSnapshot;

  // The conflict alert renders at the top of a potentially long form; if the
  // save that triggered it was clicked from further down, the user would
  // otherwise never see why nothing happened.
  useEffect(() => {
    if (conflict) {
      conflictRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [conflict]);

  function applyLoadedCourse(loaded: CourseDetail) {
    setCourse(loaded);
    setTitle(loaded.title);
    setDescription(loaded.description);
    const editable = toEditable(loaded.lessons);
    setLessons(editable);
    setSavedSnapshot(snapshotOf(loaded.title, loaded.description, editable));
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    apiFetch<CourseDetail>(`/api/courses/${courseId}`)
      .then(applyLoadedCourse)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load course");
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    setStatsError(null);
    apiFetch<CourseStats>(`/api/courses/${courseId}/stats`)
      .then(setStats)
      .catch((err: unknown) => {
        setStatsError(err instanceof Error ? err.message : "Failed to load stats");
      });
  }, [courseId]);

  async function performSave(version: number) {
    const validationError = validate(title, description, lessons);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      // While a conflict is showing, any of my lessons no longer present in
      // the other creator's current version was deleted by them — send it
      // without an id so it's recreated instead of a 400 "lesson not found".
      const knownIds = conflict ? new Set(conflict.lessons.map((lesson) => lesson.id)) : null;
      const payload = {
        title,
        description,
        version,
        lessons: lessons.map((lesson) => {
          const stillExists = lesson.id !== undefined && (!knownIds || knownIds.has(lesson.id));
          return stillExists
            ? { id: lesson.id, title: lesson.title, body: lesson.body }
            : { title: lesson.title, body: lesson.body };
        }),
      };
      const updated = await apiFetch<CourseDetail>(`/api/courses/${courseId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      applyLoadedCourse(updated);
      setConflict(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && isConflictBody(err.body)) {
        setConflict(err.body.current);
      } else {
        setSaveError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleLoadLatest() {
    if (!conflict) return;
    applyLoadedCourse(conflict);
    setConflict(null);
  }

  async function handlePublish() {
    if (!course) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const updated = await apiFetch<CourseDetail>(`/api/courses/${courseId}/publish`, {
        method: "POST",
        body: JSON.stringify({ version: course.version }),
      });
      applyLoadedCourse(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && isConflictBody(err.body)) {
        setConflict(err.body.current);
      } else {
        setPublishError(err instanceof Error ? err.message : "Failed to publish");
      }
    } finally {
      setPublishing(false);
    }
  }

  function updateLesson(clientKey: string, updated: EditableLesson) {
    setLessons((prev) => prev.map((lesson) => (lesson.clientKey === clientKey ? updated : lesson)));
  }

  function removeLesson(clientKey: string) {
    setLessons((prev) => prev.filter((lesson) => lesson.clientKey !== clientKey));
  }

  function moveLesson(index: number, direction: -1 | 1) {
    setLessons((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const a = prev[index];
      const b = prev[target];
      if (!a || !b) return prev;
      const next = [...prev];
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function addLesson() {
    setLessons((prev) => [...prev, { clientKey: crypto.randomUUID(), title: "", body: "" }]);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!course) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Back to courses
        </Button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Badge variant={course.status === "published" ? "default" : "secondary"}>
            {course.status}
          </Badge>
        </div>
      </div>

      {conflict && (
        <Alert variant="destructive" ref={conflictRef}>
          <AlertTitle>This course was changed by someone else.</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleLoadLatest}>
                Load latest
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => performSave(conflict.version)}
              >
                Overwrite with mine
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="course-title">Title</Label>
              <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="course-description">Description</Label>
              <Textarea
                id="course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Lessons</h2>
        {lessons.map((lesson, index) => (
          <LessonEditor
            key={lesson.clientKey}
            lesson={lesson}
            index={index}
            isFirst={index === 0}
            isLast={index === lessons.length - 1}
            onChange={(updated) => updateLesson(lesson.clientKey, updated)}
            onRemove={() => removeLesson(lesson.clientKey)}
            onMoveUp={() => moveLesson(index, -1)}
            onMoveDown={() => moveLesson(index, 1)}
          />
        ))}
        <Button type="button" variant="outline" onClick={addLesson} className="self-start">
          Add lesson
        </Button>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={saving} onClick={() => performSave(course.version)}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <div className="flex flex-col">
          <Button variant="outline" disabled={publishing || dirty} onClick={handlePublish}>
            {publishing ? "Publishing…" : "Publish"}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Save before publishing</span>}
        </div>
      </div>
      {publishError && (
        <Alert variant="destructive">
          <AlertDescription>{publishError}</AlertDescription>
        </Alert>
      )}

      {statsError && (
        <Alert variant="destructive">
          <AlertDescription>{statsError}</AlertDescription>
        </Alert>
      )}
      {stats && <StatsCard stats={stats} />}
    </div>
  );
}
