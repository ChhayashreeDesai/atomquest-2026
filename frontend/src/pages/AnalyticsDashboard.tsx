import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, Users, Target, CheckCircle2, Loader, RefreshCw, Download } from 'lucide-react';
import api from '../utils/api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const StatCard = ({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) => (
  <div className="bg-white rounded-lg border border-slate-200 p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-slate-600 text-sm font-medium">{title}</p>
        <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
      </div>
      <div className={`${color.replace('text', 'bg')}/10 p-3 rounded-lg`}>{icon}</div>
    </div>
  </div>
);

export function AnalyticsDashboard() {
  const { user, systemDate } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState({
    goalDistribution: [] as Array<{ name: string; value: number }>,
    thrustAreaBreakdown: [] as Array<{ name: string; value: number }>,
    managerEffectiveness: [] as Array<{ name: string; value: number; pendingCheckIns?: number }>,
    qoqTrends: [] as Array<{
      name: string;
      completed: number;
      onTrack: number;
      notStarted: number;
      status?: string;
      pendingEvaluation?: number;
    }>,
    summary: {
      totalGoals: 0,
      completedGoals: 0,
      onTrackGoals: 0,
      atRiskGoals: 0,
      averageCompletion: 0,
      pendingEvaluations: 0,
    },
  });

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.getAnalytics();
      const data = response.data || {};

      setAnalytics({
        goalDistribution: data.goalDistribution || [],
        thrustAreaBreakdown: data.thrustAreaBreakdown || [],
        managerEffectiveness: (data.managerEffectiveness || []).map(
          (m: { name: string; value: number; pendingCheckIns?: number }) => ({
            name: m.name,
            value: Number(m.value),
            pendingCheckIns: m.pendingCheckIns,
          })
        ),
        qoqTrends: (data.qoqTrends || []).map(
          (q: {
            name: string;
            completed: number;
            notStarted: number;
            status: string;
            pendingEvaluation?: number;
            avgProgress?: number;
          }) => ({
            name: q.name,
            completed: q.status === 'APPROVED' ? q.completed || q.avgProgress || 0 : 0,
            onTrack: q.status === 'PENDING_MANAGER_EVALUATION' ? 0 : q.completed || 0,
            notStarted: q.pendingEvaluation || q.notStarted || 0,
            status: q.status,
            pendingEvaluation: q.pendingEvaluation,
          })
        ),
        summary: {
          totalGoals: data.summary?.totalGoals ?? 0,
          completedGoals: data.summary?.completedGoals ?? 0,
          onTrackGoals: data.summary?.onTrackGoals ?? 0,
          atRiskGoals: data.summary?.atRiskGoals ?? 0,
          averageCompletion: data.summary?.averageCompletion ?? 0,
          pendingEvaluations: data.summary?.pendingEvaluations ?? 0,
        },
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics, systemDate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const response = await api.exportAchievementReport();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atomquest_achievement_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const qoqChartData = analytics.qoqTrends.map((q) => ({
    ...q,
    pendingLabel:
      q.status === 'PENDING_MANAGER_EVALUATION'
        ? 'Pending Manager Evaluation'
        : null,
  }));

  if (loading && analytics.summary.totalGoals === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Analytics & Performance</h1>
          <p className="text-slate-600">
            {user?.role === 'MANAGER'
              ? 'Team performance (approved quarters only in trends)'
              : 'Organization-wide metrics (approval-gated)'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {analytics.summary.pendingEvaluations > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {analytics.summary.pendingEvaluations} quarterly submission(s) awaiting manager approval —
          excluded from cumulative trends until approved.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Goals" value={analytics.summary.totalGoals} icon={<Target className="w-6 h-6" />} color="text-blue-600" />
        <StatCard title="Completed" value={analytics.summary.completedGoals} icon={<CheckCircle2 className="w-6 h-6" />} color="text-green-600" />
        <StatCard title="On Track" value={analytics.summary.onTrackGoals} icon={<TrendingUp className="w-6 h-6" />} color="text-yellow-600" />
        <StatCard title="At Risk" value={analytics.summary.atRiskGoals} icon={<Users className="w-6 h-6" />} color="text-red-600" />
        <StatCard title="Avg Completion" value={`${Math.round(analytics.summary.averageCompletion)}%`} icon={<Target className="w-6 h-6" />} color="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Goal distribution by status">
          {analytics.goalDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={analytics.goalDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {analytics.goalDistribution.map((_e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Goals by thrust area (approved data)">
          {analytics.thrustAreaBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.thrustAreaBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Quarterly progress (manager-approved only)" className="lg:col-span-2">
          {qoqChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={qoqChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  formatter={(value, name, props) => {
                    const payload = props.payload as { status?: string; pendingLabel?: string };
                    if (payload.status === 'PENDING_MANAGER_EVALUATION') {
                      return ['Pending Manager Evaluation', name];
                    }
                    if (payload.status === 'NOT_SUBMITTED') {
                      return ['Not submitted', name];
                    }
                    return [`${value}%`, name];
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="completed" name="Approved avg progress" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="notStarted" name="Pending evaluation count" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Submit and approve quarterly logs to populate trends." />
          )}
        </ChartCard>

        <ChartCard title="Manager effectiveness" className="lg:col-span-2">
          {analytics.managerEffectiveness.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.managerEffectiveness}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  formatter={(value, _name, props) => {
                    const p = props.payload as { pendingCheckIns?: number };
                    return [`${value}% (${p.pendingCheckIns ?? 0} pending)`, 'Goal lock rate'];
                  }}
                />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="h-72 flex items-center justify-center text-slate-400 text-sm">{message}</div>
  );
}
