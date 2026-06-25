"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { DashboardSummary, AgentPerformance, CurrentUser } from "@/lib/api-types";
import {
  BarChart2,
  CheckCircle,
  Clock,
  AlertCircle,
  Inbox,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AppHeader, LoginScreen } from "@/features/inbox/inbox-components";
import { API_BASE_URL } from "@/lib/app-config";

const TOKEN_STORAGE_KEY = "omnidesk.accessToken";

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setAuthLoading(false);
      return;
    }

    apiClient
      .me(storedToken)
      .then((user) => {
        setToken(storedToken);
        setCurrentUser(user);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogin(email: string, password: string) {
    setAuthError(null);
    try {
      const response = await apiClient.login(email, password);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setToken(response.accessToken);
      setCurrentUser(response.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
  }

  useEffect(() => {
    async function loadData() {
      if (!token) return;
      try {
        const [sumData, perfData] = await Promise.all([
          apiClient.getDashboardSummary(token),
          apiClient.getAgentPerformance(token),
        ]);
        setSummary(sumData);
        setPerformance(perfData);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    
    // Refresh every 30s
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
      </div>
    );
  }

  if (!token || !currentUser) {
    return <LoginScreen error={authError} onLogin={handleLogin} />;
  }

  if (loading || !summary) {
    return (
      <div className="flex h-screen flex-col bg-[#f6f7f9]">
        <AppHeader
          apiBaseUrl={API_BASE_URL}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
        </div>
      </div>
    );
  }

  const stats = [
    { name: "Total Tickets", value: summary.total, icon: Inbox, color: "text-slate-500", bg: "bg-slate-100" },
    { name: "New", value: summary.new, icon: AlertCircle, color: "text-blue-500", bg: "bg-blue-100" },
    { name: "In Progress", value: summary.inProgress, icon: Clock, color: "text-amber-500", bg: "bg-amber-100" },
    { name: "Resolved", value: summary.resolved, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-100" },
    { name: "SLA Overdue", value: summary.overdue, icon: AlertCircle, color: "text-red-500", bg: "bg-red-100" },
  ];

  const pieData = Object.entries(summary.byChannel).map(([name, value]) => ({
    name: name.replace("FACEBOOK_", "FB "),
    value,
  }));
  const PIE_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];

  const barData = performance.map((p) => ({
    name: p.name,
    resolved: p.resolvedTickets,
  }));

  return (
    <div className="flex h-screen flex-col bg-[#f6f7f9]">
      <AppHeader
        apiBaseUrl={API_BASE_URL}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <div className="flex-1 overflow-y-auto p-8">
        <h1 className="mb-8 text-2xl font-semibold text-slate-900">
          Operational Dashboard
        </h1>

        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.name}
              className="flex items-center rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
            >
              <div className={`rounded-lg p-3 ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Agent Performance */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-6 py-5 flex items-center">
              <Users className="h-5 w-5 text-slate-500 mr-2" />
              <h3 className="text-base font-semibold text-slate-900">
                Agent Performance
              </h3>
            </div>
            <div className="p-6 h-[400px]">
              {performance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="resolved" name="Resolved Tickets" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-slate-500">No agent data available.</p>
                </div>
              )}
            </div>
          </div>

          {/* Tickets by Channel */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-6 py-5 flex items-center">
              <BarChart2 className="h-5 w-5 text-slate-500 mr-2" />
              <h3 className="text-base font-semibold text-slate-900">
                Tickets by Channel
              </h3>
            </div>
            <div className="p-6 h-[400px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-slate-500">No channel data available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
