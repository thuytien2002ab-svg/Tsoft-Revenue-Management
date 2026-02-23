
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils';
import { ChartData } from '../types';

interface RevenueChartProps {
  data: ChartData[];
  title: string;
  grossRevenueLabel?: string;
  netRevenueLabel?: string;
}

const CustomTooltip = ({ active, payload, label, grossRevenueLabel = "Doanh thu (Gross)", netRevenueLabel = "Lợi nhuận thu về (Net)" }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 bg-slate-700 border border-slate-600 rounded shadow-md">
        <p className="font-bold text-slate-100">{label}</p>
        <p className="text-primary">{`${grossRevenueLabel}: ${formatCurrency(payload[0].payload.revenue)}`}</p>
        {payload[0].payload.netRevenue !== undefined && (
          <p className="text-green-400">{`${netRevenueLabel}: ${formatCurrency(payload[0].payload.netRevenue)}`}</p>
        )}
      </div>
    );
  }
  return null;
};


const RevenueChart: React.FC<RevenueChartProps> = ({ data, title, grossRevenueLabel = "Doanh thu (Gross)", netRevenueLabel = "Lợi nhuận thu về (Net)" }) => {
  return (
    <div className="p-6 bg-slate-800 rounded-lg shadow-lg">
      <h3 className="mb-4 text-2xl font-semibold text-slate-100">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{
            top: 5,
            right: 20,
            left: 60,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8' }} />
          <YAxis tickFormatter={(value: any) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value as number)} tick={{ fill: '#94a3b8' }} />
          <Tooltip content={<CustomTooltip grossRevenueLabel={grossRevenueLabel} netRevenueLabel={netRevenueLabel} />} cursor={{ fill: 'rgba(13, 148, 136, 0.1)' }} />
          <Legend wrapperStyle={{ color: '#e2e8f0' }} />
          <Bar dataKey="revenue" fill="#0D9488" name={grossRevenueLabel} />
          <Bar dataKey="netRevenue" fill="#4ade80" name={netRevenueLabel} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueChart;
