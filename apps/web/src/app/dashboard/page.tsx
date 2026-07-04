"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Inbox, Clock, CheckCircle, AlertCircle, BarChart2, Users } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Link from "next/link";

interface DashboardSummary {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  overdue: number;
  byChannel: Record<string, number>;
}

interface AgentPerformance {
  name: string;
  resolvedTickets: number;
}

export default function Dashboard() {
  const { token, currentUser } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

        useEffect(() => {
    if (!token) return;

    async function loadData() {
      try {
        const sumData = await apiClient.getDashboardSummary(token!);
        setSummary(sumData);

        const perfData = await apiClient.getAgentPerformance(token!);
        setPerformance(perfData);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (!currentUser) return null;

  if (loading || !summary) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#EE0033]"></div>
      </div>
    );
  }

  if (currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="rounded-2xl bg-[#F8F9FB] p-8 text-center max-w-md shadow-sm border border-slate-200">
          <AlertCircle className="mx-auto h-12 w-12 text-[#EE0033] mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">You need Administrator privileges to access the Dashboard.</p>
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#EE0033] px-6 text-sm font-semibold text-white transition-all hover:bg-[#c4002a] shadow-md shadow-[#EE0033]/20">
            Return to Inbox
          </Link>
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
  const PIE_COLORS = ['#EE0033', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];

  const barData = performance.map((p) => ({
    name: p.name,
    resolved: p.resolvedTickets,
  }));

  return (
    <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-2xl font-bold text-slate-900">
              Operational Dashboard
            </h1>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => (
              <div
                key={stat.name}
                className="flex items-center rounded-2xl bg-[#F8F9FB] p-5 shadow-sm border border-slate-100"
              >
                <div className={`rounded-xl p-3 ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {stat.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Agent Performance */}
            <div className="rounded-2xl bg-[#F8F9FB] shadow-sm border border-slate-100 flex flex-col">
              <div className="border-b border-slate-200 px-6 py-5 flex items-center">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3">
                  <Users className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Agent Performance
                </h3>
              </div>
              <div className="p-6 h-[350px] flex-1">
                {performance.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="resolved" name="Resolved Tickets" fill="#EE0033" radius={[6, 6, 0, 0]} barSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm font-medium text-slate-400">No agent data available.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tickets by Channel */}
            <div className="rounded-2xl bg-[#F8F9FB] shadow-sm border border-slate-100 flex flex-col">
              <div className="border-b border-slate-200 px-6 py-5 flex items-center">
                <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mr-3">
                  <BarChart2 className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Tickets by Channel
                </h3>
              </div>
              <div className="p-6 h-[350px] flex-1">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={85}
                        outerRadius={125}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', fontWeight: 500, color: '#475569' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm font-medium text-slate-400">No channel data available.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
  );
}
