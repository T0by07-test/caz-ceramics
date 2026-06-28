import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Calendar, BookmarkCheck, RotateCcw, User, LogOut, CreditCard, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  brand: string;
  items: NavItem[];
};

export function AppShell({ brand, items }: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  // Mobile bottom nav: show up to 4 items inline, collapse the rest into a "Más" sheet.
  const MOBILE_INLINE = 4;
  const needsMore = items.length > MOBILE_INLINE + 1;
  const inlineItems = needsMore ? items.slice(0, MOBILE_INLINE) : items;
  const overflowItems = needsMore ? items.slice(MOBILE_INLINE) : [];
  const mobileCellCount = inlineItems.length + (needsMore ? 1 : 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto grid h-14 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-7 w-7 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="text-h3 truncate">{brand}</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <User className="h-4 w-4" />
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:px-3 lg:py-6">
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const active =
                pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  ].join(" ")}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-5 pb-24 pt-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden">
        <ul
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${mobileCellCount}, minmax(0, 1fr))` }}
        >
          {inlineItems.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={[
                    "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="truncate max-w-full">{item.label}</span>
                </Link>
              </li>
            );
          })}
          {needsMore ? (
            <li>
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className={[
                      "flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                      overflowItems.some(
                        (i) => pathname === i.to || (i.to !== "/" && pathname.startsWith(i.to)),
                      )
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                    aria-label="Más opciones"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                    <span>Más</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl">
                  <SheetHeader>
                    <SheetTitle>Más</SheetTitle>
                  </SheetHeader>
                  <ul className="mt-4 grid grid-cols-2 gap-2 pb-4">
                    {overflowItems.map((item) => {
                      const active =
                        pathname === item.to ||
                        (item.to !== "/" && pathname.startsWith(item.to));
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className={[
                              "flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm font-medium transition-colors",
                              active
                                ? "bg-secondary text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            ].join(" ")}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </SheetContent>
              </Sheet>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}

export const studentNavItems: NavItem[] = [
  { to: "/app", label: "Calendario", icon: Calendar },
  { to: "/app/reservas", label: "Reservas", icon: BookmarkCheck },
  { to: "/app/recuperaciones", label: "Recuperaciones", icon: RotateCcw },
  { to: "/app/planes", label: "Planes", icon: CreditCard },
  { to: "/app/perfil", label: "Perfil", icon: User },
];
