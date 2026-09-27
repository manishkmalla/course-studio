import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CourseStats } from "@/types";

interface StatsCardProps {
  stats: CourseStats;
}

export function StatsCard({ stats }: StatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stats</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="text-lg font-medium">{stats.learnersStarted}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completed</dt>
            <dd className="text-lg font-medium">{stats.learnersCompleted}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completion rate</dt>
            <dd className="text-lg font-medium">{Math.round(stats.completionRate * 100)}%</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
