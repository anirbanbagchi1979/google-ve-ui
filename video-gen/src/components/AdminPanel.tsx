"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const ADMIN_EMAILS = ["anirban.bagchi@gmail.com", "bagchi@google.com"];

interface AllowedUser {
  id: string;
  email: string;
  addedAt?: any;
  addedBy?: string;
}

const AdminPanel = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showFeedback = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const INITIAL_USERS = ["balajikr@google.com", "kartikjain@google.com", "patpoon@google.com"];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "allowlist"), orderBy("addedAt", "desc")));
      const existing = snap.docs.map(d => ({ id: d.id, email: d.data().email, addedAt: d.data().addedAt, addedBy: d.data().addedBy }));
      // Seed initial users on first ever load
      if (existing.length === 0) {
        await Promise.all(INITIAL_USERS.map(email =>
          addDoc(collection(db, "allowlist"), { email, addedBy: "system", addedAt: Timestamp.now() })
        ));
        const seeded = await getDocs(query(collection(db, "allowlist"), orderBy("addedAt", "desc")));
        setUsers(seeded.docs.map(d => ({ id: d.id, email: d.data().email, addedAt: d.data().addedAt, addedBy: d.data().addedBy })));
      } else {
        setUsers(existing);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { showFeedback("error", "Enter a valid email address."); return; }
    if (users.some(u => u.email === email) || ADMIN_EMAILS.includes(email)) {
      showFeedback("error", "Email is already allowed."); return;
    }
    setAdding(true);
    try {
      await addDoc(collection(db, "allowlist"), {
        email,
        addedBy: user?.email ?? "unknown",
        addedAt: Timestamp.now(),
      });
      setNewEmail("");
      await fetchUsers();
      showFeedback("success", `${email} added.`);
    } catch (e) {
      showFeedback("error", "Failed to add user.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "allowlist", id));
      await fetchUsers();
      showFeedback("success", `${email} removed.`);
    } catch (e) {
      showFeedback("error", "Failed to remove user.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="w-7 h-7 bg-slate-600 rounded-lg flex items-center justify-center shrink-0">
          <Shield size={13} className="text-white" />
        </div>
        <div>
          <p className="text-[12px] font-bold text-white">Admin — Access Control</p>
          <p className="text-[10px] text-slate-400">Manage who can log into this app</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}>
            {feedback.type === "success" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {feedback.msg}
          </div>
        )}

        {/* Add user */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Add user</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="user@example.com"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all placeholder:text-slate-400"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newEmail.trim()}
              className="px-3 py-2 bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add
            </button>
          </div>
        </div>

        {/* Allowed users list */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Allowed users ({ADMIN_EMAILS.length + users.length})
          </p>

          {/* Hardcoded admins */}
          {ADMIN_EMAILS.map(email => (
            <div key={email} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-800 truncate">{email}</p>
                <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mt-0.5">Admin · permanent</p>
              </div>
              <Shield size={12} className="text-slate-400 shrink-0 ml-2" />
            </div>
          ))}

          {/* Firestore users */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-slate-300" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-4">No additional users yet.</p>
          ) : (
            users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2.5 bg-white border border-slate-200 rounded-xl">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-800 truncate">{u.email}</p>
                  {u.addedBy && (
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">Added by {u.addedBy}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(u.id, u.email)}
                  disabled={deletingId === u.id}
                  className="ml-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 disabled:opacity-40 shrink-0"
                >
                  {deletingId === u.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
