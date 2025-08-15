// RevenueChart.jsx
// remove: import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import React, { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function RevenueChart() {
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/revenue/monthly`)
      .then((r) => r.json())
      .then((d) => setMonthlyData(Array.isArray(d?.monthlyTotals) ? d.monthlyTotals : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthLabels = useMemo(
    () => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    []
  );

  const chartData = useMemo(() => ({
    labels: monthLabels,
    datasets: [{
      label: "Monthly Revenue ($)",
      data: monthlyData,
      fill: true,
      backgroundColor: (ctx) => {
        const g = ctx.chart.ctx.createLinearGradient(0,0,0,320);
        g.addColorStop(0, "rgba(247, 247, 247, 0.25)");
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        return g;
      },
      borderColor: "rgba(76, 93, 90, 1)",
      tension: 0.4,
      pointBackgroundColor: "rgba(0, 0, 0, 1)",
      pointBorderColor: "#fff",
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBorderWidth: 2,
    }],
  }), [monthlyData, monthLabels]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { color: "#374151" } },
      title: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` $${Number(ctx.parsed?.y ?? 0).toLocaleString()}` } },
    },
    scales: {
      x: { grid: { color: "rgba(255, 255, 255, 0.5)" }, ticks: { color: "#000000ff" } },
      y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.5)" }, ticks: { color: "#020713ff", callback: v => `$${Number(v).toLocaleString()}` } },
    },
  }), []);

  return (
    <div className="h-full w-full min-h-0">
      {loading
        ? <div className="h-full w-full animate-pulse rounded-lg bg-gray-100" />
        : <Line data={chartData} options={options} />
      }
    </div>
  );
}
