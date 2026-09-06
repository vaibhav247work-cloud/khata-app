interface OrdersSummaryBarProps {
  orderCount: number;
  totalOrderValue: number;
  totalPaidValue: number;
  totalRemainingValue: number;
}

export function OrdersSummaryBar({
  orderCount,
  totalOrderValue,
  totalPaidValue,
  totalRemainingValue
}: OrdersSummaryBarProps) {
  if (orderCount === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 bg-zinc-900 border border-zinc-800/80 rounded-2xl p-3 text-center">
      <div>
        <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">Total Orders</span>
        <span className="text-xs sm:text-sm font-bold text-white">
          {orderCount} <span className="text-[10px] font-normal text-zinc-500">(₹{totalOrderValue.toLocaleString('en-IN')})</span>
        </span>
      </div>
      <div>
        <span className="text-[10px] text-green-500 uppercase font-bold tracking-wider block">Total Paid</span>
        <span className="text-xs sm:text-sm font-bold text-green-500">₹{totalPaidValue.toLocaleString('en-IN')}</span>
      </div>
      <div>
        <span className="text-[10px] text-orange-400 uppercase font-bold tracking-wider block">Balance Due</span>
        <span className="text-xs sm:text-sm font-bold text-orange-400">₹{totalRemainingValue.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}
