"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { collection, addDoc, query, onSnapshot, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { COLLECTIONS, STORAGE_KEYS } from "@/constants";

export interface Project {
  id: string;
  name: string;
  userEmail: string;
  createdAt: any;
}

interface ProjectContextType {
  projects: Project[];
  currentProjectId: string | null;
  loading: boolean;
  createProject: (name: string) => Promise<string | null>;
  switchProject: (projectId: string) => void;
}

const ProjectContext = createContext<ProjectContextType>({
  projects: [],
  currentProjectId: null,
  loading: true,
  createProject: async () => null,
  switchProject: () => {},
});

export const useProject = () => useContext(ProjectContext);

export const ProjectProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize selected project from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT);
      if (saved) {
        setCurrentProjectId(saved);
        currentProjectIdRef.current = saved;
      }
    }
  }, []);

  // Listen to all projects (shared across all authenticated users)
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.PROJECTS),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prjs: Project[] = [];
      snapshot.forEach((doc) => {
        prjs.push({ id: doc.id, ...doc.data() } as Project);
      });
      setProjects(prjs);
      
      // Auto-select logic
      if (prjs.length > 0) {
        if (!currentProjectIdRef.current || !prjs.find(p => p.id === currentProjectIdRef.current)) {
            setCurrentProjectId(prjs[0].id);
            currentProjectIdRef.current = prjs[0].id;
            localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT, prjs[0].id);
        }
      } else if (prjs.length === 0 && !loading) {
          // You could automatically create a default project here if desired
      }

      setLoading(false);
    }, (error) => {
      console.error("Error fetching projects", error);
      setLoading(false);
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createProject = async (name: string) => {
    if (!user?.email) return null;
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.PROJECTS), {
        name,
        userEmail: user.email,
        createdAt: serverTimestamp(),
      });
      switchProject(docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("Error creating project", error);
      return null;
    }
  };

  const switchProject = (projectId: string) => {
    currentProjectIdRef.current = projectId;
    setCurrentProjectId(projectId);
    localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT, projectId);
  };

  return (
    <ProjectContext.Provider value={{ projects, currentProjectId, loading, createProject, switchProject }}>
      {children}
    </ProjectContext.Provider>
  );
};
