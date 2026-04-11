"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { collection, getDocs, setDoc, deleteDoc, doc, query, orderBy, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/constants";
import { useAuth } from "@/context/AuthContext";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface AllowedUser {
  email: string;
  addedAt?: any;
  addedBy?: string;
  isAdmin?: boolean;
}

const AdminPanel = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showFeedback = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.ALLOWLIST), orderBy("addedAt", "desc")));

      // Migrate any docs that have auto-generated IDs (id !== email) to email-as-ID format
      const migrations: Promise<void>[] = [];
      snap.docs.forEach(d => {
        const email = d.data().email;
        if (email && d.id !== email) {
          migrations.push(
            setDoc(doc(db, COLLECTIONS.ALLOWLIST, email), { ...d.data() })
              .then(() => deleteDoc(doc(db, COLLECTIONS.ALLOWLIST, d.id)))
          );
        }
      });
      if (migrations.length > 0) await Promise.all(migrations);

      // Re-fetch after migration (or use current data if no migration needed)
      const source = migrations.length > 0
        ? await getDocs(query(collection(db, COLLECTIONS.ALLOWLIST), orderBy("addedAt", "desc")))
        : snap;

      setUsers(source.docs.map(d => ({
        email: d.id, // doc ID is the email
        addedAt: d.data().addedAt,
        addedBy: d.data().addedBy,
        isAdmin: d.data().isAdmin === true,
      })));
    } catch (e) {
      console.error("[AdminPanel] load users failed:", e);
      showFeedback("error", "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      showFeedback("error", "Enter a valid email address.");
      return;
    }
    if (users.some(u => u.email === email)) {
      showFeedback("error", "Email is already on the allowlist.");
      return;
    }
    setAdding(true);
    try {
      await setDoc(doc(db, COLLECTIONS.ALLOWLIST, email), {
        email,
        addedBy: user?.email ?? "unknown",
        addedAt: Timestamp.now(),
        isAdmin: false,
      });
      setNewEmail("");
      await fetchUsers();
      showFeedback("success", `${email} added.`);
    } catch (e) {
      console.error("[AdminPanel] add user failed:", e);
      showFeedback("error", "Failed to add user.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (email: string) => {
    setDeletingEmail(email);
    try {
      await deleteDoc(doc(db, COLLECTIONS.ALLOWLIST, email));
      await fetchUsers();
      showFeedback("success", `${email} removed.`);
    } catch (e) {
      console.error("[AdminPanel] delete user failed:", e);
      showFeedback("error", "Failed to remove user.");
    } finally {
      setDeletingEmail(null);
    }
  };

  const handleToggleAdmin = async (email: string, currentIsAdmin: boolean) => {
    setTogglingEmail(email);
    try {
      await updateDoc(doc(db, COLLECTIONS.ALLOWLIST, email), { isAdmin: !currentIsAdmin });
      await fetchUsers();
      showFeedback("success", `${email} is ${!currentIsAdmin ? "now an admin" : "no longer an admin"}.`);
    } catch (e) {
      console.error("[AdminPanel] toggle admin failed:", e);
      showFeedback("error", "Failed to update admin status.");
    } finally {
      setTogglingEmail(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white overflow-hidden">
      <PanelHeader icon={<Shield size={13} />} title="Admin — Access Control" subtitle="Manage who can log into this app" />

      {/* Feedback */}
      {feedback && (
        <div className={`mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold shrink-0 ${
          feedback.type === "success"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-red-50 border border-red-200 text-red-600"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {feedback.msg}
        </div>
      )}

      {/* Add user */}
      <div className="px-4 pt-4 pb-3 space-y-2 shrink-0 border-b border-slate-100">
        <SectionLabel>Add user</SectionLabel>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="user@example.com"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newEmail.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <SectionLabel>Allowed users ({users.length})</SectionLabel>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-6">No users yet.</p>
        ) : (
          users.map(u => (
            <div key={u.email} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
              u.isAdmin ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200"
            }`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-semibold text-slate-800 truncate">{u.email}</p>
                  {u.isAdmin && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[9px] font-bold uppercase tracking-widest rounded shrink-0">
                      Admin
                    </span>
                  )}
                </div>
                {u.addedBy && (
                  <p className="text-[9px] text-slate-400 mt-0.5 truncate">Added by {u.addedBy}</p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                {/* Toggle admin */}
                <button
                  onClick={() => handleToggleAdmin(u.email, u.isAdmin ?? false)}
                  disabled={togglingEmail === u.email}
                  title={u.isAdmin ? "Remove admin" : "Make admin"}
                  className={`p-1.5 rounded-lg transition-colors border ${
                    u.isAdmin
                      ? "text-blue-500 hover:text-blue-700 hover:bg-blue-100 border-blue-200"
                      : "text-slate-300 hover:text-blue-500 hover:bg-blue-50 border-transparent hover:border-blue-100"
                  } disabled:opacity-40`}
                >
                  {togglingEmail === u.email
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Shield size={12} />}
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(u.email)}
                  disabled={deletingEmail === u.email}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 disabled:opacity-40"
                >
                  {deletingEmail === u.email ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
