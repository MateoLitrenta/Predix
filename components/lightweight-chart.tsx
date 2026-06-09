"use client";

import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, LineType, ISeriesApi, Time, LineSeries } from "lightweight-charts";
import { useTheme } from "@/components/theme-provider";

interface LightweightChartProps {
  data: any[]; // The filteredHistory array
  options: any[]; // The market options
  marketCreatedAt?: number; // Market creation timestamp
  chartTimeframe?: string; // Timeframe filter
}

export function LightweightChart({ data, options, marketCreatedAt, chartTimeframe }: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const metadataRefs = useRef<Record<string, { name: string, color: string }>>({});
  const { isDarkMode } = useTheme();

  const [tooltipData, setTooltipData] = useState<{ visible: boolean, time: string, values: { name: string, color: string, value: string }[], x: number, y: number }>({ visible: false, time: '', values: [], x: 0, y: 0 });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const textColor = isDarkMode ? '#A3A3A3' : '#64748b';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#A3A3A3',
        fontFamily: 'inherit',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#f0f3fa' },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: { color: isDarkMode ? '#334155' : '#e5e7eb', width: 1, style: 1, labelVisible: false, labelBackgroundColor: isDarkMode ? '#1f2937' : '#ffffff' },
        horzLine: { visible: false, labelVisible: false },
      },
      rightPriceScale: { 
        visible: true, 
        borderVisible: false,
        autoScale: true,
        scaleMargins: { 
          top: 0.08, 
          bottom: 0 
        },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 25,
      },
      localization: {
        locale: 'es-AR',
        priceFormatter: (price: number) => {
          const rounded = price.toFixed(1);
          return rounded.endsWith('.0') ? `${Math.round(price)}%` : `${rounded}%`;
        },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Crear las series de líneas "Step" por cada opción del mercado
    options.forEach((opt, index) => {
      if (opt.is_eliminated) return;
      
      const isYes = ['sí', 'si', 'yes'].includes(opt.option_name.toLowerCase());
      const isNo = opt.option_name.toLowerCase() === 'no';
      
      let color = opt.color || '#2962FF';
      if (!opt.color) {
        if (options.length === 2) {
          if (isYes) color = '#0ea5e9'; // Azul predictivo
          if (isNo) color = '#ef4444'; // Rojo/Coral predictivo
        } else {
          const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
          color = colors[index % colors.length];
        }
      }

      const series = chart.addSeries(LineSeries, {
        color: color,
        lineWidth: 3,
        lineType: LineType.WithSteps,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => {
            const rounded = price.toFixed(1);
            return rounded.endsWith('.0') ? `${Math.round(price)}%` : `${rounded}%`;
          },
        },
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
          margins: {
            above: 0,
            below: 0,
          },
        }),
      });

      seriesRefs.current[opt.id] = series;
      metadataRefs.current[opt.id] = { name: opt.option_name, color: color };
    });

    const handleTooltip = (param: any) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        setTooltipData((prev) => ({ ...prev, visible: false }));
      } else {
        const date = new Date((param.time as number) * 1000).toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const values = options
          .filter(opt => !opt.is_eliminated && seriesRefs.current[opt.id])
          .map(opt => {
            const s = seriesRefs.current[opt.id];
            const meta = metadataRefs.current[opt.id];
            const price = param.seriesData.get(s) as any;
            return {
              name: meta.name,
              color: meta.color,
              value: price !== undefined && price.value !== undefined ? `${price.value.toFixed(1)}%` : 'N/A'
            };
          })
          .sort((a, b) => {
            if (a.value === 'N/A') return 1;
            if (b.value === 'N/A') return -1;
            return parseFloat(b.value) - parseFloat(a.value); // Sort highest first
          });

        setTooltipData({
          visible: true,
          time: date,
          values: values,
          x: param.point.x,
          y: param.point.y,
        });
      }
    };

    chart.subscribeCrosshairMove(handleTooltip);
    chart.subscribeClick(handleTooltip);

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [options, isDarkMode]);

  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return;

    const seriesData: Record<string, { time: Time, value: number }[]> = {};
    options.forEach(opt => {
      if (!opt.is_eliminated) {
        seriesData[opt.id] = [];
      }
    });

    // Process data to format required by lightweight-charts
    let lastTime = 0;
    
    data.forEach(point => {
      // 1. Critical: timestamp in seconds
      let timeInSeconds = Math.floor(new Date(point.timestamp).getTime() / 1000);
      
      // 2. Critical: zero duplicate timestamps. Add 1 second offset if duplicate
      if (timeInSeconds <= lastTime) {
        timeInSeconds = lastTime + 1;
      }
      lastTime = timeInSeconds;

      options.forEach(opt => {
        if (!opt.is_eliminated && point[opt.id] !== undefined) {
          seriesData[opt.id].push({
            time: timeInSeconds as Time,
            value: Number(point[opt.id])
          });
        }
      });
    });

    let genesisTime: number | null = null;
    if (marketCreatedAt) {
      genesisTime = Math.floor(marketCreatedAt / 1000);
    }

    // Set data to series
    options.forEach(opt => {
      if (!opt.is_eliminated && seriesRefs.current[opt.id]) {
        let finalData = seriesData[opt.id];

        if (genesisTime !== null) {
          const activeOptions = options.filter(o => !o.is_eliminated);
          const initialValue = 100 / (activeOptions.length || 1);
          const genesisPoint = { time: genesisTime as Time, value: initialValue };
          
          const filteredRealData = finalData.filter(d => (d.time as number) > genesisTime!);
          finalData = [genesisPoint, ...filteredRealData].sort((a, b) => (a.time as number) - (b.time as number));
        }

        seriesRefs.current[opt.id].setData(finalData);
      }
    });

  }, [data, options, marketCreatedAt]);

  // Handle Zoom when timeframe changes
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    let fromTimestamp: number | null = null;

    if (chartTimeframe === '1D') fromTimestamp = nowInSeconds - 86400;
    else if (chartTimeframe === '1W') fromTimestamp = nowInSeconds - (7 * 86400);
    else if (chartTimeframe === '1M') fromTimestamp = nowInSeconds - (30 * 86400);

    const animateZoom = (chartInstance: any, newFrom: number | null, newTo: number) => {
      const timeScale = chartInstance.timeScale();
      const currentRange = timeScale.getVisibleRange();

      if (!currentRange || !newFrom) {
        timeScale.fitContent();
        return;
      }

      const startFrom = currentRange.from as number;
      const duration = 400; // ms
      const startTime = performance.now();

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

        // SOLO animamos el lado izquierdo (from). El lado derecho (newTo) queda anclado.
        const currentFrom = startFrom + (newFrom - startFrom) * ease;

        // Prevención del crash "right >= left"
        if (currentFrom < newTo) {
          timeScale.setVisibleRange({ from: currentFrom as Time, to: newTo as Time });
        }

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };
      
      requestAnimationFrame(step);
    };

    if (chartTimeframe === 'ALL' || !fromTimestamp) {
      chartRef.current.timeScale().fitContent();
    } else {
      animateZoom(chartRef.current, fromTimestamp, nowInSeconds);
    }
  }, [chartTimeframe, data]);

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {tooltipData.visible && (
        <div
          className="absolute z-50 bg-card rounded-xl shadow-xl border border-border/60 p-3 min-w-[150px] pointer-events-none transition-opacity duration-150"
          style={{ 
            left: Math.min(tooltipData.x + 15, (chartContainerRef.current?.clientWidth || 500) - 150), 
            top: Math.max(0, tooltipData.y + 15) 
          }}
        >
          <div className="text-sm font-semibold text-muted-foreground mb-2">{tooltipData.time}</div>
          <div className="flex flex-col gap-1">
            {tooltipData.values.map((v, i) => (
              <div key={i} className="flex justify-between items-center text-sm font-medium">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: v.color }}></span>
                  <span className="text-foreground/80">{v.name}</span>
                </div>
                <span className="text-foreground font-bold">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
