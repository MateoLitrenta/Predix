"use client";

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface MarketRechartProps {
  data: any[];
  options: any[];
  marketCreatedAt?: number;
  chartTimeframe?: string;
}

export function MarketRechart({ data, options, marketCreatedAt, chartTimeframe }: MarketRechartProps) {
  // Filter data by timeframe
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    let visibleData = data;
    let fromTimestamp = 0;
    const lastDataPointTime = data[data.length - 1].timestamp;
    const targetEnd = new Date(lastDataPointTime).getTime();

    if (chartTimeframe !== 'ALL') {
      if (chartTimeframe === '1D') fromTimestamp = targetEnd - (24 * 60 * 60 * 1000);
      else if (chartTimeframe === '1W') fromTimestamp = targetEnd - (7 * 24 * 60 * 60 * 1000);
      else if (chartTimeframe === '1M') fromTimestamp = targetEnd - (30 * 24 * 60 * 60 * 1000);

      // Keep the last point before the timeframe starts so the line comes in horizontally
      const pointBefore = [...data].reverse().find(d => d.timestamp < fromTimestamp);
      visibleData = data.filter(d => d.timestamp >= fromTimestamp);
      
      if (pointBefore && visibleData.length > 0 && visibleData[0].timestamp > fromTimestamp) {
         visibleData = [{...pointBefore, timestamp: fromTimestamp}, ...visibleData];
      }
    }

    // Time-Series Padding (Densify) para que el Tooltip de Recharts reaccione en los espacios vacíos
    const denseResult: any[] = [];
    if (visibleData.length > 0) {
      const minT = visibleData[0].timestamp;
      const maxT = visibleData[visibleData.length - 1].timestamp;
      
      // Inyectar alrededor de 150-200 puntos artificiales a lo largo del gráfico para el Tooltip
      const step = Math.max(1000, (maxT - minT) / 150);

      let currentIndex = 0;
      for (let t = minT; t <= maxT; t += step) {
        // Añadir puntos reales que hayan ocurrido antes de 't'
        while (currentIndex < visibleData.length - 1 && visibleData[currentIndex + 1].timestamp <= t) {
          denseResult.push(visibleData[currentIndex]);
          currentIndex++;
        }
        
        // Inyectar un punto artificial rellenado (Forward-Fill del último nodo conocido)
        if (denseResult.length === 0 || denseResult[denseResult.length - 1].timestamp !== t) {
          denseResult.push({ ...visibleData[currentIndex], timestamp: t });
        }
      }
      
      // Asegurarse de que el último punto real o de Date.now() esté siempre al final
      if (denseResult[denseResult.length - 1].timestamp !== maxT) {
        denseResult.push(visibleData[visibleData.length - 1]);
      }
      
      return denseResult;
    }

    return visibleData;
  }, [data, chartTimeframe]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label).toLocaleString('es-AR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // Filter out nulls or 0% to clean up the tooltip
      const validPayload = payload
        .filter((entry: any) => entry.value != null && entry.value > 0.01)
        .sort((a: any, b: any) => b.value - a.value);

      if (validPayload.length === 0) return null;

      return (
        <div className="bg-card rounded-xl shadow-xl border border-border/60 p-3 min-w-[150px]">
          <div className="text-sm font-semibold text-muted-foreground mb-2">{date}</div>
          <div className="flex flex-col gap-1">
            {validPayload.map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center text-sm font-medium gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: entry.color }}></span>
                  <span className="text-foreground/80">{entry.name}</span>
                </div>
                <span className="text-foreground font-bold">{entry.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const xTickFormatter = (tickItem: number) => {
    const date = new Date(tickItem);
    if (chartTimeframe === '1D') return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    if (chartTimeframe === '1W') return date.toLocaleDateString('es-AR', { weekday: 'short' });
    return date.toLocaleDateString('es-AR', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full h-full min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150, 150, 150, 0.1)" />
          
          <XAxis 
            dataKey="timestamp" 
            type="number" 
            domain={['dataMin', 'dataMax']} 
            scale="time"
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 12, fill: '#888' }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            allowDataOverflow={true}
          />
          
          <YAxis 
            domain={['auto', 'auto']} 
            tickFormatter={(value) => `${value}%`}
            tick={{ fontSize: 12, fill: '#888' }}
            tickLine={false}
            axisLine={false}
            orientation="right"
            allowDataOverflow={false}
          />
          
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(150, 150, 150, 0.2)', strokeWidth: 1 }} />
          
          {options.map((opt, index) => {
            let color = opt.color || '#2962FF';
            if (!opt.color) {
              if (options.length === 2) {
                const isYes = ['sí', 'si', 'yes'].includes(opt.option_name.toLowerCase());
                if (isYes) color = '#0ea5e9';
                else color = '#ef4444';
              } else {
                const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
                color = colors[index % colors.length];
              }
            }

            return (
              <Line
                key={opt.id}
                type="stepAfter"
                dataKey={opt.id}
                name={opt.option_name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={true}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
