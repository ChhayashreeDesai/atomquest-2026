import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GoalCreationForm } from '../components/GoalCreationForm';
import { Loader, Send, Archive } from 'lucide-react';
import api from '../utils/api';
import { calculateProgressScore, UoMType } from '../utils/progressCalculator';

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
const ALL_QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

type QuarterUiState = 'EDITABLE' | 'SUBMITTED' | 'PENDING' | 'APPROVED' | 'REWORK';

interface GoalSheet {
  id: string;
  status: string;
  fiscalYear: string;
  isActive: boolean;
  managerFeedback?: string | null;
  goals: Array<{
    id: string;
    title: string;
    description: string;
    thrustArea: string;
    uomType: UoMType;
    targetValue: string;
    weightage: number;
  }>;
}

interface HistoryItem {
  id: string;
  fiscalYear: string;
  status: string;
  isActive: boolean;
}

interface QuarterGoal {
  id: string;
  title: string;
  description: string;
  uomType: UoMType;
  targetValue: string;
  actualAchievement: string;
  completionStatus: string;
}

export function EmployeeDashboard() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<'GOAL_CREATION' | 'QUARTERLY_TRACKING'>('GOAL_CREATION');
  const [loading, setLoading] = useState(true);
  const [goalSheet, setGoalSheet] = useState<GoalSheet | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>('Q1');
  const [quarterGoals, setQuarterGoals] = useState<QuarterGoal[]>([]);
  const [quarterReadOnly, setQuarterReadOnly] = useState(false);
  const [quarterApprovalStatus, setQuarterApprovalStatus] = useState<string | null>(null);
  const [quarterManagerFeedback, setQuarterManagerFeedback] = useState<string | null>(null);
  const [quarterStateMap, setQuarterStateMap] = useState<Record<Quarter, QuarterUiState>>({
    Q1: 'EDITABLE',
    Q2: 'EDITABLE',
    Q3: 'EDITABLE',
    Q4: 'EDITABLE',
  });
  const [submittingQuarter, setSubmittingQuarter] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({ type: '', text: '' });

  const isArchivedView =
    goalSheet?.status === 'ARCHIVED' ||
    Boolean(selectedFiscalYear && goalSheet && !goalSheet.isActive);

  const toQuarterUiState = (payload: {
    approvalStatus?: string | null;
    isReadOnly?: boolean;
  }): QuarterUiState => {
    if (payload.approvalStatus === 'APPROVED') return 'APPROVED';
    if (payload.approvalStatus === 'PENDING') return 'PENDING';
    if (payload.approvalStatus === 'REWORK_REQUESTED') return 'REWORK';
    if (payload.isReadOnly) return 'SUBMITTED';
    return 'EDITABLE';
  };

  const updateQuarterState = (quarter: Quarter, payload: { approvalStatus?: string | null; isReadOnly?: boolean }) => {
    setQuarterStateMap((prev) => ({
      ...prev,
      [quarter]: toQuarterUiState(payload),
    }));
  };

  const fetchQuarterData = useCallback(async (sheetId: string, quarter: Quarter) => {
    // Reset local lock indicators before loading selected quarter payload.
    setQuarterReadOnly(false);
    setQuarterApprovalStatus(null);
    setQuarterManagerFeedback(null);
    const res = await api.getQuarterTracking(sheetId, quarter);
    setQuarterGoals(res.data.goals || []);
    setQuarterReadOnly(res.data.isReadOnly);
    setQuarterApprovalStatus(res.data.approvalStatus);
    setQuarterManagerFeedback(res.data.managerFeedback ?? null);
    updateQuarterState(quarter, {
      approvalStatus: res.data.approvalStatus,
      isReadOnly: res.data.isReadOnly,
    });
  }, []);

  const preloadQuarterStates = useCallback(async (sheetId: string) => {
    await Promise.all(
      ALL_QUARTERS.map(async (q) => {
        try {
          const res = await api.getQuarterTracking(sheetId, q);
          updateQuarterState(q, {
            approvalStatus: res.data.approvalStatus,
            isReadOnly: res.data.isReadOnly,
          });
        } catch {
          // Keep defaults when a quarter payload cannot be loaded.
        }
      })
    );
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const configRes = await api.getSystemConfig();
      setPhase(configRes.data.phase?.phase || 'QUARTERLY_TRACKING');

      const historyRes = await api.getGoalSheetHistory();
      setHistory(historyRes.data || []);

      const params = selectedFiscalYear ? { fiscalYear: selectedFiscalYear } : undefined;
      const sheetRes = await api.getGoalSheet(undefined, params);
      const sheet = sheetRes.data as GoalSheet;
      setGoalSheet(sheet);

      if (sheet?.status === 'LOCKED' && sheet.id) {
        await fetchQuarterData(sheet.id, selectedQuarter);
        await preloadQuarterStates(sheet.id);
      }
    } catch (error) {
      console.error('Failed to load employee data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedFiscalYear, selectedQuarter, fetchQuarterData, preloadQuarterStates]);

  useEffect(() => {
    if (user) reload();
  }, [user, selectedFiscalYear]);

  useEffect(() => {
    if (goalSheet?.id && goalSheet.status === 'LOCKED') {
      fetchQuarterData(goalSheet.id, selectedQuarter);
    }
  }, [selectedQuarter, goalSheet?.id, goalSheet?.status, phase, fetchQuarterData]);

  const handleQuarterlySubmit = async () => {
    if (!goalSheet || quarterReadOnly) return;
    setSubmittingQuarter(true);
    setFeedbackMessage({ type: '', text: '' });
    try {
      await api.submitQuarterLog(goalSheet.id, selectedQuarter, {
        entries: quarterGoals.map((g) => ({
          goalId: g.id,
          actualAchievement: g.actualAchievement || '0',
          completionStatus: g.completionStatus,
        })),
      });
      setFeedbackMessage({
        type: 'success',
        text: `${selectedQuarter} log submitted. Awaiting manager evaluation. Auto-refreshing...`,
      });
      // Auto-reload data after 1.5 seconds to show fresh status
      setTimeout(() => {
        fetchQuarterData(goalSheet.id, selectedQuarter);
      }, 1500);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to submit quarter log.';
      setFeedbackMessage({ type: 'error', text: message });
    } finally {
      setSubmittingQuarter(false);
    }
  };

  if (loading && !goalSheet) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!goalSheet) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3 px-4">
        <p className="text-slate-600 text-center max-w-md">
          No goal sheet for this period. Quarterly achievement entry opens only during the active quarter window.
        </p>
      </div>
    );
  }

  const showCreationForm =
    goalSheet.status !== 'LOCKED' &&
    (phase === 'GOAL_CREATION' || isArchivedView);

  return (
    <div className="py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Employee Goal Workspace</h1>
        <p className="text-slate-600">{user?.name}</p>
      </div>

      {/* Current Year Section */}
      <div className="border-t-4 border-blue-600 pt-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4 text-blue-600">Current Year</h2>

        <StatusBanner status={goalSheet.status} managerFeedback={goalSheet.managerFeedback} />

        {feedbackMessage.text && (
          <div
            className={`p-4 rounded-lg border mt-4 ${
              feedbackMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {feedbackMessage.text}
          </div>
        )}

        {showCreationForm ? (
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-6 mt-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">Phase 1: Goal creation</h3>
            <GoalCreationForm
              key={`${user?.id}-${goalSheet.id}`}
              goalSheetId={goalSheet.id}
              readOnly={isArchivedView || goalSheet.status === 'SUBMITTED'}
              onSubmitSuccess={reload}
            />
          </div>
        ) : (
          <div className="mt-4">
            <QuarterlyTrackingPanel
              goalSheet={goalSheet}
              selectedQuarter={selectedQuarter}
              onQuarterChange={setSelectedQuarter}
              quarterStateMap={quarterStateMap}
              quarterGoals={quarterGoals}
              quarterReadOnly={quarterReadOnly || isArchivedView}
              quarterApprovalStatus={quarterApprovalStatus}
              quarterManagerFeedback={quarterManagerFeedback}
              submittingQuarter={submittingQuarter}
              onSubmit={handleQuarterlySubmit}
              onGoalChange={(goalId, field, value) =>
                setQuarterGoals((prev) =>
                  prev.map((g) => (g.id === goalId ? { ...g, [field]: value } : g))
                )
              }
            />
          </div>
        )}
      </div>

      {/* Past Years Section */}
      {history.length > 0 && (
        <div className="border-t-4 border-slate-400 pt-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4 text-slate-600">Past Years</h2>
          <div className="grid gap-4">
            {history.map((h) => (
              <div
                key={h.id}
                onClick={() => setSelectedFiscalYear(h.fiscalYear)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedFiscalYear === h.fiscalYear
                    ? 'bg-blue-50 border-blue-300 shadow-md'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{h.fiscalYear}</p>
                    <p className="text-sm text-slate-600">Status: {h.status}</p>
                  </div>
                  <Archive className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  managerFeedback,
}: {
  status: string;
  managerFeedback?: string | null;
}) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    SUBMITTED: 'bg-blue-50 border-blue-400 text-blue-800',
    LOCKED: 'bg-green-50 border-green-400 text-green-800',
    ARCHIVED: 'bg-slate-50 border-slate-400 text-slate-800',
  };
  const messages: Record<string, string> = {
    DRAFT: 'Configure balanced goals (100% total, min 10% each) and submit.',
    SUBMITTED: 'Submitted — form is read-only pending manager review.',
    LOCKED: 'Goals approved. Use quarterly tabs to log achievements.',
    ARCHIVED: 'Historical record — all fields are read-only.',
  };
  return (
    <div className={`p-4 rounded-lg border-l-4 ${styles[status] || styles.ARCHIVED}`}>
      <p className="font-bold">Goal sheet status: {status}</p>
      <p className="text-sm mt-1">{messages[status]}</p>
      {status === 'DRAFT' && managerFeedback && (
        <p className="text-sm mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
          <span className="font-semibold">Manager feedback: </span>
          {managerFeedback}
        </p>
      )}
    </div>
  );
}

function QuarterlyTrackingPanel({
  goalSheet,
  selectedQuarter,
  onQuarterChange,
  quarterStateMap,
  quarterGoals,
  quarterReadOnly,
  quarterApprovalStatus,
  quarterManagerFeedback,
  submittingQuarter,
  onSubmit,
  onGoalChange,
}: {
  goalSheet: GoalSheet;
  selectedQuarter: Quarter;
  onQuarterChange: (q: Quarter) => void;
  quarterStateMap: Record<Quarter, QuarterUiState>;
  quarterGoals: QuarterGoal[];
  quarterReadOnly: boolean;
  quarterApprovalStatus: string | null;
  quarterManagerFeedback: string | null;
  submittingQuarter: boolean;
  onSubmit: () => void;
  onGoalChange: (
    goalId: string,
    field: 'actualAchievement' | 'completionStatus',
    value: string
  ) => void;
}) {
  if (goalSheet.status !== 'LOCKED') {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-medium">
        Quarterly tracking opens after your manager approves your goals.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {ALL_QUARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onQuarterChange(q)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all border ${
              selectedQuarter === q
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{q}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${quarterBadgeClass(
                  quarterStateMap[q]
                )}`}
              >
                {quarterStateMap[q]}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-slate-900">{selectedQuarter} performance log</h3>

        {quarterApprovalStatus === 'PENDING' && (
          <p className="text-sm text-amber-700 font-medium">Pending manager evaluation</p>
        )}

        {quarterApprovalStatus === 'APPROVED' && (
          <p className="text-sm text-green-700 font-medium">Approved by manager</p>
        )}

        {quarterApprovalStatus === 'REWORK_REQUESTED' && quarterManagerFeedback && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            <p className="font-bold">Manager requested rework</p>
            <p className="mt-1">{quarterManagerFeedback}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase text-xs border-b">
              <tr>
                <th className="px-4 py-3">Goal (frozen baseline)</th>
                <th className="px-4 py-3 text-center">Planned target</th>
                <th className="px-4 py-3 text-center">Actual achievement</th>
                <th className="px-4 py-3 text-center">Progress</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quarterGoals.map((goal) => (
                <tr key={goal.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 max-w-xs">
                    <p className="font-semibold text-slate-900">{goal.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{goal.description}</p>
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-slate-700 bg-slate-50">
                    {goal.targetValue}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <input
                      type="text"
                      readOnly={quarterReadOnly}
                      disabled={quarterReadOnly}
                      value={goal.actualAchievement}
                      onChange={(e) =>
                        onGoalChange(goal.id, 'actualAchievement', e.target.value)
                      }
                      className="w-28 text-center px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 font-semibold disabled:bg-slate-100"
                    />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="font-bold text-blue-600">
                      {calculateProgressScore(
                        goal.uomType,
                        goal.targetValue,
                        goal.actualAchievement
                      )}
                      %
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      disabled={quarterReadOnly}
                      value={goal.completionStatus}
                      onChange={(e) =>
                        onGoalChange(goal.id, 'completionStatus', e.target.value)
                      }
                      className="px-2 py-1 border rounded text-xs bg-slate-50 font-medium disabled:bg-slate-100"
                    >
                      <option value="NOT_STARTED">Not Started</option>
                      <option value="ON_TRACK">On Track</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!quarterReadOnly && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submittingQuarter}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>
              {submittingQuarter
                ? 'Submitting...'
                : `Submit ${selectedQuarter} performance log`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function quarterBadgeClass(state: QuarterUiState) {
  switch (state) {
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'PENDING':
      return 'bg-amber-100 text-amber-800';
    case 'REWORK':
      return 'bg-red-100 text-red-800';
    case 'SUBMITTED':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
