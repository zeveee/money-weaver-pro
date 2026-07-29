import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/app" className="font-semibold">IvestWise</Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link to="/app" className="hover:text-foreground [&.active]:text-foreground">Grupos</Link>
              <Link to="/app/portfolios" className="hover:text-foreground [&.active]:text-foreground">Carteiras</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
