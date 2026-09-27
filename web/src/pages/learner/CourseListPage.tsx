import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import type { LearnerCourseSummary, Paginated } from "@/types";

interface CourseListPageProps {
  onSelectCourse: (id: string) => void;
}

const PAGE_SIZE = 5;

export function CourseListPage({ onSelectCourse }: CourseListPageProps) {
  const [courses, setCourses] = useState<LearnerCourseSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      const page = await apiFetch<Paginated<LearnerCourseSummary>>(`/api/learn/courses?${params}`);
      setCourses((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {courses.map((course) => (
          <Card
            key={course.id}
            className="cursor-pointer hover:ring-2 hover:ring-ring/50"
            onClick={() => onSelectCourse(course.id)}
          >
            <CardHeader>
              <CardTitle>{course.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{course.description}</p>
              <Progress value={course.progressPercent} />
              <span className="text-xs text-muted-foreground">{course.progressPercent}% complete</span>
            </CardContent>
          </Card>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && courses.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No published courses yet.</p>
        )}
      </div>

      {nextCursor && (
        <Button variant="outline" disabled={loading} onClick={() => loadPage(nextCursor)}>
          Load more
        </Button>
      )}
    </div>
  );
}
