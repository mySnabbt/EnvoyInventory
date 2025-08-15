// TotalInventoryWorthCard.jsx
import React from 'react';

export default function TotalInventoryWorthCard({ worth }) {
  const value = Number.isFinite(worth) ? worth : 0; // safety

  // Or use Intl if you prefer automatic currency formatting:
  // const display = new Intl.NumberFormat(undefined, { 
  //   style: 'currency', 
  //   currency: 'AUD', 
  //   minimumFractionDigits: 2 
  // }).format(value);

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-6 text-center min-h-[160px]">
      <h2 className="mb-2 text-base font-semibold text-gray-900">
        Total Inventory Worth
      </h2>
      <div className="inline-block rounded-xl bg-[#D3FFE9] px-5 py-3 text-2xl font-bold text-gray-900 tabular-nums">
        ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        {/* Or: {display} if you used Intl above */}
      </div>
    </div>
  );
}
