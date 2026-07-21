"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Globe, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_PRODE_ACTIVE } from "@/lib/constants";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Inicio",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
      show: true,
    },
    {
      label: "Ranking",
      href: "/ranking",
      icon: Trophy,
      isActive: pathname?.startsWith("/ranking"),
      show: true,
    },
    {
      label: "Mundial",
      href: "/mundial",
      icon: Globe,
      isActive: pathname?.startsWith("/mundial"),
      show: IS_PRODE_ACTIVE,
    },
    {
      label: "Perfil",
      href: "/profile",
      icon: User,
      isActive: pathname?.startsWith("/profile"),
      show: true,
    },
  ];

  const visibleItems = navItems.filter((item) => item.show);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 w-full h-16 bg-background/85 dark:bg-zinc-950/85 backdrop-blur-xl border-t border-border/60 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
      <div className={cn("grid h-full w-full mx-auto max-w-md", visibleItems.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex flex-col items-center justify-center px-1 py-1 transition-all duration-200 group relative select-none active:scale-95",
                item.isActive
                  ? "text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground font-medium"
              )}
            >
              {item.isActive && (
                <span className="absolute top-0 w-10 h-0.5 bg-primary rounded-full shadow-[0_0_10px_rgba(255,185,0,0.8)] transition-all duration-300 animate-in fade-in zoom-in-75" />
              )}
              <div className="relative flex items-center justify-center">
                <Icon
                  className={cn(
                    "w-5 h-5 mb-1 transition-all duration-200",
                    item.isActive
                      ? "scale-110 text-primary drop-shadow-[0_0_8px_rgba(255,185,0,0.6)]"
                      : "text-muted-foreground group-hover:text-foreground group-hover:scale-105"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] sm:text-[11px] leading-none tracking-tight transition-colors duration-200",
                  item.isActive ? "text-primary font-bold" : "text-muted-foreground group-hover:text-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
