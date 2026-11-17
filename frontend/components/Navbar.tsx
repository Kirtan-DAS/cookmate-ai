"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const items = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/recipes", label: "Recipes", icon: "♜" },
  { href: "/pantry", label: "Pantry", icon: "▣" },
  { href: "/nutrition", label: "Nutrition", icon: "▥" },
];

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setEmail(session?.user.email ?? null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    setOpen(false);
    if (typeof window !== "undefined") {
      setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    }
  }, [path]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
    };
  }, []);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) { window.alert("Could not sign out"); return; }
    router.replace("/login"); router.refresh();
  }

  function runSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const term = query.trim();
    if (!term) { searchRef.current?.focus(); return; }
    // Full page navigation ensures the existing Recipes page reads the new
    // query even when already on /recipes; no API or auth behavior changes.
    window.location.assign(`/recipes?q=${encodeURIComponent(term)}`);
  }

  return <>
    <aside className="cm-side">
      <Link href="/dashboard" className="cm-brand" aria-label="CookMate home">
        <span className="cm-chef">♧</span><span>CookMate</span>
      </Link>
      <nav aria-label="Primary navigation" className="cm-side-nav">
        {items.map(item => <Link key={item.href} href={item.href}
          aria-current={path === item.href ? "page" : undefined}
          className={"cm-nav-link " + (path === item.href || path.startsWith(item.href + "/") ? "cm-active" : "")}>
          <span className="cm-nav-icon">{item.icon}</span>{item.label}
        </Link>)}
      </nav>
      <div className="cm-side-bottom"><span>✧</span><span>Cook better, every day.</span></div>
    </aside>
    <header className="cm-top">
      <form className="cm-searchbar" role="search" onSubmit={runSearch}>
        <button className="cm-search-go" type="submit" aria-label="Search CookMate recipes" title="Search recipes">⌕</button>
        <input ref={searchRef} type="search" aria-label="Search recipes and ingredients"
          placeholder="Search recipes or ingredients…" value={query}
          onChange={e => setQuery(e.target.value)} />
        <kbd>Ctrl</kbd><kbd>K</kbd>
      </form>
      <div className="cm-user" ref={menu}>
        <button type="button" className="cm-avatar" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-label="Open account menu">{email?.[0]?.toUpperCase() ?? "C"}<span>⌄</span></button>
        {open && <div className="cm-account-menu">
          <p className="cm-menu-email">{email ?? "CookMate account"}</p>
          <Link href="/dashboard" onClick={() => setOpen(false)}>My Profile</Link>
          <Link href="/onboarding" onClick={() => setOpen(false)}>Food Preferences</Link>
          <button type="button" onClick={logout}>Sign Out</button>
        </div>}
      </div>
    </header>
    <nav className="cm-mobile-nav" aria-label="Mobile navigation">
      {items.map(item => <Link href={item.href} key={item.href} className={path === item.href ? "cm-active" : ""}><span>{item.icon}</span>{item.label}</Link>)}
    </nav>
  </>;
}
