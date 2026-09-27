import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import type { LearnerCourseDetail } from "@/types";

interface CoursePlayerPageProps {
  courseId: string;
  onBack: () => void;
}

function recomputeProgress(course: LearnerCourseDetail): number {
  if (course.lessons.length === 0) return 0;
  const completed = course.lessons.filter((lesson) => lesson.completed).length;
  return Math.round((completed / course.lessons.length) * 100);
}

export function CoursePlayerPage({ courseId, onBack }: CoursePlayerPageProps) {
  const [course, setCourse] = useState<LearnerCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<LearnerCourseDetail>(`/api/learn/courses/${courseId}`)
      .then(setCourse)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load course");
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  async function handleComplete(lessonId: string) {
    setCompletingId(lessonId);
    setCompleteError(null);
    try {
      await apiFetch(`/api/learn/lessons/${lessonId}/complete`, { method: "POST" });
      setCourse((prev) => {
        if (!prev) return prev;
        const updated: LearnerCourseDetail = {
          ...prev,
          lessons: prev.lessons.map((lesson) =>
            lesson.id === lessonId ? { ...lesson, completed: true } : lesson,
          ),
        };
        updated.progressPercent = recomputeProgress(updated);
        return updated;
      });
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Failed to mark lesson complete");
    } finally {
      setCompletingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!course) return null;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" size="sm" className="self-start" onClick={onBack}>
        ← Back to courses
      </Button>

      <div>
        <h1 className="font-heading text-lg font-medium">{course.title}</h1>
        <p className="text-sm text-muted-foreground">{course.description}</p>
        <div className="mt-2 flex flex-col gap-1">
          <Progress value={course.progressPercent} />
          <span className="text-xs text-muted-foreground">{course.progressPercent}% complete</span>
        </div>
      </div>

      {completeError && (
        <Alert variant="destructive">
          <AlertDescription>{completeError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {course.lessons.map((lesson) => (
          <Card key={lesson.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{lesson.title}</span>
                {lesson.completed && <Badge>Completed</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap text-sm">{lesson.body}</p>
              <Button
                size="sm"
                variant={lesson.completed ? "outline" : "default"}
                disabled={lesson.completed || completingId === lesson.id}
                onClick={() => handleComplete(lesson.id)}
                className="self-start"
              >
                {lesson.completed
                  ? "Completed"
                  : completingId === lesson.id
                    ? "Marking…"
                    : "Mark complete"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
