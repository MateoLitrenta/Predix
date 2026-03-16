"use client";

import { Button } from "@/components/ui/button";
import {
  Landmark,
  Trophy,
  TrendingUp,
  Clapperboard,
  LayoutGrid,
  Bitcoin,
  Cpu,
  Atom,
  CloudSun,
  Music
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const categories = [
  { id: "all", label: "Todos", icon: LayoutGrid },
  { id: "política", label: "Política", icon: Landmark },
  { id: "deportes", label: "Deportes", icon: Trophy },
  { id: "finanzas", label: "Finanzas", icon: TrendingUp },
  { id: "cripto", label: "Cripto", icon: Bitcoin },
  { id: "tecnología", label: "Tecnología", icon: Cpu },
  { id: "ciencia", label: "Ciencia", icon: Atom },
  { id: "clima", label: "Clima", icon: CloudSun },
  { id: "entretenimiento", label: "Entretenimiento", icon: Clapperboard },
  { id: "música", label: "Música", icon: Music },
];

export function CategoryFilter({
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const Icon = category.icon;
        const isSelected = selectedCategory === category.id;

        return (
          <Button
            key={category.id}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              "transition-all duration-200",
              isSelected
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "border-border/50 hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            <Icon className="w-4 h-4 mr-2" />
            {category.label}
          </Button>
        );
      })}
    </div>
  );
}