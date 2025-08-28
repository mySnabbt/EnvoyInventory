// StockDistributionChart.jsx
import React, { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(ArcElement, Tooltip, Legend);

export default function StockDistributionChart({ token, apiUrl, metric = 'units' }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Brand-friendly palette (extends your current colours)
  const palette = [
    '#9BC4BC', '#4B5043', '#D3FFE9', '#090909',
    '#86A8CF', '#A1E8AF', '#FFD6A5', '#BDB2FF',
    '#FFADAD', '#CAFFBF', '#FDFFB6', '#9BF6FF'
  ];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${apiUrl}/inventory/stock-by-category?metric=${metric}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(json => {
        if (!alive) return;
        if (json.error) {
          setErr(json.error);
          setLoading(false);
          return;
        }

        const labels = json.labels || [];
        const values = json.data || [];

        if (!labels.length) {
          setChartData(null);
          setLoading(false);
          return;
        }

        const colors = labels.map((_, i) => palette[i % palette.length]);

        setChartData({
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        });
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        setErr('Failed to load stock distribution');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [apiUrl, token, metric]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#090909', font: { size: 14 } }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.label || '';
            const value = ctx.raw ?? 0;
            return metric === 'value' ? `${label}: $${value.toLocaleString()}` : `${label}: ${value}`;
          }
        }
      }
    }
  };

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-6">
      <div className="flex items-center justify-between">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Stock Distribution by Category</h3>

        {/* Optional quick switch between Units and Value */}
        {/* Comment this <select> out if you don’t want it */}
        {/* <select
          value={metric}
          onChange={() => {}}
          className="rounded-md border px-2 py-1 text-sm bg-white"
          disabled
        >
          <option value="units">Units</option>
          <option value="value">Value ($)</option>
        </select> */}
      </div>

      <div className="h-[220px] md:h-[260px] xl:h-[300px]">
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {!loading && err && <div className="text-sm text-red-600">{err}</div>}
        {!loading && !err && chartData && <Pie data={chartData} options={options} />}
        {!loading && !err && !chartData && (
          <div className="text-sm text-gray-500">No category data found.</div>
        )}
      </div>
    </div>
  );
}
