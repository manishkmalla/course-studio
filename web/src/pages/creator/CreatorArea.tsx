import { useState } from "react";
import { CourseEditorPage } from "@/pages/creator/CourseEditorPage";
import { CourseListPage } from "@/pages/creator/CourseListPage";

export function CreatorArea() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  if (selectedCourseId) {
    return (
      <CourseEditorPage courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />
    );
  }

  return <CourseListPage onSelectCourse={setSelectedCourseId} />;
}
