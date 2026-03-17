"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Send, Sparkles, AlertCircle, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createMarket } from "@/lib/actions";

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onMarketCreated?: () => void;
}

export function CreateMarketModal({ isOpen, onClose, userId, onMarketCreated }: CreateMarketModalProps) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [endDate, setEndDate] = useState("");
  
  // NUEVO: Estado para manejar opciones personalizadas
  const [marketType, setMarketType] = useState<"binary" | "multiple">("binary");
  const [options, setOptions] = useState<string[]>(["", ""]); // Arranca con 2 vacías
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Funciones para manejar las opciones personalizadas
  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    if (options.length < 10) { // Límite razonable
      setOptions([...options, ""]);
    }
  };

  const removeOption = (indexToRemove: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, index) => index !== indexToRemove));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      setError("Debés iniciar sesión para crear un mercado");
      return;
    }
    
    // Validación de opciones
    let finalOptions = ['Sí', 'No'];
    if (marketType === "multiple") {
      finalOptions = options.map(opt => opt.trim()).filter(opt => opt !== "");
      if (finalOptions.length < 2) {
        setError("Un mercado múltiple debe tener al menos 2 opciones válidas.");
        return;
      }
    }
    
    setIsSubmitting(true);
    setError(null);

    // Modificamos la función para que acepte un array de opciones. 
    // NOTA: Tendremos que actualizar también `createMarket` en `lib/actions.ts` luego.
    const { ok, error: insertError } = await createMarket({
      title: question,
      description: description || null,
      category,
      end_date: endDate,
      created_by: userId,
      options: finalOptions // <- Pasamos el array de opciones
    } as any); // Usamos 'any' por ahora hasta actualizar el type en actions.ts

    setIsSubmitting(false);

    if (!ok && insertError) {
      setError(insertError);
      return;
    }

    setSubmitted(true);

    setTimeout(() => {
      setSubmitted(false);
      setQuestion("");
      setDescription("");
      setCategory("");
      setEndDate("");
      setMarketType("binary");
      setOptions(["", ""]);
      onMarketCreated?.();
      onClose();
    }, 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      onClose();
    }
  };

  // Un mercado es válido si tiene pregunta, categoría, fecha, y si es múltiple, al menos 2 opciones escritas
  const hasValidOptions = marketType === "binary" || options.filter(o => o.trim() !== "").length >= 2;
  const isValid = question.length >= 10 && category && endDate && hasValidOptions;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-primary" />
            Crear Mercado
          </DialogTitle>
          <DialogDescription>
            Proponé una pregunta para el mercado de predicciones. Será revisada
            antes de publicarse.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              ¡Pregunta Enviada!
            </h3>
            <p className="text-muted-foreground text-sm">
              Tu pregunta será revisada por nuestro equipo en las próximas 24
              horas.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            {/* Question */}
            <div className="space-y-2">
              <Label htmlFor="question">Pregunta</Label>
              <Textarea
                id="question"
                placeholder="¿Quién ganará la final de la Champions League 2026?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-[80px] resize-none"
              />
              <p className={cn("text-xs", question.length < 10 ? "text-muted-foreground" : "text-green-500")}>
                {question.length}/10 caracteres mínimos
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Descripción <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Contexto adicional o reglas de resolución..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px] resize-none"
              />
            </div>

            {/* NUEVO: Selector de Tipo de Mercado y Opciones */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
              <Label>Tipo de Mercado</Label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button 
                  type="button" 
                  variant={marketType === "binary" ? "default" : "outline"}
                  onClick={() => setMarketType("binary")}
                >
                  Sí / No
                </Button>
                <Button 
                  type="button" 
                  variant={marketType === "multiple" ? "default" : "outline"}
                  onClick={() => setMarketType("multiple")}
                >
                  Opciones Múltiples
                </Button>
              </div>

              {marketType === "multiple" && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label className="text-sm text-muted-foreground">Definí las opciones posibles (mínimo 2):</Label>
                  {options.map((option, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <div className="w-6 text-center text-xs font-medium text-muted-foreground">{index + 1}.</div>
                      <Input 
                        placeholder={index === 0 ? "Ej: Real Madrid" : index === 1 ? "Ej: Manchester City" : "Otra opción..."} 
                        value={option} 
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        className="flex-1"
                      />
                      {options.length > 2 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)} className="text-muted-foreground hover:text-red-500 shrink-0">
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {options.length < 10 && (
                    <Button type="button" variant="outline" size="sm" onClick={addOption} className="w-full mt-2 border-dashed">
                      <Plus className="w-4 h-4 mr-2" /> Agregar opción
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Category and End Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="política">Política</SelectItem>
                    <SelectItem value="deportes">Deportes</SelectItem>
                    <SelectItem value="finanzas">Finanzas</SelectItem>
                    <SelectItem value="cripto">Cripto</SelectItem>
                    <SelectItem value="tecnología">Tecnología</SelectItem>
                    <SelectItem value="ciencia">Ciencia</SelectItem>
                    <SelectItem value="clima">Clima</SelectItem>
                    <SelectItem value="entretenimiento">Entretenimiento</SelectItem>
                    <SelectItem value="música">Música</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">Fecha de cierre</Label>
                <div className="relative">
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="pl-9"
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Guidelines */}
            <div className="rounded-lg bg-muted/50 p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">
                  Requisitos para aprobación:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Pregunta clara con resultado verificable</li>
                  <li>No contenido ofensivo o difamatorio</li>
                  <li>Fecha de resolución razonable</li>
                </ul>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center bg-red-500/10 py-2 rounded-md">{error}</p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isSubmitting || !userId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar para Revisión
                </>
              )}
            </Button>
            
            {!userId && (
              <p className="text-xs text-muted-foreground text-center">
                Debés iniciar sesión para crear un mercado
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}