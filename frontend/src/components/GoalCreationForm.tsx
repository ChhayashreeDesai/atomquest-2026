import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../utils/api';

interface Goal {
  title: string;
  description: string;
  thrustArea: string;
  uomType: 'MIN_NUMERIC' | 'MAX_NUMERIC' | 'TIMELINE' | 'ZERO';
  targetValue: string;
  weightage: number;
}

interface GoalCreationFormProps {
  goalSheetId: string;
  readOnly?: boolean;
  onSubmitSuccess?: () => void;
}

// Map frontend user-friendly display labels to strict PostgreSQL Prisma Schema Enums
const THRUST_AREA_MAP: Record<string, string> = {
  'Digital Transformation': 'DIGITAL_TRANSFORMATION',
  'Customer Experience': 'CUSTOMER_EXPERIENCE',
  'Operational Excellence': 'OPERATIONAL_EXCELLENCE',
  'Innovation & R&D': 'INNOVATION_RD',
  'Talent Development': 'TALENT_DEVELOPMENT',
  'Sustainability': 'SUSTAINABILITY',
};

export function GoalCreationForm({
  goalSheetId,
  readOnly = false,
  onSubmitSuccess,
}: GoalCreationFormProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Load existing goals from the goal sheet when component mounts
  useEffect(() => {
    const loadExistingGoals = async () => {
      try {
        const response = await api.getGoalSheet(goalSheetId);
        if (response.data?.goals && Array.isArray(response.data.goals)) {
          // Convert database goals to form goals format
          const existingGoals: Goal[] = response.data.goals.map((g: any) => {
            // Find the display label for the thrustArea enum
            const displayLabel = Object.entries(THRUST_AREA_MAP).find(
              ([_, value]) => value === g.thrustArea
            )?.[0] || g.thrustArea;
            
            return {
              title: g.title,
              description: g.description,
              thrustArea: displayLabel,
              uomType: g.uomType,
              targetValue: g.targetValue,
              weightage: g.weightage,
            };
          });
          setGoals(existingGoals);
        }
      } catch (error) {
        console.error('Failed to load existing goals:', error);
      }
    };
    
    loadExistingGoals();
  }, [goalSheetId]);

  const thrustAreas = [
    'Digital Transformation',
    'Customer Experience',
    'Operational Excellence',
    'Innovation & R&D',
    'Talent Development',
    'Sustainability',
  ];

  const uomTypes = [
    { value: 'MIN_NUMERIC', label: 'Minimum Numeric Value' },
    { value: 'MAX_NUMERIC', label: 'Maximum Numeric Value' },
    { value: 'TIMELINE', label: 'Timeline/Deadline' },
    { value: 'ZERO', label: 'Binary (Yes/No)' },
  ];

  const addGoal = () => {
    if (goals.length >= 8) return;
    const newGoal: Goal = {
      title: '',
      description: '',
      thrustArea: thrustAreas[0],
      uomType: 'MIN_NUMERIC',
      targetValue: '',
      weightage: 0,
    };
    setGoals([...goals, newGoal]);
  };

  const updateGoal = (index: number, field: keyof Goal, value: any) => {
    const updated = [...goals];
    updated[index] = { ...updated[index], [field]: value };
    setGoals(updated);
  };

  const removeGoal = (index: number) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const calculateTotalWeightage = () => {
    return goals.reduce((sum, goal) => sum + (goal.weightage || 0), 0);
  };

  const isWeightageValid = () => {
    const total = calculateTotalWeightage();
    return total === 100 && goals.every((g) => g.weightage >= 10);
  };

  const canSubmit = () => {
    return (
      goals.length > 0 &&
      goals.every(
        (g) =>
          g.title.trim() &&
          g.description.trim() &&
          g.targetValue.trim() &&
          g.weightage > 0
      ) &&
      isWeightageValid()
    );
  };

  const handleSubmit = async () => {
    if (readOnly) return;
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const databaseGoals = goals.map((goal) => ({
        title: goal.title.trim(),
        description: goal.description.trim(),
        thrustArea: THRUST_AREA_MAP[goal.thrustArea] || goal.thrustArea,
        uomType: goal.uomType,
        targetValue: goal.targetValue.trim(),
        weightage: Number(goal.weightage),
      }));

      await api.replaceGoals(goalSheetId, databaseGoals);
      await api.submitGoalSheet(goalSheetId);

      setSuccessMessage('Goals submitted successfully!');
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (error: unknown) {
      console.error('Failed to submit goals:', error);
      const err = error as { response?: { data?: { message?: string; error?: string; errors?: string[] } } };
      const serverErrorMsg =
        err.response?.data?.errors?.join(', ') ||
        err.response?.data?.message ||
        err.response?.data?.error;
      setErrorMessage(serverErrorMsg || 'Error submitting goals. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalWeightage = calculateTotalWeightage();
  const isValid = isWeightageValid();

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-green-700 font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-700 font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-4">
        {goals.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
            <p className="text-slate-600 font-medium">No goals yet. Click "Add Goal" to get started.</p>
          </div>
        ) : (
          goals.map((goal, index) => (
            <div key={index} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Goal {index + 1}</h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeGoal(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Title */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Goal Title *
                  </label>
                  <input
                    type="text"
                    value={goal.title}
                    onChange={(e) => updateGoal(index, 'title', e.target.value)}
                    readOnly={readOnly}
                    disabled={readOnly}
                    placeholder="Enter goal title"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={goal.description}
                    onChange={(e) => updateGoal(index, 'description', e.target.value)}
                    readOnly={readOnly}
                    disabled={readOnly}
                    placeholder="Describe the goal and expected outcomes"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>

                {/* Thrust Area */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Thrust Area *
                  </label>
                  <select
                    value={goal.thrustArea}
                    onChange={(e) => updateGoal(index, 'thrustArea', e.target.value)}
                    disabled={readOnly}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  >
                    {thrustAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                {/* UoM Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Unit of Measure *
                  </label>
                  <select
                    value={goal.uomType}
                    onChange={(e) =>
                      updateGoal(index, 'uomType', e.target.value as Goal['uomType'])
                    }
                    disabled={readOnly}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  >
                    {uomTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Value */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Target Value *
                  </label>
                  <input
                    type="text"
                    value={goal.targetValue}
                    onChange={(e) => updateGoal(index, 'targetValue', e.target.value)}
                    readOnly={readOnly}
                    disabled={readOnly}
                    placeholder="e.g., 100, 50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>

                {/* Weightage */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Weightage (%) *
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    step="5"
                    value={goal.weightage || ''}
                    onChange={(e) =>
                      updateGoal(index, 'weightage', parseInt(e.target.value, 10) || 0)
                    }
                    readOnly={readOnly}
                    disabled={readOnly}
                    placeholder="10-100"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Weightage Summary */}
      {goals.length > 0 && (
        <div
          className={`p-4 rounded-lg border-2 ${
            isValid
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            {isValid ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            )}
            <div className="flex-1">
              <p className="font-medium text-slate-900">Weightage Status</p>
              <p className="text-sm text-slate-600">
                Total: {totalWeightage}% {' '}
                {isValid && '- Ready to submit!'}
                {!isValid && totalWeightage !== 100 && `- Need ${100 - totalWeightage}% more`}
                {!isValid &&
                  totalWeightage === 100 &&
                  goals.some((g) => g.weightage < 10) &&
                  '- Each goal must be at least 10%'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!readOnly && (
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={addGoal}
            disabled={goals.length >= 8}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-50 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Goal</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Goals'}
          </button>
        </div>
      )}
    </div>
  );
}