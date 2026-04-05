// src/services/operations.ts
import {
  collection,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Operation } from "@/types";

/**
 * Subscribe to real-time operations for a project.
 * Returns unsubscribe function.
 */
export const subscribeToOperations = (
  projectId: string,
  onUpdate: (ops: Operation[]) => void
): (() => void) => {
  const q = query(
    collection(db, "operations"),
    where("projectId", "==", projectId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const ops = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Operation));
    onUpdate(ops);
  });
};

/**
 * Create a new operation document in Firestore.
 */
export const createOperation = async (data: Omit<Operation, "id">): Promise<string> => {
  const ref = await addDoc(collection(db, "operations"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return ref.id;
};

/**
 * Update an existing operation's status.
 */
export const updateOperationStatus = async (
  id: string,
  status: "DONE" | "ERROR",
  result?: any,
  error?: any
): Promise<void> => {
  await updateDoc(doc(db, "operations", id), {
    status,
    updatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
    ...(result ? { result } : {}),
    ...(error ? { error } : {}),
  });
};
