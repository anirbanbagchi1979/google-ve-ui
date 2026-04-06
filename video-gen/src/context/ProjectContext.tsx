"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, addDoc, query, onSnapshot, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";

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
  const [loading, setLoading] = useState(true);

  // Initialize selected project from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("veo_current_project_id");
      if (saved) setCurrentProjectId(saved);
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
      collection(db, "projects"),
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
        if (!currentProjectId || !prjs.find(p => p.id === currentProjectId)) {
            setCurrentProjectId(prjs[0].id);
            localStorage.setItem("veo_current_project_id", prjs[0].id);
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
  }, [user, currentProjectId, loading]);

  const createProject = async (name: string) => {
    if (!user?.email) return null;
    try {
      const docRef = await addDoc(collection(db, "projects"), {
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
    setCurrentProjectId(projectId);
    localStorage.setItem("veo_current_project_id", projectId);
  };

  return (
    <ProjectContext.Provider value={{ projects, currentProjectId, loading, createProject, switchProject }}>
      {children}
    </ProjectContext.Provider>
  );
};
