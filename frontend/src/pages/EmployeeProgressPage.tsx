import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader, Lock } from 'lucide-react';
import api from '../utils/api';

export function EmployeeProgressPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    fiscalYear: string;
    qoqTrends: Array<{ name: string; progress: number; status: string }>;
    summary: {
      approvedQuarters: number;
      pendingQuarters: number;
      annualProgress: number | null;
    };
    quarters: Array<{
      quarter: string;
      status: string;
      averageProgress: number | null;
    }>;
  } | null>(null);

  useEffect(() => {
    api
      .getEmployeeProgress()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-slate-600">Unable to load progress data.</p>;
  }

  const chartData = data.qoqTrends.map((q) => ({
    name: q.name,
    progress: q.status === 'APPROVED' ? q.progress : 0,
    status: q.status,
    statusLabel:
      q.status === 'PENDING_MANAGER_EVALUATION'
        ? 'Pending Manager Evaluation'
        : q.status === 'NOT_SUBMITTED'
          ? 'Not submitted'
          : `${q.progress}%`,
  }));

  return (
    <div className="py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">My Progress</h1>
        <p className="text-slate-600">
          Fiscal year {data.fiscalYear} — only manager-approved quarters count toward trends
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-5">
          <p className="text-sm text-slate-500">Approved quarters</p>
          <p className="text-2xl font-bold text-green-600">{data.summary.approvedQuarters}</p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <p className="text-sm text-slate-500">Pending evaluation</p>
          <p className="text-2xl font-bold text-amber-600">{data.summary.pendingQuarters}</p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <p className="text-sm text-slate-500">Annual progress (approved only)</p>
          <p className="text-2xl font-bold text-blue-600">
            {data.summary.annualProgress !== null ? `${data.summary.annualProgress}%` : '—'}
          </p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Quarterly trend</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} />
            <Tooltip
              formatter={(value, _name, props) => {
                const payload = props.payload as { status: string; statusLabel: string };
                if (payload.status === 'PENDING_MANAGER_EVALUATION') {
                  return ['Pending Manager Evaluation', 'Progress'];
                }
                if (payload.status !== 'APPROVED') {
                  return [payload.statusLabel, 'Progress'];
                }
                return [`${value}%`, 'Progress'];
              }}
            />
            <Line type="monotone" dataKey="progress" stroke="#3b82f6" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.quarters.map((q) => (
          <div key={q.quarter} className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-900">{q.quarter}</span>
              {q.status === 'PENDING_MANAGER_EVALUATION' && (
                <Lock className="w-4 h-4 text-amber-500" />
              )}
            </div>
            {q.status === 'APPROVED' && q.averageProgress !== null ? (
              <p className="text-2xl font-bold text-blue-600">{q.averageProgress}%</p>
            ) : q.status === 'PENDING_MANAGER_EVALUATION' ? (
              <p className="text-sm font-medium text-amber-700">Pending Manager Evaluation</p>
            ) : (
              <p className="text-sm text-slate-500">Not submitted</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
