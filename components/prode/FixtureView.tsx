import React, { useState } from "react";
import { Match, Prediction } from "@/lib/types/prode";
import { MatchCard } from "./MatchCard";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FixtureViewProps {
  matches: Match[];
  predictions: Record<string, Prediction>;
  onPredictionChange: (matchId: string, home: number | null, away: number | null) => void;
}

export function FixtureView({ matches, predictions, onPredictionChange }: FixtureViewProps) {
  // Extraer jornadas únicas
  const matchdays = Array.from(new Set(matches.map((m) => m.matchday)));
  const [selectedMatchday, setSelectedMatchday] = useState(matchdays[0]);

  const filteredMatches = matches.filter((m) => m.matchday === selectedMatchday);

  return (
    <div className="flex flex-col w-full h-full space-y-4">
      {/* Scrollable Tabs */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex w-max space-x-2 p-1">
          {matchdays.map((matchday) => (
            <button
              key={matchday}
              onClick={() => setSelectedMatchday(matchday)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold transition-all",
                selectedMatchday === matchday
                  ? "bg-yellow-500 text-zinc-950 shadow-md shadow-yellow-500/20"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
              )}
            >
              {matchday}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      {/* Lista de Partidos */}
      <div className="flex flex-col space-y-4 pb-24 md:pb-4">
        {filteredMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            prediction={predictions[match.id]}
            onPredictionChange={onPredictionChange}
          />
        ))}
        {filteredMatches.length === 0 && (
          <div className="text-center py-10 text-zinc-500 font-medium">
            No hay partidos disponibles para esta jornada.
          </div>
        )}
      </div>
    </div>
  );
}
