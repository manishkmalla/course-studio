import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { User } from "@/types";

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-heading text-base font-medium">Course Studio</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <Badge variant="secondary">{user.role}</Badge>
        <Button variant="outline" size="sm" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
