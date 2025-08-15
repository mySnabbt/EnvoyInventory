// RevenueInsightsCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import InsightsBox from "./InsightsBox";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function RevenueInsightsCard() {
  const [monthlyData, setMonthlyData] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/revenue/monthly`)
      .then((r) => r.json())
      .then((d) => setMonthlyData(Array.isArray(d?.monthlyTotals) ? d.monthlyTotals : []))
      .catch(console.error);
  }, []);

  const monthLabels = useMemo(
    () => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], []
  );

  const { maxRevenue, minRevenue, avgRevenue, bestMonth, worstMonth } = useMemo(() => {
    const today = new Date();
    const upto = today.getMonth();
    const past = monthlyData.slice(0, upto + 1);
    const labels = monthLabels.slice(0, upto + 1);
    if (!past.length) return { maxRevenue:0, minRevenue:0, avgRevenue:0, bestMonth:"-", worstMonth:"-" };

    const maxV = Math.max(...past);
    const minV = Math.min(...past);
    const avg  = past.reduce((s,v)=>s+v,0) / past.length;

    return {
      maxRevenue: maxV,
      minRevenue: minV,
      avgRevenue: Number.isFinite(avg) ? avg : 0,
      bestMonth: labels[past.indexOf(maxV)],
      worstMonth: labels[past.indexOf(minV)],
    };
  }, [monthlyData, monthLabels]);

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-6">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Revenue Insights</h3>
      <div className="mt-3">
        <InsightsBox
          bestMonth={bestMonth}
          bestValue={maxRevenue}
          worstMonth={worstMonth}
          worstValue={minRevenue}
          average={Number((avgRevenue ?? 0).toFixed(2))}
          compact
        />
      </div>
    </div>
  );
}
