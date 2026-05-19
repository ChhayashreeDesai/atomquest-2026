import { useCallback, useEffect, useState } from 'react';
import { Loader, Trash2, Pencil, X, Check, Archive, BellRing, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../utils/api';

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type EscalationLevel = 'EMPLOYEE' | 'MANAGER' | 'HR';

interface ComplianceRow {
  id: string;
  goalSheetId: string | null;
  employeeName: string;
  employeeEmail: string;
  managerName: string;
  annualStatus: string;
  quarterPerformance: string | number;
}

interface PersonnelRecord {
  id: string;
  name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  managerId?: string | null;
  manager?: { id: string; name: string } | null;
}

interface ManagerOption {
  id: string;
  name: string;
}

interface EscalationItem {
  escalationId: string;
  userName: string;
  userEmail?: string;
  managerName?: string | null;
  ruleTriggered: string;
  level: EscalationLevel;
  status: 'OPEN' | 'RESOLVED';
  timestamp: string;
}

interface EscalationPanel {
  totalOpen: number;
  totalResolved: number;
  byRule: Record<string, { rule: string; openCount: number; resolvedCount: number; items: EscalationItem[] }>;
  byLevel: Record<string, { level: EscalationLevel; count: number; items: EscalationItem[] }>;
  recent: EscalationItem[];
}

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function statusClass(status: string) {
  switch (status) {
    case 'SUBMITTED':
      return 'bg-blue-100 text-blue-800';
    case 'LOCKED':
      return 'bg-green-100 text-green-800';
    case 'DRAFT':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'crud' | 'goals' | 'escalations'>('matrix');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'GOAL_CREATION' | 'QUARTERLY_TRACKING'>('QUARTERLY_TRACKING');
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>('Q1');
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, submitted: 0, approved: 0, rate: 0 });
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'MANAGER' | 'ADMIN'>('EMPLOYEE');
  const [managerId, setManagerId] = useState('');
  const [submittingUser, setSubmittingUser] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    email: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'MANAGER' | 'ADMIN',
    managerId: '',
  });
  const [feedback, setFeedback] = useState('');
  const [escalationPanel, setEscalationPanel] = useState<EscalationPanel | null>(null);
  const [escalationLoading, setEscalationLoading] = useState(false);
  const [escalationFeedback, setEscalationFeedback] = useState('');

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminComplianceMatrix(selectedQuarter);
      setRows(res.data.rows || []);
      const s = res.data.summary || {};
      setSummary({
        total: s.totalEmployees ?? 0,
        submitted: s.goalsSubmitted ?? 0,
        approved: s.goalsApproved ?? 0,
        rate: s.completionRate ?? 0,
      });
    } catch (err) {
      console.error('Failed to load compliance matrix:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedQuarter]);

  const fetchPersonnel = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, mgrRes] = await Promise.all([
        api.getAllEmployees(),
        api.getAllManagers(),
      ]);
      setPersonnel(empRes.data || []);
      setManagers(
        (mgrRes.data || []).map((m: { id: string; name: string }) => ({
          id: m.id,
          name: m.name,
        }))
      );
    } catch (err) {
      console.error('Failed to load personnel registry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEscalations = useCallback(async () => {
    setEscalationLoading(true);
    try {
      const res = await api.getEscalationPanel();
      setEscalationPanel(res.data || null);
    } catch (err) {
      console.error('Failed to load escalation panel:', err);
    } finally {
      setEscalationLoading(false);
    }
  }, []);

  const handleEvaluateEscalations = async () => {
    setEscalationFeedback('');
    try {
      const res = await api.evaluateEscalationRules();
      setEscalationFeedback(
        `Escalation evaluation complete. Created ${res.data.escalationsCreated || 0} new logs.`
      );
      await fetchEscalations();
    } catch (err: unknown) {
      const msg=
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Escalation evaluation failed.';
      setEscalationFeedback(msg);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const configRes = await api.getSystemConfig();
        setPhase(configRes.data.phase?.phase || 'QUARTERLY_TRACKING');
      } catch (err) {
        console.error('Failed to load system config:', err);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (activeTab === 'matrix') fetchMatrix();
    else if (activeTab === 'escalations') fetchEscalations();
    else fetchPersonnel();
  }, [activeTab, fetchMatrix, fetchPersonnel, fetchEscalations]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmittingUser(true);
    setFeedback('');
    try {
      await api.createEmployee({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        managerId: role === 'EMPLOYEE' ? managerId || undefined : undefined,
      });
      setName('');
      setEmail('');
      setRole('EMPLOYEE');
      setManagerId('');
      setFeedback('Profile created successfully.');
      await fetchPersonnel();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create profile.';
      setFeedback(msg);
    } finally {
      setSubmittingUser(false);
    }
  };

  const startEdit = (record: PersonnelRecord) => {
    setEditingId(record.id);
    setEditDraft({
      name: record.name,
      email: record.email,
      role: record.role,
      managerId: record.managerId || '',
    });
  };

  const saveEdit = async (userId: string) => {
    try {
      await api.updateEmployee(userId, {
        name: editDraft.name.trim(),
        email: editDraft.email.trim().toLowerCase(),
        role: editDraft.role,
        managerId: editDraft.role === 'EMPLOYEE' ? editDraft.managerId || null : null,
      });
      setEditingId(null);
      setFeedback('Profile updated.');
      await fetchPersonnel();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Update failed.';
      setFeedback(msg);
    }
  };

  const handleDeleteEmployee = async (id: string, displayName: string) => {
    if (
      !window.confirm(
        `Delete ${displayName} and cascade-remove all goal sheets and tracking data?`
      )
    ) {
      return;
    }
    try {
      await api.deleteEmployee(id);
      setFeedback('Profile removed.');
      await fetchPersonnel();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Delete failed.';
      setFeedback(msg);
    }
  };

  const handleArchiveGoals = async (goalSheetId: string | null, employeeName: string) => {
    if (!goalSheetId) {
      setFeedback('No active goal sheet to archive.');
      return;
    }
    if (
      !window.confirm(
        `Archive all goals for ${employeeName}? They will move to Past Years and new goals can be created.`
      )
    ) {
      return;
    }
    try {
      await api.archiveGoalSheet(goalSheetId);
      setFeedback(`Goals for ${employeeName} archived successfully.`);
      await fetchMatrix();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Archive failed.';
      setFeedback(msg);
    }
  };

  const handleClearAllGoals = async () => {
    if (
      !window.confirm(
        'Clear ALL current goals for all employees and reset to DRAFT? This cannot be undone. This removes all goals from active goal sheets.'
      )
    ) {
      return;
    }
    try {
      setFeedback('');
      const result = await api.clearAllCurrentGoals();
      setFeedback(
        `Cleared ${result.data.totalGoalsDeleted} goals from ${result.data.goalSheetsReset} employees. All goal sheets reset to DRAFT.`
      );
      await fetchMatrix();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Clear failed.';
      setFeedback(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">HR System Governance</h1>
          <p className="text-slate-600">Organization compliance matrix and personnel registry</p>
        </div>
        <div className="flex space-x-2 bg-white border p-1 rounded-lg shadow-sm flex-wrap">
          {phase === 'GOAL_CREATION' && (
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className={`px-4 py-2 rounded font-medium text-xs ${
                activeTab === 'goals' ? 'bg-purple-600 text-white' : 'text-slate-600'
              }`}
            >
              Goal Creation
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded font-medium text-xs ${
              activeTab === 'matrix' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            Compliance Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('crud')}
            className={`px-4 py-2 rounded font-medium text-xs ${
              activeTab === 'crud' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            Personnel Registry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('escalations')}
            className={`px-4 py-2 rounded font-medium text-xs ${
              activeTab === 'escalations' ? 'bg-rose-600 text-white' : 'text-slate-600'
            }`}
          >
            Escalations
          </button>
          {activeTab === 'matrix' && (
            <button
              type="button"
              onClick={handleClearAllGoals}
              className="px-4 py-2 rounded font-medium text-xs bg-red-100 text-red-700 hover:bg-red-200 transition-colors ml-auto"
              title="Clear all current goals for all employees"
            >
              Clear All Goals
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 text-sm">
          {feedback}
        </div>
      )}

      {activeTab === 'matrix' ? (
        <MatrixTab
          selectedQuarter={selectedQuarter}
          setSelectedQuarter={setSelectedQuarter}
          rows={rows}
          summary={summary}
          onArchive={handleArchiveGoals}
        />
      ) : activeTab === 'escalations' ? (
        <EscalationsTab
          loading={escalationLoading}
          panel={escalationPanel}
          feedback={escalationFeedback}
          onRefresh={fetchEscalations}
          onEvaluate={handleEvaluateEscalations}
          onResolve={async (id) => {
            await api.resolveEscalation(id);
            await fetchEscalations();
          }}
        />
      ) : activeTab === 'goals' ? (
        <GoalCreationAdminTab personnel={personnel} />
      ) : (
        <CrudTab
          personnel={personnel}
          managers={managers}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          role={role}
          setRole={setRole}
          managerId={managerId}
          setManagerId={setManagerId}
          submittingUser={submittingUser}
          editingId={editingId}
          editDraft={editDraft}
          setEditDraft={setEditDraft}
          onCreate={handleCreateEmployee}
          onStartEdit={startEdit}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onDelete={handleDeleteEmployee}
        />
      )}
    </div>
  );
}

function MatrixTab({
  selectedQuarter,
  setSelectedQuarter,
  rows,
  summary,
  onArchive,
}: {
  selectedQuarter: Quarter;
  setSelectedQuarter: (q: Quarter) => void;
  rows: ComplianceRow[];
  summary: { total: number; submitted: number; approved: number; rate: number };
  onArchive: (goalSheetId: string | null, employeeName: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Quarter selector moved to parent level - shown once for entire admin view */}
      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-xl p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">
          View Performance Quarter:
        </label>
        <select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value as Quarter)}
          className="border rounded-lg px-3 py-2 text-sm font-medium"
        >
          {QUARTERS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Only manager-approved ({selectedQuarter}) scores are aggregated; others show Pending
          Evaluation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Roster Headcount" value={summary.total} />
        <StatCard label="Annual Submitted" value={summary.submitted} color="text-blue-600" />
        <StatCard label="Annual Locked" value={summary.approved} color="text-green-600" />
        <StatCard label={`${selectedQuarter} Evaluated`} value={`${summary.rate}%`} color="text-purple-600" />
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b text-slate-700 text-xs font-bold uppercase">
            <tr>
              <th className="px-6 py-3">Employee</th>
              <th className="px-6 py-3">Manager</th>
              <th className="px-6 py-3 text-center">Annual Status</th>
              <th className="px-6 py-3 text-center">{selectedQuarter} Performance</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  No personnel in current fiscal cycle.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{row.employeeName}</p>
                    <p className="text-xs text-slate-400">{row.employeeEmail}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{row.managerName}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${statusClass(row.annualStatus)}`}
                    >
                      {row.annualStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-semibold">
                    {typeof row.quarterPerformance === 'string' &&
                    row.quarterPerformance.endsWith('%') ? (
                      <span className="text-green-700">{row.quarterPerformance}</span>
                    ) : (
                      <span className="text-amber-700">{row.quarterPerformance}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.annualStatus === 'LOCKED' && row.goalSheetId && (
                      <button
                        onClick={() => onArchive(row.goalSheetId, row.employeeName)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors"
                        title="Archive goals and move to past years"
                      >
                        <Archive className="w-4 h-4" />
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EscalationsTab({
  loading,
  panel,
  feedback,
  onRefresh,
  onEvaluate,
  onResolve,
}: {
  loading: boolean;
  panel: EscalationPanel | null;
  feedback: string;
  onRefresh: () => Promise<void>;
  onEvaluate: () => Promise<void>;
  onResolve: (id: string) => Promise<void>;
}) {
  if (loading && !panel) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-rose-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <p className="font-bold text-rose-900">Rule-Based Escalations</p>
          <p className="text-sm text-rose-800">
            Monitor overdue goal submissions, manager approvals, and quarterly check-ins.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200 bg-white text-rose-700 font-semibold text-sm hover:bg-rose-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={onEvaluate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700"
          >
            <BellRing className="w-4 h-4" />
            Evaluate rules
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 text-sm">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Open Escalations" value={panel?.totalOpen ?? 0} color="text-rose-600" />
        <StatCard label="Resolved" value={panel?.totalResolved ?? 0} color="text-green-600" />
        <StatCard label="Tracked Rules" value={Object.keys(panel?.byRule || {}).length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Recent Escalation Log</h3>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="divide-y max-h-[30rem] overflow-y-auto">
            {(panel?.recent || []).length === 0 ? (
              <p className="p-6 text-sm text-slate-400 text-center">No escalations recorded.</p>
            ) : (
              panel!.recent.map((item) => (
                <div key={item.escalationId} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{item.userName}</p>
                    <p className="text-xs text-slate-500">{item.ruleTriggered}</p>
                    <p className="text-xs text-slate-500">{item.managerName || 'No manager assigned'}</p>
                    <p className="text-xs text-slate-400 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                      {item.level}
                    </span>
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                        item.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => onResolve(item.escalationId)}
                        className="text-xs font-semibold text-rose-700 hover:text-rose-900"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {Object.values(panel?.byRule || {}).length === 0 ? (
            <div className="bg-white border rounded-xl p-6 shadow-sm text-sm text-slate-500">
              No rule summary available yet.
            </div>
          ) : (
            Object.values(panel!.byRule).map((group) => (
              <div key={group.rule} className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{group.rule}</p>
                    <p className="text-xs text-slate-500">
                      Open {group.openCount} · Resolved {group.resolvedCount}
                    </p>
                  </div>
                  <BellRing className="w-4 h-4 text-rose-500" />
                </div>
                <div className="space-y-2 text-sm">
                  {group.items.slice(0, 4).map((item) => (
                    <div key={item.escalationId} className="flex items-center justify-between gap-3 border-t pt-2">
                      <div>
                        <p className="font-medium text-slate-800">{item.userName}</p>
                        <p className="text-xs text-slate-500">
                          {item.level} · {item.status}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CrudTab(props: {
  personnel: PersonnelRecord[];
  managers: ManagerOption[];
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  setRole: (v: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') => void;
  managerId: string;
  setManagerId: (v: string) => void;
  submittingUser: boolean;
  editingId: string | null;
  editDraft: {
    name: string;
    email: string;
    role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
    managerId: string;
  };
  setEditDraft: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email: string;
      role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
      managerId: string;
    }>
  >;
  onCreate: (e: React.FormEvent) => void;
  onStartEdit: (r: PersonnelRecord) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const {
    personnel,
    managers,
    name,
    setName,
    email,
    setEmail,
    role,
    setRole,
    managerId,
    setManagerId,
    submittingUser,
    editingId,
    editDraft,
    setEditDraft,
    onCreate,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={onCreate} className="bg-white border p-6 rounded-xl shadow-sm h-fit space-y-4">
        <h3 className="font-bold text-slate-900 text-sm border-b pb-2">Add Employee Profile</h3>
        <Field label="Full Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-sm p-2 border rounded-lg"
            required
          />
        </Field>
        <Field label="Corporate Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm p-2 border rounded-lg"
            required
          />
        </Field>
        <Field label="System Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'EMPLOYEE' | 'MANAGER' | 'ADMIN')}
            className="w-full text-sm p-2 border rounded-lg"
          >
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin HR</option>
          </select>
        </Field>
        {role === 'EMPLOYEE' && (
          <Field label="L1 Manager">
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full text-sm p-2 border rounded-lg"
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          type="submit"
          disabled={submittingUser}
          className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-50"
        >
          {submittingUser ? 'Registering...' : 'Add Profile'}
        </button>
      </form>

      <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b">
          <h3 className="font-bold text-slate-900 text-sm">Enterprise Roster</h3>
        </div>
        <div className="divide-y max-h-[32rem] overflow-y-auto">
          {personnel.length === 0 ? (
            <p className="p-6 text-sm text-slate-400 text-center">No profiles registered.</p>
          ) : (
            personnel.map((emp) => (
              <div
                key={emp.id}
                className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50"
              >
                {editingId === emp.id ? (
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      value={editDraft.email}
                      onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <select
                      value={editDraft.role}
                      onChange={(e) =>
                        setEditDraft((d) => ({
                          ...d,
                          role: e.target.value as 'EMPLOYEE' | 'MANAGER' | 'ADMIN',
                        }))
                      }
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="EMPLOYEE">Employee</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    {editDraft.role === 'EMPLOYEE' && (
                      <select
                        value={editDraft.managerId}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, managerId: e.target.value }))
                        }
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{emp.name}</h4>
                    <p className="text-xs text-slate-400">{emp.email}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {emp.role}
                      {emp.manager ? ` · reports to ${emp.manager.name}` : ''}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  {editingId === emp.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSaveEdit(emp.id)}
                        className="p-2 border rounded text-green-600 hover:bg-green-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        className="p-2 border rounded text-slate-500 hover:bg-slate-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onStartEdit(emp)}
                        className="p-2 border rounded text-slate-500 hover:bg-slate-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(emp.id, emp.name)}
                        className="p-2 border rounded text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'text-slate-900',
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white border p-5 rounded-xl shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function GoalCreationAdminTab({
  personnel,
}: {
  personnel: PersonnelRecord[];
}) {
  const [goalSheets, setGoalSheets] = useState<
    Array<{ userId: string; name: string; email: string; goalSheet: { id: string; status: string } | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGoalSheets = async () => {
      setLoading(true);
      try {
        const sheets: Array<{ userId: string; name: string; email: string; goalSheet: { id: string; status: string } | null }> = [];
        for (const person of personnel) {
          if (person.role === 'EMPLOYEE') {
            try {
              const res = await api.getGoalSheet();
              sheets.push({
                userId: person.id,
                name: person.name,
                email: person.email,
                goalSheet: res.data ? { id: res.data.id, status: res.data.status } : null,
              });
            } catch (err) {
              sheets.push({
                userId: person.id,
                name: person.name,
                email: person.email,
                goalSheet: null,
              });
            }
          }
        }
        setGoalSheets(sheets);
      } catch (err) {
        console.error('Failed to load goal sheets:', err);
      } finally {
        setLoading(false);
      }
    };
    loadGoalSheets();
  }, [personnel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <span className="font-bold">Goal Creation Phase:</span> Monitor and review employee goal creation. Click on an employee to view/edit their goals.
        </p>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b text-slate-700 text-xs font-bold uppercase">
            <tr>
              <th className="px-6 py-3">Employee</th>
              <th className="px-6 py-3">Goal Sheet Status</th>
              <th className="px-6 py-3 text-center">Goals Defined</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {goalSheets.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-12 text-slate-400">
                  No employees found.
                </td>
              </tr>
            ) : (
              goalSheets.map((sheet) => (
                <tr key={sheet.userId} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{sheet.name}</p>
                    <p className="text-xs text-slate-400">{sheet.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    {sheet.goalSheet ? (
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${statusClass(sheet.goalSheet.status)}`}
                      >
                        {sheet.goalSheet.status}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No sheet</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {sheet.goalSheet ? (
                      <a
                        href={`/employee/${sheet.userId}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        View Details
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
