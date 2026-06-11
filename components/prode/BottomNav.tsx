import React from "react";
import Link from "next/link";
import { Trophy, ListOrdered, PenLine, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  currentTab: "torneos" | "posiciones" | "pronosticos" | "fixture";
  onTabChange: (tab: "torneos" | "posiciones" | "pronosticos" | "fixture") => void;
}

export function BottomNav({ currentTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: "torneos", label: "Torneos", icon: Trophy },
    { id: "posiciones", label: "Posiciones", icon: ListOrdered },
    { id: "pronosticos", label: "Pronósticos", icon: PenLine },
    { id: "fixture", label: "Fixture", icon: CalendarDays },
  ] as const;

  return (
    <div className="md:hidden fixed bottom-0 left-0 z-50 w-full h-16 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/80 safe-area-bottom">
      <div className="grid h-full w-full grid-cols-4 mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className="inline-flex flex-col items-center justify-center px-5 hover:bg-zinc-900/50 group transition-all"
            >
              <Icon
                className={cn(
                  "w-5 h-5 mb-1 transition-all",
                  isActive
                    ? "text-yellow-500 scale-110 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                    : "text-zinc-500 group-hover:text-zinc-400"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-all",
                  isActive ? "text-yellow-500" : "text-zinc-500 group-hover:text-zinc-400"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
