import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Calendar,
  BookmarkCheck,
  RotateCcw,
  User,
  LogOut,
  CreditCard,
  MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import logoAsset from "@/assets/logo-cazu-v2.png.asset.json";

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
    <div
      className={[
        "min-h-screen bg-background text-foreground",
        brand === "Admin" ? "admin-shell" : "",
      ].join(" ")}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-20 w-full max-w-[1180px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-8">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Ir al inicio">
            <img src={logoAsset.url} alt="Cazú Ceramics" className="h-12 w-auto shrink-0" />
          </Link>

          <span className="truncate text-center font-display text-[15px] uppercase tracking-[0.16em] text-foreground">
            {brand}
          </span>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex shrink-0 items-center gap-2 font-display text-[13px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1180px]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:py-12 lg:pr-8">
          <nav className="flex flex-col gap-6">
            {items.map((item) => {
              const active =
                pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    "flex items-center gap-3 pl-8 font-display text-[13px] uppercase tracking-[0.16em] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-border pl-8 pt-8">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 font-display text-[13px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-12 sm:px-8 lg:pb-24 lg:pl-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background lg:hidden">
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
                    "flex flex-col items-center gap-1.5 px-1 py-3 font-display text-[11px] uppercase tracking-[0.12em] transition-colors",
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
                      "flex w-full flex-col items-center gap-1.5 px-1 py-3 font-display text-[11px] uppercase tracking-[0.12em] transition-colors",
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
                <SheetContent side="bottom" className="rounded-t-none">
                  <SheetHeader>
                    <SheetTitle>Más</SheetTitle>
                  </SheetHeader>
                  <ul className="mt-4 grid grid-cols-2 gap-2 pb-4">
                    {overflowItems.map((item) => {
                      const active =
                        pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className={[
                              "flex items-center gap-3 border-t border-border pt-4 font-display text-[13px] uppercase tracking-[0.16em] transition-colors",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
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
