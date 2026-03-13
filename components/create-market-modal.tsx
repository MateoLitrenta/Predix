"use client";

import React from "react";

import { useState } from "react";
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
import { Calendar, Send, Sparkles, AlertCircle, Loader2 } from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      setError("Debés iniciar sesión para crear un mercado");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);

    const { ok, error: insertError } = await createMarket({
      title: question,
      description: description || null,
      category,
      end_date: endDate,
      created_by: userId,
    });

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

  const isValid = question.length >= 10 && category && endDate;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
                placeholder="¿Ganará Boca la Copa Libertadores 2026?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-[80px] resize-none"
              />
              <p
                className={cn(
                  "text-xs",
                  question.length < 10
                    ? "text-muted-foreground"
                    : "text-green-500"
                )}
              >
                {question.length}/10 caracteres mínimos
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Descripción{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Contexto adicional sobre la pregunta..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px] resize-none"
              />
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
                    <SelectItem value="Política">Política</SelectItem>
                    <SelectItem value="Deportes">Deportes</SelectItem>
                    <SelectItem value="Finanzas">Finanzas</SelectItem>
                    <SelectItem value="Entretenimiento">
                      Entretenimiento
                    </SelectItem>
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
              <p className="text-sm text-red-500 text-center">{error}</p>
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
