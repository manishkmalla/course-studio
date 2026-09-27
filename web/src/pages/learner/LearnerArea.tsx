import { useState } from "react";
import { CoursePlayerPage } from "@/pages/learner/CoursePlayerPage";
import { CourseListPage } from "@/pages/learner/CourseListPage";

export function LearnerArea() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  if (selectedCourseId) {
    return (
      <CoursePlayerPage courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />
    );
  }

  return <CourseListPage onSelectCourse={setSelectedCourseId} />;
}
