import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'
export const alt = 'Zéilo Market'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params;
  
  // fetch market
  const { data: market } = await supabase.from('markets').select('*').eq('id', id).single()
  // fetch options
  const { data: options } = await supabase.from('market_options').select('*').eq('market_id', id).order('created_at', { ascending: true })
  // fetch history
  const { data: history } = await supabase.from('market_option_history').select('*').eq('market_id', id).order('created_at', { ascending: true })
  
  if (!market || !options) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1424', color: 'white', fontSize: 60, fontWeight: 'bold' }}>
          Zéilo
        </div>
      ),
      { ...size }
    )
  }

  // Calculate AMM Current Values with Visual Normalization
  const activeOptions = options.filter((o: any) => !o.is_eliminated);
  const rawValues: Record<string, number> = {};
  options.forEach((opt: any) => {
    if (opt.is_eliminated) {
       rawValues[opt.id] = 0;
       return;
    }
    const py = Number(opt.pool_yes || 0);
    const pn = Number(opt.pool_no || 0);
    const totalPool = py + pn;
    rawValues[opt.id] = totalPool > 0 ? Math.max(0.01, Math.min(0.99, pn / totalPool)) : (1 / (activeOptions.length || 1));
  });
  const totalRawValue = Object.values(rawValues).reduce((sum, v) => sum + v, 0);

  const currentValues: Record<string, number> = {};
  options.forEach((opt: any) => {
    currentValues[opt.id] = totalRawValue > 0 ? ((rawValues[opt.id] || 0) / totalRawValue) * 100 : 0;
  });

  const sortedOptions = [...options].sort((a: any, b: any) => (currentValues[b.id] || 0) - (currentValues[a.id] || 0));
  const top2 = sortedOptions.slice(0, 2);

  // Parse History to Timeline
  const marketCreatedAt = new Date(market.created_at).getTime();
  const genesisPoint: any = { timestamp: marketCreatedAt };
  const totalOptsCount = options.length || 2;
  options.forEach((opt: any) => {
    genesisPoint[opt.id] = (1 / totalOptsCount) * 100;
  });

  const rawHistory = (history || [])
    .filter((h: any) => new Date(h.created_at).getTime() > marketCreatedAt + 2000)
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Agrupar rawHistory por timestamp para evitar múltiples puntos en el mismo ms
  const historyByTs = new Map();
  rawHistory.forEach((h: any) => {
    const ts = new Date(h.created_at).getTime();
    if (!historyByTs.has(ts)) historyByTs.set(ts, {});
    historyByTs.get(ts)[h.option_id] = Number(h.percentage); // percentage in DB is assumed 0-100
  });

  const formattedHistory: any[] = [genesisPoint];
  let lastKnownState = { ...genesisPoint };

  Array.from(historyByTs.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([ts, changes]: any) => {
      const newState = { ...lastKnownState, timestamp: ts };
      options.forEach((opt: any) => {
        if (changes[opt.id] !== undefined && !Number.isNaN(changes[opt.id])) {
          newState[opt.id] = changes[opt.id];
        }
      });
      formattedHistory.push(newState);
      lastKnownState = { ...newState };
    });

  const chartWidth = 1080;
  const chartHeight = 250;
  
  let paths = top2.map((opt: any) => ({
    id: opt.id,
    color: opt.color || '#22c55e',
    points: ''
  }));

  if (formattedHistory.length > 0) {
    const minTs = formattedHistory[0].timestamp;
    const maxTs = Math.max(formattedHistory[formattedHistory.length - 1].timestamp, Date.now());
    const timeRange = maxTs - minTs || 1;

    paths = top2.map((opt: any) => {
      let lastVal = 50;
      let points = [];
      
      formattedHistory.forEach((h: any) => {
        if (h[opt.id] !== undefined) {
            const x = ((h.timestamp - minTs) / timeRange) * chartWidth;
            const oldY = chartHeight - (lastVal / 100) * chartHeight;
            points.push(`${x},${oldY}`);

            lastVal = h[opt.id];
            const newY = chartHeight - (lastVal / 100) * chartHeight;
            points.push(`${x},${newY}`);
        } else {
            const x = ((h.timestamp - minTs) / timeRange) * chartWidth;
            const y = chartHeight - (lastVal / 100) * chartHeight;
            points.push(`${x},${y}`);
        }
      });
      
      // Conectar al precio actual final
      const finalVal = currentValues[opt.id] || lastVal;
      const xNow = chartWidth;
      const yOld = chartHeight - (lastVal / 100) * chartHeight;
      points.push(`${xNow},${yOld}`); // Mantener horizontal hasta ahora
      const yNow = chartHeight - (finalVal / 100) * chartHeight;
      points.push(`${xNow},${yNow}`); // Ajuste final al valor actual

      return {
        id: opt.id,
        color: opt.color || '#22c55e',
        points: points.join(' ')
      };
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0f1a', // Fondo oscuro premium
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', backgroundColor: '#FACC15', borderRadius: '8px' }}>
              <div style={{ color: '#000000', fontSize: '28px', fontWeight: '900', marginTop: '-2px' }}>Z</div>
            </div>
            <div style={{ color: 'white', fontSize: '36px', fontWeight: '900', letterSpacing: '-1px' }}>Zéilo</div>
          </div>
        </div>

        <div style={{ color: 'white', fontSize: '56px', fontWeight: 'bold', lineHeight: 1.1, marginBottom: '40px', maxWidth: '1000px' }}>
          {market.title}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '30px', alignItems: 'center' }}>
          {top2.map((opt: any) => (
            <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: opt.color || '#22c55e' }} />
              <div style={{ color: '#cbd5e1', fontSize: '32px', fontWeight: '500' }}>{opt.option_name}</div>
              <div style={{ color: 'white', fontSize: '36px', fontWeight: 'bold', display: 'flex' }}>
                {`${(currentValues[opt.id] || 0).toFixed(0)}%`}
              </div>
            </div>
          ))}
          {options.length > 2 && (
             <div style={{ color: '#64748b', fontSize: '24px', display: 'flex', alignItems: 'center' }}>
               + {options.length - 2} opciones más
             </div>
          )}
        </div>

        <div style={{ display: 'flex', width: '100%', height: chartHeight, marginTop: 'auto' }}>
           {formattedHistory.length > 0 && (
              <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                {/* Líneas horizontales de referencia */}
                <line x1="0" y1="0" x2={chartWidth} y2="0" stroke="#1e293b" strokeWidth="2" strokeDasharray="6,6" />
                <line x1="0" y1={chartHeight / 2} x2={chartWidth} y2={chartHeight / 2} stroke="#1e293b" strokeWidth="2" strokeDasharray="6,6" />
                <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#1e293b" strokeWidth="2" strokeDasharray="6,6" />
                
                {paths.map((p: any) => (
                  <polyline
                    key={p.id}
                    points={p.points}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="4"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
           )}
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
