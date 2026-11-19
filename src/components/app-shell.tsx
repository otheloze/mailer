"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, BookOpenText, CalendarClock, ChevronsUpDown, CircleHelp, CreditCard,
  Command, ContactRound, LayoutDashboard, Mail, Menu, Moon, PenSquare, Search, Target,
  Send, Settings2, UsersRound, X, Sun, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/client";
import { mustSubscribe, trialSummary, type TrialStatus } from "@/lib/trial-shared";

const primary = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", href: "/campaigns", icon: Send },
  { label: "Contacts", href: "/contacts", icon: ContactRound },
  { label: "Prospecting", href: "/leads", icon: Target },
  { label: "Audiences", href: "/audiences", icon: UsersRound },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Subscription", href: "/subscriptions", icon: CreditCard },
];
const manage = [
  { label: "Templates", href: "/templates", icon: BookOpenText },
  { label: "Scheduled", href: "/scheduled", icon: Mail },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [trial, setTrial] = useState<TrialStatus | null>(null);

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data, error }) => {
      if (!active || error) return;
      setIsAdmin(data.user?.app_metadata?.role === "admin");
      setAccountEmail(data.user?.email ?? "");
    });
    void createClient().rpc("get_trial_status").then(({ data, error }) => {
      if (active && !error && data) setTrial(data as TrialStatus);
    });
    return () => { active = false; };
  }, [pathname]);

  // Restore the saved theme (or the system preference) on first load.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("mmm-theme"); } catch { /* storage unavailable */ }
    const prefersDark = saved ? saved === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    document.documentElement.classList.toggle("dark", prefersDark);
    setDark(prefersDark);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { window.localStorage.setItem("mmm-theme", next ? "dark" : "light"); } catch { /* storage unavailable */ }
    setDark(next);
  }

  const initials = (accountEmail.split("@")[0] || "MM").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "MM";

  const sidebar = (
    <aside className="flex h-dvh w-[260px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-white/[.08] bg-[#111b32] px-4 py-5 text-white shadow-[18px_0_48px_-36px_rgba(9,20,45,.45)]">
      <Link href="/dashboard" className="mb-7 flex items-center gap-3 px-1.5">
        <div className="grid size-10 place-items-center rounded-[14px] bg-gradient-to-br from-[#8ab7ff] via-[#5279f3] to-[#4051d9] text-white shadow-[0_8px_24px_-8px_rgba(91,132,255,.75)]">
          <Send size={17} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-[.025em]">MYMAILMARKET</div>
          <div className="mt-0.5 text-[13px] text-white/45">Growth workspace</div>
        </div>
        <ChevronsUpDown size={15} className="ml-auto text-white/35" />
      </Link>
      <div className="flex-1 pb-3">
      <Link href="/campaigns/compose" onClick={() => setMobileOpen(false)} className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4a68d8] to-[#5b7cf0] text-[14px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(91,132,255,.9)] transition hover:brightness-110">
        <PenSquare size={16} /> Compose
      </Link>
      <button onClick={() => setSearchOpen(true)} className="mb-6 flex h-10 w-full items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-[14px] text-white/50 transition hover:border-white/20 hover:bg-white/[.08]">
        <Search size={14} /> Quick search <span className="ml-auto rounded-md border border-white/[.12] px-1.5 py-0.5 text-[12px] text-white/40"><Command size={10} /></span>
      </button>
      <div className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-[.18em] text-white/35">Workspace</div>
      <nav className="space-y-1">
        {primary.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={cn("group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-all duration-200",
                active ? "bg-gradient-to-r from-[#36548a]/80 to-[#263d68]/70 font-medium text-white shadow-[inset_0_0_0_1px_rgba(164,196,255,.13)]" : "text-white/60 hover:bg-white/[.07] hover:text-white")}>
              <Icon size={16} strokeWidth={1.8} className={active ? "text-[#9ec3ff]" : "text-white/45 transition-colors group-hover:text-white/80"} />{label}
            </Link>
          );
        })}
      </nav>
      {isAdmin && <Link href="/admin/subscriptions" onClick={() => setMobileOpen(false)}
        className={cn("mt-1 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-all",
          pathname.startsWith("/admin") ? "bg-[#263d68] font-medium text-white" : "text-white/60 hover:bg-white/[.07] hover:text-white")}>
        <Shield size={16} strokeWidth={1.8} className="text-white/45" /> Administration
      </Link>}
      <div className="mb-2 mt-8 px-2 text-[12px] font-semibold uppercase tracking-[.18em] text-white/35">Manage</div>
      <nav className="space-y-1">
        {manage.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setMobileOpen(false)}
            className={cn("group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-all",
              pathname.startsWith(href) ? "bg-[#263d68] font-medium text-white" : "text-white/60 hover:bg-white/[.07] hover:text-white")}>
            <Icon size={16} strokeWidth={1.8} className="text-white/45 group-hover:text-white/80" />{label}
          </Link>
        ))}
      </nav>
      </div>
      <div className="shrink-0">
        <Link href="/settings" className="flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-white/60 transition hover:bg-white/[.07] hover:text-white">
          <Settings2 size={16} strokeWidth={1.8} className="text-white/45" /> Settings
        </Link>
        <Link href="/contact" onClick={() => setMobileOpen(false)} className="flex h-10 items-center gap-3 rounded-xl px-3 text-left text-[14px] text-white/60 transition hover:bg-white/[.07] hover:text-white">
          <CircleHelp size={16} strokeWidth={1.8} className="text-white/45" /> Help & support
        </Link>
        <div className="mt-4 flex items-center border-t border-white/[.1] pt-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#f0c99a] to-[#bf8c66] text-[13px] font-bold text-[#3c2531]">{initials}</div>
          <div className="ml-2.5 min-w-0"><div className="truncate text-[14px] font-medium text-white/90" title={accountEmail}>{accountEmail || "Your workspace"}</div><div className="text-[12px] text-white/40">{isAdmin ? "Administrator" : "Account"}</div></div>
          <button onClick={toggleTheme} aria-label="Toggle theme" className="ml-auto rounded-lg p-2 text-white/50 transition hover:bg-white/[.08] hover:text-white">{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_rgba(112,151,255,.09),_transparent_34%),#f4f6fa] text-ink dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(77,117,220,.12),_transparent_34%),#111827] dark:text-[#f4f7ff]">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-[#0b1428]/55 backdrop-blur-sm" /><div className="absolute inset-y-0 left-0">{sidebar}<button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden"><X size={17} /></button></div></div>}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-[#e4e9f1]/90 bg-white/85 px-5 backdrop-blur-xl dark:border-white/[.08] dark:bg-[#111b32]/85 sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted transition hover:bg-[#edf1f8] lg:hidden"><Menu size={18} /></button>
            <div className="hidden text-[14px] text-muted sm:block">Workspace <span className="mx-2 text-[#c3cad7]">/</span><span className="font-medium text-ink dark:text-white">{pageTitle(pathname)}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/campaigns/compose" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#344e9e] to-[#4a68d8] px-3.5 text-[14px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(49,75,169,.7)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-10px_rgba(49,75,169,.65)]"><PenSquare size={14} /> Compose</Link>
            <div title={accountEmail} className="ml-2 hidden size-9 place-items-center rounded-xl border border-[#e6eaf1] bg-gradient-to-br from-white to-[#e9eef8] text-[13px] font-bold text-[#52658b] shadow-sm dark:border-white/10 dark:from-[#263d68] dark:to-[#1d3157] dark:text-[#bcd0ff] sm:grid">{initials}</div>
          </div>
        </header>
        {trial?.trial_eligible && <div className="border-b border-[#dbe4fb] bg-[#eef3ff] px-5 py-2.5 text-[13px] text-[#2f4a9e] dark:border-white/[.08] dark:bg-[#17233d] dark:text-[#b8cbff] sm:px-8">
          <strong className="font-semibold">Free trial:</strong> {trialSummary(trial)}.{" "}
          <Link href="/subscriptions" className="font-semibold underline underline-offset-2">{mustSubscribe(trial) ? "Choose a plan to continue" : "See plans"}</Link>
        </div>}
        <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
      {searchOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[15vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <div className="w-full max-w-[500px] overflow-hidden rounded-2xl border border-[#e3e8f0] bg-white shadow-[0_32px_90px_-40px_rgba(14,26,54,.38)] dark:border-[#303c56] dark:bg-[#17233d]">
          <div className="flex items-center gap-2 border-b border-line px-4 dark:border-[#30302d]"><Search size={16} className="text-muted" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages…" className="h-12 flex-1 bg-transparent text-sm outline-none" /><kbd className="rounded border border-line px-1.5 py-0.5 text-[13px] text-muted dark:border-[#30302d]">ESC</kbd></div>
          <div className="p-2">{[...primary, ...manage, { label: "Settings", href: "/settings", icon: Settings2 }].filter((item) => item.label.toLowerCase().includes(search.toLowerCase())).map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => { setSearchOpen(false); setSearch(""); }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-[#f5f5f2] dark:hover:bg-[#252523]"><Icon size={16} className="text-muted" />{label}</Link>)}
            {!([...primary, ...manage, { label: "Settings", href: "/settings", icon: Settings2 }].some((item) => item.label.toLowerCase().includes(search.toLowerCase()))) && <p className="px-3 py-5 text-center text-xs text-muted">No matching pages.</p>}
          </div>
        </div>
      </div>}
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/campaigns/compose")) return "Compose";
  if (pathname.startsWith("/campaigns/new")) return "New campaign";
  if (pathname.startsWith("/campaigns")) return "Campaigns";
  if (pathname.startsWith("/contacts")) return "Contacts";
  if (pathname.startsWith("/leads")) return "Prospecting";
  if (pathname.startsWith("/audiences")) return "Audiences";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/templates")) return "Templates";
  if (pathname.startsWith("/scheduled")) return "Scheduled";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/subscriptions")) return "Subscription";
  if (pathname.startsWith("/admin")) return "Administration";
  return "Overview";
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>{eyebrow && <div className="mb-2 text-[12px] font-semibold uppercase tracking-[.18em] text-[#6478b0] dark:text-[#9eb4f3]">{eyebrow}</div>}
        <h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#17233d] dark:text-white sm:text-[31px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[14px] leading-5 text-muted">{description}</p>}
      </div>{action}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: "campaign" | "audience" | "scheduled"; title: string; description: string; action?: React.ReactNode }) {
  const Icon = icon === "campaign" ? Send : icon === "audience" ? UsersRound : CalendarClock;
  return <div className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfd8e8] bg-white/65 px-6 text-center shadow-soft dark:border-[#36445f] dark:bg-[#17233d]">
    <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#e7efff] to-[#dce4fb] text-[#4665cf] dark:from-[#263d68] dark:to-[#1d3157] dark:text-[#a8c3ff]"><Icon size={19} /></div>
    <h3 className="text-[14px] font-semibold">{title}</h3>
    <p className="mt-1 max-w-sm text-[14px] leading-5 text-muted">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}
