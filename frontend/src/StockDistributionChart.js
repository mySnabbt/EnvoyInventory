// StockDistributionChart.jsx
import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(ArcElement, Tooltip, Legend);

export default function StockDistributionChart() {
  const data = {
    labels: ['Snacks', 'Drinks', 'Cleaning', 'Misc'],
    datasets: [
      {
        data: [40, 30, 10, 20],
        backgroundColor: ['#9BC4BC', '#4B5043', '#D3FFE9', '#090909'],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#090909', font: { size: 14 } },
      },
    },
  };

  return (
    // inside return
    <div className="rounded-2xl border bg-white shadow-sm p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Stock Distribution by Category</h3>
      <div className="h-[220px] md:h-[260px] xl:h-[300px]">
        <Pie data={data} options={{ responsive: true, maintainAspectRatio: false, plugins:{ legend:{ position:'bottom', labels:{ color:'#090909', font:{ size:14 }}}}}} />
      </div>
    </div>
  );
}
