import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditableLesson } from "@/types";

interface LessonEditorProps {
  lesson: EditableLesson;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (lesson: EditableLesson) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function LessonEditor({
  lesson,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: LessonEditorProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Lesson {index + 1}</span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon-sm" disabled={isFirst} onClick={onMoveUp}>
            ↑
          </Button>
          <Button type="button" variant="outline" size="icon-sm" disabled={isLast} onClick={onMoveDown}>
            ↓
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lesson-title-${lesson.clientKey}`}>Title</Label>
        <Input
          id={`lesson-title-${lesson.clientKey}`}
          required
          value={lesson.title}
          onChange={(e) => onChange({ ...lesson, title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lesson-body-${lesson.clientKey}`}>Body</Label>
        <Textarea
          id={`lesson-body-${lesson.clientKey}`}
          required
          value={lesson.body}
          onChange={(e) => onChange({ ...lesson, body: e.target.value })}
        />
      </div>
    </div>
  );
}
