// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Joyride, STATUS, Step } from "react-joyride";
import { useTheme } from "next-themes";

export function ProductTour() {
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [run, setRun] = useState(false);
  const [tourKey, setTourKey] = useState(0);
  const [createTarget, setCreateTarget] = useState("#tour-create-btn-desktop");

  useEffect(() => {
    setIsMounted(true); // Confirma a React que ya estamos en el navegador
    
    // Calcular el target correcto del botón crear según el tamaño de la pantalla
    const updateTarget = () => {
      setCreateTarget(window.innerWidth >= 1024 ? "#tour-create-btn-desktop" : "#tour-create-btn-mobile");
    };
    updateTarget();
    window.addEventListener("resize", updateTarget);

    // Escuchar el evento personalizado del NavHeader
    const handleStartTour = () => {
      setRun(false);
      setTimeout(() => {
        setTourKey(prev => prev + 1);
        setRun(true);
      }, 300);
    };

    window.addEventListener('start-onboarding-tour', handleStartTour);

    return () => {
      window.removeEventListener('start-onboarding-tour', handleStartTour);
      window.removeEventListener("resize", updateTarget);
    };
  }, []);

  const isDark = theme === "dark" || (typeof document !== 'undefined' && document.documentElement.classList.contains("dark"));

  const steps: any[] = [
    {
      target: "body",
      content: "¡Bienvenido a Zéilo! Aprende a predecir el futuro y ganar puntos en 3 simples pasos.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: "#tour-bonus-btn",
      content: "El combustible para operar. Reclama tus puntos gratis todos los días aquí.",
      disableBeacon: false,
    },
    {
      target: "#tour-markets-grid > div:first-child",
      content: "Aquí están los mercados. Predice el resultado comprando 'SÍ' o 'NO'. ¡Si aciertas, cobras el premio!",
      disableBeacon: false,
    },
    {
      target: createTarget,
      content: "¿Tienes una mejor pregunta? Crea tu propio mercado y gana comisiones por cada participante.",
      disableBeacon: false,
    },
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status, action } = data;
    
    // Evaluamos directamente con los strings nativos de la librería
    if (status === 'finished' || status === 'skipped' || action === 'close') {
      setRun(false); // Apaga el tour
    }
  };

  if (!isMounted) return null;

  return (
    <Joyride
      key={tourKey}
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton={false}
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={steps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: "#f59e0b",
          backgroundColor: isDark ? "#18181b" : "#ffffff",
          textColor: isDark ? "#f3f4f6" : "#111827",
          arrowColor: isDark ? "#18181b" : "#ffffff",
          overlayColor: "rgba(0, 0, 0, 0.75)", // Spotlight overlay
        },
        tooltip: {
          borderRadius: "12px",
          padding: "20px",
        },
        tooltipContainer: {
          textAlign: "left",
        },
        buttonClose: {
          display: "none",
        },
        buttonSkip: {
          color: isDark ? "#9ca3af" : "#6b7280",
          fontSize: "14px",
          fontWeight: 600,
        },
        buttonNext: {
          backgroundColor: "#f59e0b",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "14px",
          fontWeight: 600,
          padding: "8px 16px",
        },
        buttonBack: {
          color: isDark ? "#d1d5db" : "#4b5563",
          marginRight: "8px",
          fontSize: "14px",
          fontWeight: 600,
        }
      } as any}
      locale={{
        back: 'Atrás',
        close: 'Cerrar',
        last: 'Finalizar',
        next: 'Siguiente',
        skip: 'Saltear',
      }}
    />
  );
}
