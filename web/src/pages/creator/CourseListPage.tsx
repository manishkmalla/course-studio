import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import type { CourseDetail, CourseSummary, Paginated } from "@/types";

interface CourseListPageProps {
  onSelectCourse: (id: string) => void;
}

const PAGE_SIZE = 5;

export function CourseListPage({ onSelectCourse }: CourseListPageProps) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadPage(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      const page = await apiFetch<Paginated<CourseSummary>>(`/api/courses?${params}`);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const course = await apiFetch<CourseDetail>("/api/courses", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, description: newDescription }),
      });
      setCourses((prev) => [course, ...prev]);
      setNewTitle("");
      setNewDescription("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New course</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                required
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={creating} className="self-start">
              {creating ? "Creating…" : "Create draft"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{course.title}</span>
                <Badge variant={course.status === "published" ? "default" : "secondary"}>
                  {course.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Last updated {new Date(course.updatedAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && courses.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No courses yet.</p>
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
