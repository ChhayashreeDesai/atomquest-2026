import { useCallback, useEffect, useState } from 'react';
import { Loader, Users, CheckCircle, RotateCcw, Save } from 'lucide-react';
import api from '../utils/api';
import { calculateProgressScore, UoMType } from '../utils/progressCalculator';

type Tab = 'goals' | 'checkins';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  goalSheetStatus: string;
  goalSheetId: string | null;
  quarterLabel: string | null;
  quarterStatus: string;
}

interface ReviewGoal {
  id: string;
  title: string;
  description: string;
  thrustArea: string;
  thrustAreaLabel?: string;
  uomType: UoMType;
  targetValue: string;
  weightage: number;
}

interface QuarterReviewGoal {
  id: string;
  title: string;
  description: string;
  uomType: UoMType;
  targetValue: string;
  actualAchievement: string;
  progressScore: number;
  completionStatus: string;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'SUBMITTED':
    case 'PENDING':
      return 'bg-blue-100 text-blue-800';
    case 'LOCKED':
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'DRAFT':
    case 'REWORK_REQUESTED':
      return 'bg-amber-100 text-amber-800';
    case 'NOT_SUBMITTED':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('goals');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'GOAL_CREATION' | 'QUARTERLY_TRACKING'>('GOAL_CREATION');
  const [activeQuarter, setActiveQuarter] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberSheet, setMemberSheet] = useState<{
    id: string;
    status: string;
    goals: ReviewGoal[];
    managerFeedback?: string;
  } | null>(null);
  const [editableGoals, setEditableGoals] = useState<ReviewGoal[]>([]);
  const [goalFeedback, setGoalFeedback] = useState('');
  const [quarterReview, setQuarterReview] = useState<{
    goals: QuarterReviewGoal[];
    checkIn: { id: string; commentText: string; approvalStatus: string } | null;
    canEvaluate: boolean;
  } | null>(null);
  const [checkInComments, setCheckInComments] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [saveGoalsLoading, setSaveGoalsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTeamMembers();
      setPhase(res.data.phase || 'GOAL_CREATION');
      setActiveQuarter(res.data.activeQuarter || null);
      setTeam(res.data.members || []);
    } catch (err) {
      console.error('Failed to load team roster:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (phase === 'GOAL_CREATION') {
      setActiveTab('goals');
      return;
    }
    const pendingAnnualReviews = team.some((m) => m.goalSheetStatus === 'SUBMITTED');
    if (!pendingAnnualReviews) {
      setActiveTab('checkins');
    }
  }, [phase, team]);

  const selectMemberForGoals = async (member: TeamMember) => {
    if (!member.goalSheetId) return;
    setSelectedMember(member);
    setMemberSheet(null);
    setQuarterReview(null);
    setGoalFeedback('');
    try {
      const response = await api.getGoalSheetForReview(member.goalSheetId);
      setMemberSheet(response.data);
      setEditableGoals(
        (response.data.goals || []).map((g: ReviewGoal) => ({ ...g }))
      );
    } catch (err) {
      console.error('Failed to load goal sheet:', err);
    }
  };

  const selectMemberForCheckIn = async (member: TeamMember) => {
    setSelectedMember(member);
    setMemberSheet(null);
    setQuarterReview(null);
    setCheckInComments('');
    try {
      const res = await api.getTeamMemberQuarterReview(member.id, activeQuarter || undefined);
      setQuarterReview({
        goals: res.data.goals || [],
        checkIn: res.data.checkIn,
        canEvaluate: res.data.canEvaluate,
      });
    } catch (err) {
      console.error('Failed to load quarter review:', err);
    }
  };

  const saveGoalEdits = async () => {
    if (!memberSheet) return;
    setSaveGoalsLoading(true);
    try {
      for (const goal of editableGoals) {
        await api.updateGoalAsManager(goal.id, {
          targetValue: goal.targetValue,
          weightage: Number(goal.weightage),
        });
      }
      setFeedback({ type: 'success', text: 'Goal targets and weightages saved.' });
      const refreshed = await api.getGoalSheetForReview(memberSheet.id);
      setMemberSheet(refreshed.data);
      setEditableGoals((refreshed.data.goals || []).map((g: ReviewGoal) => ({ ...g })));
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to save goal edits.' });
    } finally {
      setSaveGoalsLoading(false);
    }
  };

  const executeGoalAction = async (approve: boolean) => {
    if (!selectedMember || !memberSheet) return;
    if (!approve && !goalFeedback.trim()) {
      setFeedback({ type: 'error', text: 'Feedback is required when returning for rework.' });
      return;
    }
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      if (approve) {
        await api.approveGoalSheet(memberSheet.id);
        setFeedback({ type: 'success', text: 'Goal sheet approved and locked.' });
      } else {
        await api.returnGoalSheetForRework(memberSheet.id, goalFeedback);
        setFeedback({ type: 'success', text: 'Goal sheet returned for rework.' });
      }
      setSelectedMember(null);
      setMemberSheet(null);
      await loadRoster();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Action failed.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const executeQuarterlyGate = async (approve: boolean) => {
    if (!quarterReview?.checkIn) return;
    if (!checkInComments.trim()) {
      setFeedback({ type: 'error', text: 'Manager check-in comments are required.' });
      return;
    }
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      if (approve) {
        await api.approveCheckInComment(quarterReview.checkIn.id, checkInComments);
        setFeedback({ type: 'success', text: `${activeQuarter} data approved.` });
      } else {
        await api.requestCheckInRework(quarterReview.checkIn.id, checkInComments);
        setFeedback({ type: 'success', text: `${activeQuarter} sent back for rework.` });
      }
      setSelectedMember(null);
      setQuarterReview(null);
      await loadRoster();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Check-in action failed.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const updateEditableGoal = (index: number, field: 'targetValue' | 'weightage', value: string) => {
    setEditableGoals((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === 'weightage' ? Number(value) : value,
      };
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const pendingCheckInCount = team.filter((m) => m.quarterStatus === 'PENDING').length;
  const pendingGoalCount = team.filter((m) => m.goalSheetStatus === 'SUBMITTED').length;

  return (
    <div className="py-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Manager L1 Review Center</h1>
        <p className="text-slate-600 text-sm mt-1">
          {phase === 'GOAL_CREATION'
            ? 'Phase 1: Annual goal setting review (May window)'
            : `Phase 2: ${activeQuarter || 'Quarterly'} check-in evaluations`}
        </p>
      </div>

      {feedback.text && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border rounded-xl p-4 shadow-sm space-y-4 h-fit">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Management Center
          </h2>
          <button type="button" onClick={() => { setActiveTab('goals'); setSelectedMember(null); setMemberSheet(null); setQuarterReview(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between ${activeTab === 'goals' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}><span>Tab 1: Goal Approvals</span>{pendingGoalCount > 0 && <span className="bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingGoalCount}</span>}</button>
          <button type="button" onClick={() => { setActiveTab('checkins'); setSelectedMember(null); setMemberSheet(null); setQuarterReview(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between ${activeTab === 'checkins' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}><span>Tab 2: Check-in Approvals</span>{pendingCheckInCount > 0 && <span className="bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingCheckInCount}</span>}</button>
        </div>
        <div className="md:col-span-3">{activeTab === 'goals' ? <GoalsTab team={team} selectedMember={selectedMember} memberSheet={memberSheet} editableGoals={editableGoals} goalFeedback={goalFeedback} setGoalFeedback={setGoalFeedback} updateEditableGoal={updateEditableGoal} saveGoalEdits={saveGoalEdits} saveGoalsLoading={saveGoalsLoading} executeGoalAction={executeGoalAction} actionLoading={actionLoading} onSelect={selectMemberForGoals} /> : <CheckInsTab team={team} selectedMember={selectedMember} activeQuarter={activeQuarter} quarterReview={quarterReview} checkInComments={checkInComments} setCheckInComments={setCheckInComments} executeQuarterlyGate={executeQuarterlyGate} actionLoading={actionLoading} onSelect={selectMemberForCheckIn} />}</div>
      </div>
    </div>
  );
}

function GoalsTab({ team, selectedMember, memberSheet, editableGoals, goalFeedback, setGoalFeedback, updateEditableGoal, saveGoalEdits, saveGoalsLoading, executeGoalAction, actionLoading, onSelect }: { team: TeamMember[]; selectedMember: TeamMember | null; memberSheet: { id: string; status: string } | null; editableGoals: ReviewGoal[]; goalFeedback: string; setGoalFeedback: (v: string) => void; updateEditableGoal: (i: number, f: 'targetValue' | 'weightage', v: string) => void; saveGoalEdits: () => void; saveGoalsLoading: boolean; executeGoalAction: (a: boolean) => void; actionLoading: boolean; onSelect: (m: TeamMember) => void }) {
  const canAct = memberSheet?.status === 'SUBMITTED';
  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Roster team={team} selectedId={selectedMember?.id} onSelect={onSelect} badge={(m) => m.goalSheetStatus} />
      <div className="md:col-span-2 bg-white border rounded-xl p-6 shadow-sm min-h-[420px] flex flex-col gap-4">
        {!selectedMember ? <p className="text-slate-400 text-sm m-auto">Select a direct report.</p> : !memberSheet ? <Loader className="m-auto animate-spin text-blue-600" /> : (
          <>
            <div><h3 className="text-lg font-bold">Reviewing: {selectedMember.name}</h3><span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${statusBadgeClass(memberSheet.status)}`}>{memberSheet.status}</span></div>
            {!canAct && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Only SUBMITTED sheets can be approved or returned.</p>}
            <div className="space-y-3 flex-1 overflow-y-auto">{editableGoals.map((goal, idx) => (
              <div key={goal.id} className="p-4 border rounded-lg bg-slate-50 space-y-2">
                <p className="font-semibold text-sm">Goal {idx + 1}: {goal.title}</p>
                <p className="text-xs text-slate-500">{goal.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium">Target</label><input className="w-full border rounded px-2 py-1 text-sm" value={goal.targetValue} onChange={(e) => updateEditableGoal(idx, 'targetValue', e.target.value)} disabled={!canAct} /></div>
                  <div><label className="text-xs font-medium">Weight %</label><input type="number" className="w-full border rounded px-2 py-1 text-sm" value={goal.weightage} onChange={(e) => updateEditableGoal(idx, 'weightage', e.target.value)} disabled={!canAct} /></div>
                </div>
              </div>
            ))}</div>
            {canAct && <button type="button" onClick={saveGoalEdits} disabled={saveGoalsLoading} className="flex items-center justify-center gap-2 py-2 border rounded-lg text-sm font-medium"><Save className="w-4 h-4" />{saveGoalsLoading ? 'Saving...' : 'Save inline edits'}</button>}
            <div><label className="text-xs font-bold uppercase text-slate-500">Manager feedback (required for rework)</label><textarea value={goalFeedback} onChange={(e) => setGoalFeedback(e.target.value)} rows={3} className="w-full border rounded-lg p-3 text-sm mt-1" placeholder="Comments for employee when returning for rework..." /></div>
            <div className="flex gap-3"><button type="button" onClick={() => executeGoalAction(false)} disabled={actionLoading || !canAct} className="flex-1 py-2.5 border rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><RotateCcw className="w-4 h-4" />Return for Rework</button><button type="button" onClick={() => executeGoalAction(true)} disabled={actionLoading || !canAct} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><CheckCircle className="w-4 h-4" />Approve & Lock</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckInsTab({ team, selectedMember, activeQuarter, quarterReview, checkInComments, setCheckInComments, executeQuarterlyGate, actionLoading, onSelect }: { team: TeamMember[]; selectedMember: TeamMember | null; activeQuarter: string | null; quarterReview: { goals: QuarterReviewGoal[]; checkIn: { id: string; commentText: string } | null; canEvaluate: boolean } | null; checkInComments: string; setCheckInComments: (v: string) => void; executeQuarterlyGate: (a: boolean) => void; actionLoading: boolean; onSelect: (m: TeamMember) => void }) {
  const canAct = quarterReview?.canEvaluate && !!quarterReview?.checkIn;
  const ok = checkInComments.trim().length > 0;
  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Roster team={team} selectedId={selectedMember?.id} onSelect={onSelect} badge={(m) => m.quarterLabel || m.quarterStatus} />
      <div className="md:col-span-2 bg-white border rounded-xl p-6 space-y-4 min-h-[420px]">
        {!selectedMember ? (
          <p className="text-slate-400 text-sm">Select an employee with a submitted quarterly log.</p>
        ) : !quarterReview ? (
          <Loader className="w-6 h-6 animate-spin text-blue-600" />
        ) : (
          <>
            <h3 className="font-bold text-lg">
              {activeQuarter} — {selectedMember.name}
            </h3>
            {!quarterReview.checkIn && (
              <p className="text-sm text-slate-500">No submission for this quarter yet.</p>
            )}
            {quarterReview.checkIn && (
              <p className="text-xs border p-2 rounded bg-slate-50">
                Employee note: {quarterReview.checkIn.commentText}
              </p>
            )}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Goal</th>
                    <th className="p-2 text-center">Planned target</th>
                    <th className="p-2 text-center">Actual achievement</th>
                    <th className="p-2 text-center">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quarterReview.goals.map((g) => (
                    <tr key={g.id}>
                      <td className="p-2">
                        <p className="font-medium">{g.title}</p>
                        <p className="text-xs text-slate-500">{g.description}</p>
                      </td>
                      <td className="p-2 text-center font-semibold bg-slate-50">{g.targetValue}</td>
                      <td className="p-2 text-center text-blue-700">{g.actualAchievement || '—'}</td>
                      <td className="p-2 text-center font-bold text-blue-600">
                        {calculateProgressScore(g.uomType, g.targetValue, g.actualAchievement)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Manager Check-In Comments *
              </label>
              <textarea
                value={checkInComments}
                onChange={(e) => setCheckInComments(e.target.value)}
                rows={3}
                className="w-full border rounded-lg p-3 text-sm"
                placeholder="Required before approving or sending back for rework..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={!canAct || !ok || actionLoading}
                onClick={() => executeQuarterlyGate(false)}
                className="flex-1 py-2.5 border rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Send Quarter Back for Rework
              </button>
              <button
                type="button"
                disabled={!canAct || !ok || actionLoading}
                onClick={() => executeQuarterlyGate(true)}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Approve Quarter Data
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Roster({ team, selectedId, onSelect, badge }: { team: TeamMember[]; selectedId?: string; onSelect: (m: TeamMember) => void; badge: (m: TeamMember) => string }) {
  return (
    <div className="bg-white border rounded-xl p-4 space-y-2 h-fit max-h-[32rem] overflow-y-auto">
      <h3 className="font-bold text-sm border-b pb-2">Direct Reports</h3>
      {team.length === 0 ? <p className="text-sm text-slate-500">No direct reports.</p> : team.map((m) => (
        <button key={m.id} type="button" onClick={() => onSelect(m)} className={`w-full text-left p-3 border rounded-lg ${selectedId === m.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}>
          <p className="font-semibold text-sm">{m.name}</p>
          <p className="text-xs text-slate-400 truncate">{m.email}</p>
          <span className={`mt-1 inline-block text-xs font-bold uppercase px-2 py-0.5 rounded ${statusBadgeClass(badge(m))}`}>{badge(m)}</span>
        </button>
      ))}
    </div>
  );
}
