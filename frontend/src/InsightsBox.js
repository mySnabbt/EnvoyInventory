// InsightsBox.jsx
import React from 'react';

export default function InsightsBox({ bestMonth, bestValue, worstMonth, worstValue, average }) {
  return (
    <div className="mt-4 rounded-xl bg-[#D3FFE9] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-around gap-6 text-sm">
        <div className="text-center">
          <div className="text-xl font-bold text-[#4B5043]">{bestMonth}</div>
          <div className="text-sm">Best Month<br/>(${bestValue.toFixed(2)})</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[#4B5043]">{worstMonth}</div>
          <div className="text-sm">Lowest Month<br/>(${worstValue.toFixed(2)})</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[#4B5043]">${average}</div>
          <div className="text-sm">Avg Monthly Revenue</div>
        </div>
      </div>
    </div>
  );
}
