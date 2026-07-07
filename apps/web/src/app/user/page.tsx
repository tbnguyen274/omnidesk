"use client";

import { useEffect, useState, FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { CurrentUser, UserRole } from "@/lib/api-types";
import { AlertCircle, Plus, Search, ShieldAlert } from "lucide-react";

export default function UsersManagementPage() {
  const { token, currentUser } = useAuth();
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", role: "AGENT" as UserRole });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

        async function loadUsers() {
    if (!token) return;
    try {
      const data = await apiClient.getUsers(token);
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser?.role === "ADMIN") {
      setTimeout(() => {
        void loadUsers();
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreateLoading(true);
    setCreateError("");
    try {
      await apiClient.createUser(token, createForm);
      setIsModalOpen(false);
      setCreateForm({ name: "", email: "", role: "AGENT" });
      loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreateLoading(false);
    }
  }

  async function toggleUserStatus(user: CurrentUser) {
    if (!token) return;
    const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await apiClient.updateUserStatus(token, user.id, newStatus);
      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    } catch {
      alert("Failed to update status");
    }
  }

  if (!currentUser) return null;

  if (currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="rounded-2xl bg-white p-8 text-center max-w-md border border-slate-200 shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-[#EE0033] mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">You need Administrator privileges to manage users.</p>
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#EE0033] px-6 text-sm font-semibold text-white transition-all hover:bg-[#c4002a] shadow-md shadow-[#EE0033]/20">
            Return to Inbox
          </Link>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#EE0033] px-4 text-sm font-semibold text-white shadow-md shadow-[#EE0033]/20 transition-colors hover:bg-[#c4002a] cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Plus className="mr-2 h-4 w-4" />
            Invite User
          </button>
        </div>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60 overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Loading users...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{user.name}</div>
                        <div className="text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => toggleUserStatus(user)}
                          disabled={user.id === currentUser.id}
                          className={`text-sm font-medium cursor-pointer ${
                            user.id === currentUser.id 
                              ? 'text-slate-300 cursor-not-allowed' 
                              : user.status === 'ACTIVE' 
                                ? 'text-red-600 hover:text-red-700' 
                                : 'text-emerald-600 hover:text-emerald-700'
                          }`}
                        >
                          {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Invite New User</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer rounded-full p-1.5 focus:outline-none focus:ring-2 focus:ring-[#EE0033]"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6">
              {createError && (
                <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 flex-shrink-0" />
                  <p>{createError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">Full Name</label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">Email Address</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({...createForm, role: e.target.value as UserRole})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] focus:bg-white cursor-pointer"
                  >
                    <option value="AGENT">Agent</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-xl bg-[#EE0033] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#EE0033]/20 hover:bg-[#c4002a] transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                >
                  {createLoading ? "Inviting..." : "Invite User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
