// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Joyride, STATUS, Step } from "react-joyride";
import { useTheme } from "next-themes";

export function ProductTour() {
  const { theme } = useTheme();
  const [run, setRun] = useState(false);
  const [tourKey, setTourKey] = useState(0);
  const [createTarget, setCreateTarget] = useState("#tour-create-btn-desktop");

  useEffect(() => {
    // Calcular el target correcto del botón crear según el tamaño de la pantalla
    const updateTarget = () => {
      setCreateTarget(window.innerWidth >= 1024 ? "#tour-create-btn-desktop" : "#tour-create-btn-mobile");
    };
    updateTarget();
    window.addEventListener("resize", updateTarget);

    // Revisar si ya lo vio al cargar
    const hasSeenTour = localStorage.getItem("zeilo_has_seen_onboarding");
    if (!hasSeenTour) {
      // LO GRABAMOS INMEDIATAMENTE: así si el usuario navega a otra página sin apretar "Saltear", no vuelve a aparecer al regresar.
      localStorage.setItem("zeilo_has_seen_onboarding", "true");
      setTimeout(() => setRun(true), 800);
    }

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

  const isDark = theme === "dark";

  const steps: any[] = [
    {
      target: "body",
      content: "¡Bienvenido a Zéilo! Vamos a dar un rápido paseo para que descubras cómo funciona la plataforma.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: "#tour-markets-grid",
      content: "Aquí encontrarás todos los mercados activos. Predice resultados y gana puntos.",
      disableBeacon: false,
    },
    {
      target: "#tour-bonus-btn",
      content: "Reclama tus puntos gratis todos los días para seguir operando.",
      disableBeacon: false,
    },
    {
      target: createTarget,
      content: "¿Tienes información exclusiva? Crea tu propio mercado y gana comisiones.",
      disableBeacon: false,
    },
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      localStorage.setItem("zeilo_has_seen_onboarding", "true");
      setRun(false);
    }
  };

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
          backgroundColor: isDark ? "#1f2937" : "#ffffff",
          textColor: isDark ? "#f3f4f6" : "#111827",
          arrowColor: isDark ? "#1f2937" : "#ffffff",
        },
        buttonClose: {
          display: "none",
        },
        buttonSkip: {
          color: isDark ? "#9ca3af" : "#6b7280",
        },
        buttonNext: {
          backgroundColor: "#f59e0b",
          borderRadius: "8px",
          color: "#fff",
        },
        buttonBack: {
          color: isDark ? "#d1d5db" : "#4b5563",
        }
      } as any}
      locale={{
        back: 'Anterior',
        close: 'Cerrar',
        last: 'Finalizar',
        next: 'Siguiente',
        skip: 'Saltear',
      }}
    />
  );
}
