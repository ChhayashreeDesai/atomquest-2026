import axios from 'axios';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_URL as string) || 'http://localhost:5001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const role = sessionStorage.getItem('devRole');
  let dateValue =
    sessionStorage.getItem('simulatedDate') ||
    sessionStorage.getItem('systemDate') ||
    '2026-05-01';

  const datePresetMap: Record<string, string> = {
    may1: '2026-05-01',
    july15: '2026-07-15',
    oct15: '2026-10-15',
    jan15: '2027-01-15',
    apr15: '2026-04-15',
  };

  if (datePresetMap[dateValue as keyof typeof datePresetMap]) {
    dateValue = datePresetMap[dateValue as keyof typeof datePresetMap];
  }

  if (role) {
    config.headers['X-Dev-Role'] = role;
  }
  config.headers['X-System-Date'] = dateValue;

  const savedUser = sessionStorage.getItem('user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser) as { id?: string };
      if (parsed.id) {
        config.headers['X-User-Id'] = parsed.id;
      }
    } catch {
      /* ignore malformed user payload */
    }
  }

  return config;
});

export const api = {
  login: async (email: string) => {
    return apiClient.post('/auth/login', { email });
  },

  getSystemConfig: async () => {
    return apiClient.get('/system/config');
  },

  getGoalSheet: async (goalSheetId?: string, params?: { fiscalYear?: string }) => {
    const query = params?.fiscalYear ? `?fiscalYear=${encodeURIComponent(params.fiscalYear)}` : '';
    return apiClient.get(`/goal-sheets/${goalSheetId || ''}${query}`);
  },

  getGoalSheetHistory: async () => {
    return apiClient.get('/goal-sheets/history/list');
  },

  replaceGoals: async (goalSheetId: string, goals: unknown[]) => {
    return apiClient.put(`/goal-sheets/${goalSheetId}/goals/replace`, { goals });
  },

  submitGoalSheet: async (goalSheetId: string) => {
    return apiClient.post(`/goal-sheets/${goalSheetId}/submit`);
  },

  addGoal: async (goalSheetId: string, goalData: unknown) => {
    return apiClient.post(`/goal-sheets/${goalSheetId}/goals`, goalData);
  },

  updateGoal: async (goalId: string, updates: unknown) => {
    return apiClient.put(`/goal-sheets/goals/${goalId}`, updates);
  },

  deleteGoal: async (goalId: string) => {
    return apiClient.delete(`/goal-sheets/goals/${goalId}`);
  },

  getTeamMembers: async () => {
    return apiClient.get('/team/members');
  },

  getTeamMemberQuarterReview: async (employeeId: string, quarter?: string) => {
    const q = quarter ? `?quarter=${quarter}` : '';
    return apiClient.get(`/team/members/${employeeId}/quarter-review${q}`);
  },

  getGoalSheetForReview: async (goalSheetId: string) => {
    return apiClient.get(`/team/${goalSheetId}/review`);
  },

  approveGoalSheet: async (goalSheetId: string, data?: unknown) => {
    return apiClient.post(`/goal-sheets/${goalSheetId}/approve`, data || {});
  },

  archiveGoalSheet: async (goalSheetId: string) => {
    return apiClient.post(`/goal-sheets/${goalSheetId}/archive`, {});
  },

  returnGoalSheetForRework: async (goalSheetId: string, comments: string) => {
    return apiClient.post(`/goal-sheets/${goalSheetId}/return-for-rework`, {
      comments,
    });
  },

  updateGoalAsManager: async (goalId: string, updates: unknown) => {
    return api.updateGoal(goalId, updates);
  },

  addCheckInComment: async (goalSheetId: string, data: unknown) => {
    return apiClient.post(`/check-ins/${goalSheetId}/comments`, data);
  },

  getCheckInComments: async (goalSheetId: string, quarter?: string) => {
    const q = quarter ? `?quarter=${quarter}` : '';
    return apiClient.get(`/check-ins/${goalSheetId}/comments${q}`);
  },

  getQuarterTracking: async (goalSheetId: string, quarter: string) => {
    return apiClient.get(`/check-ins/${goalSheetId}/quarters/${quarter}`);
  },

  submitQuarterLog: async (
    goalSheetId: string,
    quarter: string,
    data: { entries: unknown[]; commentText?: string }
  ) => {
    return apiClient.post(`/check-ins/${goalSheetId}/quarters/${quarter}/submit`, data);
  },

  updateGoalAchievement: async (
    goalId: string,
    data: { actualAchievement: string | number; completionStatus: string; quarter: string }
  ) => {
    return apiClient.put(`/check-ins/${goalId}/achievement`, data);
  },

  getQuarterlyAchievementSummary: async (goalSheetId: string, quarter: string) => {
    return apiClient.get(
      `/check-ins/${goalSheetId}/quarterly-summary?quarter=${quarter}`
    );
  },

  getTeamCheckInStatus: async () => {
    return apiClient.get('/check-ins/team/check-in-status');
  },

  getCheckInData: async (goalSheetId: string, quarter: string) => {
    return api.getQuarterTracking(goalSheetId, quarter);
  },

  updateCheckIn: async (goalSheetId: string, quarter: string, data: { goals: unknown[] }) => {
    const entries = (data.goals || []).map((g: any) => ({
      goalId: g.id,
      actualAchievement: g.actualAchievement,
      completionStatus: g.status || g.completionStatus,
    }));
    return api.submitQuarterLog(goalSheetId, quarter, { entries });
  },

  exportAchievementReport: async () => {
    return apiClient.get('/reporting/export/achievement', { responseType: 'blob' });
  },

  getCompletionDashboard: async (params?: { quarter?: string; fiscalYear?: string }) => {
    const search = new URLSearchParams();
    if (params?.quarter) search.set('quarter', params.quarter);
    if (params?.fiscalYear) search.set('fiscalYear', params.fiscalYear);
    const q = search.toString();
    return apiClient.get(`/reporting/dashboard/completion${q ? `?${q}` : ''}`);
  },

  getAdminComplianceMatrix: async (quarter: string) => {
    return apiClient.get(
      `/reporting/admin/compliance?quarter=${encodeURIComponent(quarter)}`
    );
  },

  getCompletionTracking: async () => {
    return apiClient.get('/reporting/dashboard/completion');
  },

  getAnalytics: async () => {
    return apiClient.get('/reporting/analytics');
  },

  getEmployeeProgress: async (fiscalYear?: string) => {
    const q = fiscalYear ? `?fiscalYear=${encodeURIComponent(fiscalYear)}` : '';
    return apiClient.get(`/reporting/analytics/employee${q}`);
  },

  getQoQTrends: async () => api.getAnalytics(),
  getGoalDistribution: async () => api.getAnalytics(),
  getCompletionHeatmap: async () => api.getAnalytics(),
  getManagerEffectiveness: async () => api.getAnalytics(),

  getAuditTrail: async (goalId?: string) => {
    const url = goalId ? `/reporting/audit/goal/${goalId}` : '/reporting/analytics';
    return apiClient.get(url);
  },

  evaluateEscalationRules: async (rules?: unknown) =>
    apiClient.post('/escalations/evaluate', rules ? { rules } : {}),
  getEscalations: async () => apiClient.get('/escalations'),
  getEscalationPanel: async () => apiClient.get('/escalations/hr/panel'),
  resolveEscalation: async (escalationId: string) =>
    apiClient.post(`/escalations/${escalationId}/resolve`),

  createAndShareGoal: async (goalSheetId: string, data: unknown) =>
    apiClient.post(`/shared-goals/${goalSheetId}/create-and-share`, data),
  getSharedGoals: async () => apiClient.get('/shared-goals'),
  getSharedGoalChildren: async (parentGoalId: string) =>
    apiClient.get(`/shared-goals/${parentGoalId}/children`),

  getAllEmployees: async () => apiClient.get('/admin/users/employees'),
  createEmployee: async (data: unknown) => apiClient.post('/admin/users/employees', data),
  updateEmployee: async (userId: string, data: unknown) =>
    apiClient.put(`/admin/users/employees/${userId}`, data),
  deleteEmployee: async (userId: string) =>
    apiClient.delete(`/admin/users/employees/${userId}`),
  getAllManagers: async () => apiClient.get('/admin/users/managers'),

  clearAllCurrentGoals: async () =>
    apiClient.post('/reporting/admin/clear-all-goals', {}),

  getTeamCheckInStatusForApproval: async () =>
    apiClient.get('/check-ins/team/check-in-status'),
  approveCheckInComment: async (checkInCommentId: string, managerComments: string) =>
    apiClient.post(`/check-ins/${checkInCommentId}/approve`, { managerComments }),
  requestCheckInRework: async (checkInCommentId: string, managerComments: string) =>
    apiClient.post(`/check-ins/${checkInCommentId}/rework`, {
      reworkComments: managerComments,
      managerComments,
    }),
};

export default api;
