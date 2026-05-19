import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, MessageCircle } from "lucide-react";
import api from "../utils/api";

interface CheckInComment {
  id: string;
  commentText: string;
  quarter: string;
  createdAt: string;
  approvalStatus: "PENDING" | "APPROVED" | "REWORK_REQUESTED";
  reworkComments?: string;
  goalSheet: {
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
  goal?: {
    id: string;
    title: string;
  };
}

const ManagerCheckInDashboard: React.FC = () => {
  const [pendingCheckIns, setPendingCheckIns] = useState<CheckInComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [reworkComments, setReworkComments] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPendingCheckIns();
  }, []);

  const fetchPendingCheckIns = async () => {
    try {
      setLoading(true);
      const response = await api.getTeamCheckInStatusForApproval();
      setPendingCheckIns(response.data.checkIns || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching check-ins:", err);
      setError("Failed to load pending check-ins");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (checkInCommentId: string) => {
    const comments = reworkComments[checkInCommentId]?.trim();
    if (!comments) {
      alert("Manager check-in comments are required.");
      return;
    }
    try {
      setActionInProgress(checkInCommentId);
      await api.approveCheckInComment(checkInCommentId, comments);
      setPendingCheckIns(
        pendingCheckIns.filter((c) => c.id !== checkInCommentId)
      );
    } catch (err) {
      console.error("Error approving check-in:", err);
      alert("Failed to approve check-in");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRequestRework = async (checkInCommentId: string) => {
    const comments = reworkComments[checkInCommentId]?.trim();
    if (!comments) {
      alert("Manager feedback is required to request rework.");
      return;
    }
    try {
      setActionInProgress(checkInCommentId);
      await api.requestCheckInRework(checkInCommentId, comments);
      setPendingCheckIns(
        pendingCheckIns.filter((c) => c.id !== checkInCommentId)
      );
      setReworkComments((prev) => {
        const next = { ...prev };
        delete next[checkInCommentId];
        return next;
      });
    } catch (err) {
      console.error("Error requesting rework:", err);
      alert("Failed to request rework");
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading pending check-ins...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error}
      </div>
    );
  }

  if (pendingCheckIns.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800">All Caught Up!</h3>
        <p className="text-gray-600">No pending check-ins to review</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Pending Check-ins</h2>
        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
          {pendingCheckIns.length} pending
        </span>
      </div>

      <div className="grid gap-4">
        {pendingCheckIns.map((checkIn) => (
          <div
            key={checkIn.id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {checkIn.goalSheet.user.name}
                </h3>
                <p className="text-sm text-gray-600">
                  {checkIn.goalSheet.user.email}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-yellow-50 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                  {checkIn.quarter}
                </span>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-gray-700">{checkIn.commentText}</p>
              <p className="text-xs text-gray-500 mt-2">
                Submitted: {new Date(checkIn.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Your feedback (if rework requested):</p>
                  <textarea
                    value={reworkComments[checkIn.id] || ""}
                    onChange={(e) =>
                      setReworkComments((prev) => ({
                        ...prev,
                        [checkIn.id]: e.target.value,
                      }))
                    }
                    placeholder="Enter feedback for the employee..."
                    className="w-full mt-2 p-2 border border-blue-300 rounded text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    disabled={actionInProgress === checkIn.id}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(checkIn.id)}
                disabled={actionInProgress === checkIn.id}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {actionInProgress === checkIn.id ? "Processing..." : "Approve"}
              </button>
              <button
                onClick={() => handleRequestRework(checkIn.id)}
                disabled={actionInProgress === checkIn.id}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                {actionInProgress === checkIn.id ? "Processing..." : "Request Rework"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ManagerCheckInDashboard;
