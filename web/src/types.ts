export interface User {
  id: string;
  email: string;
  role: "creator" | "learner";
}

export interface Lesson {
  id: string;
  courseId: string;
  position: number;
  title: string;
  body: string;
}

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published";
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface CourseDetail extends CourseSummary {
  lessons: Lesson[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
}

export interface LearnerCourseSummary extends CourseSummary {
  progressPercent: number;
}

export interface LearnerLesson extends Lesson {
  completed: boolean;
}

export interface LearnerCourseDetail extends CourseSummary {
  lessons: LearnerLesson[];
  progressPercent: number;
}

export interface CourseStats {
  totalLessons: number;
  learnersStarted: number;
  learnersCompleted: number;
  completionRate: number;
}

// A lesson as edited in the creator UI: `clientKey` is a client-only React
// list key for lessons that don't have a server id yet (new, unsaved), and
// is never sent to the API.
export interface EditableLesson {
  clientKey: string;
  id?: string;
  title: string;
  body: string;
}
