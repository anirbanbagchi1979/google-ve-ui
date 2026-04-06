import React, { useState } from "react";
import { useConfig, AppConfig } from "@/context/ConfigContext";
import { Settings, Save, RotateCcw, Building, MapPin, Database, Folder, Cpu, Info } from "lucide-react";

const SettingsPanel = () => {
  const { config, updateConfig, resetConfig } = useConfig();
  const [localConfig, setLocalConfig] = useState(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (key: string, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Check if any backbone settings changed
    const backboneKeys: (keyof AppConfig)[] = [
      "firebaseApiKey", "firebaseAuthDomain", "firebaseProjectId", 
      "firebaseStorageBucket", "firebaseMessagingSenderId", 
      "firebaseAppId", "firestoreDbId"
    ];
    
    const needsRestart = backboneKeys.some(key => localConfig[key] !== config[key]);

    updateConfig(localConfig);
    setHasChanges(false);
    
    if (needsRestart) {
      alert("Backbone Infrastructure updated. The application will now restart to apply core changes.");
      window.location.reload();
    } else {
      alert("Settings saved successfully!");
    }
  };

  const handleReset = () => {
    if (confirm("Reset all settings to defaults?")) {
      resetConfig();
      // Wait for context update to reflect in local state or force local update
      window.location.reload(); 
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-y-auto max-w-2xl mx-auto w-full p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Settings size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">App Configuration</h2>
            <p className="text-[13px] text-slate-400 font-medium italic">Manage project settings and GCS paths</p>
          </div>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={handleReset}
             className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all text-xs font-bold uppercase tracking-widest"
           >
             <RotateCcw size={14} />
             Reset
           </button>
           <button 
             onClick={handleSave}
             disabled={!hasChanges}
             className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-widest shadow-sm ${
               hasChanges ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"
             }`}
           >
             <Save size={14} />
             Save Changes
           </button>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Project Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <Building size={16} className="text-blue-500" />
            <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">Project & Environment</h3>
          </div>
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Project ID</label>
               <div className="relative group">
                 <input 
                   type="text" 
                   value={localConfig.projectId}
                   onChange={(e) => handleChange("projectId", e.target.value)}
                   className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                   placeholder="e.g. your-project-id"
                 />
                 <div className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-200 group-focus-within:text-blue-500 transition-colors">
                   <Info size={14} />
                 </div>
               </div>
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Region / Location</label>
               <div className="relative group">
                 <input 
                   type="text" 
                   value={localConfig.location}
                   onChange={(e) => handleChange("location", e.target.value)}
                   className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                   placeholder="e.g. us-central1"
                 />
                 <div className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-200 group-focus-within:text-blue-500 transition-colors">
                   <MapPin size={14} />
                 </div>
               </div>
             </div>
          </div>
        </section>

        {/* GCS Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <Database size={16} className="text-blue-500" />
            <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">Storage & Output</h3>
          </div>
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">GCS Bucket Name</label>
               <input 
                 type="text" 
                 value={localConfig.gcsBucket}
                 onChange={(e) => handleChange("gcsBucket", e.target.value)}
                 className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                 placeholder="e.g. my-vdeos-bucket"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Output Folder</label>
               <div className="relative">
                 <input 
                   type="text" 
                   value={localConfig.outputFolder}
                   onChange={(e) => handleChange("outputFolder", e.target.value)}
                   className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none pl-10"
                   placeholder="e.g. outputs"
                 />
                 <div className="absolute top-1/2 -translate-y-1/2 left-4 text-slate-300">
                   <Folder size={16} />
                 </div>
               </div>
             </div>
          </div>
        </section>

        {/* Models Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <Cpu size={16} className="text-blue-500" />
            <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">Model Configuration</h3>
          </div>
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Generation Model</label>
               <input 
                 type="text" 
                 value={localConfig.videoGenModel}
                 onChange={(e) => handleChange("videoGenModel", e.target.value)}
                 className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                 placeholder="veo-001"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Upscale Model</label>
               <input 
                 type="text" 
                 value={localConfig.upscaleModel}
                 onChange={(e) => handleChange("upscaleModel", e.target.value)}
                 className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                 placeholder="veo3p1_upscale"
               />
             </div>
          </div>
        </section>

        {/* Backbone Section */}
        <section className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 text-slate-600 mb-2">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-red-500" />
              <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-red-500/80">Backbone Infrastructure</h3>
            </div>
            <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[8px] font-black uppercase rounded border border-red-100">Requires Restart</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Firebase API Key</label>
               <input 
                 type="password" 
                 value={localConfig.firebaseApiKey}
                 onChange={(e) => handleChange("firebaseApiKey", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Firebase Project ID</label>
               <input 
                 type="text" 
                 value={localConfig.firebaseProjectId}
                 onChange={(e) => handleChange("firebaseProjectId", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Auth Domain</label>
               <input 
                 type="text" 
                 value={localConfig.firebaseAuthDomain}
                 onChange={(e) => handleChange("firebaseAuthDomain", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Storage Bucket</label>
               <input 
                 type="text" 
                 value={localConfig.firebaseStorageBucket}
                 onChange={(e) => handleChange("firebaseStorageBucket", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">App ID</label>
               <input 
                 type="text" 
                 value={localConfig.firebaseAppId}
                 onChange={(e) => handleChange("firebaseAppId", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Firestore Database ID</label>
               <input 
                 type="text" 
                 value={localConfig.firestoreDbId}
                 onChange={(e) => handleChange("firestoreDbId", e.target.value)}
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 focus:ring-1 focus:ring-red-500/20 focus:border-red-400 transition-all outline-none"
               />
             </div>
          </div>
        </section>
      </div>

      {/* Warning Footer */}
      <div className="mt-8 bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
         <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
         <div className="space-y-1">
            <p className="text-[11px] text-amber-800 font-bold leading-relaxed italic">
              Critical Warning: Modifying "Backbone Infrastructure" settings will re-initialize the entire application core.
            </p>
            <p className="text-[10px] text-amber-600 font-medium">
              If you change these values, the application will automatically perform a hard refresh to connect to your new Firebase project.
            </p>
         </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
