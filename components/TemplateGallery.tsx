
import React, { useState } from 'react';
import { AgentType } from '../types';
import { Eye, Upload, X, FileText, BrainCircuit, CheckCircle, Lock } from './Icons';

interface TemplateGalleryProps {
  onSelectFiles: (files: File[], format: AgentType) => void;
}

// Updated Configuration: Visual differentiation for Generic A (Purple) vs TCBV (Indigo)
const AGENTS = [
  {
    id: 'AGENT_TCBV',
    name: 'Agente Cliente TCBV',
    description: 'Especializado en facturas de Rosas. Realiza prorrateo automático de valores por EQ.',
    color: 'bg-indigo-600',
    active: true,
    tags: ['Matemática', 'Rosas', 'Prorrateo'],
    mockImage: 'https://via.placeholder.com/600x800?text=TCBV+Format+Preview'
  },
  {
    id: 'AGENT_GENERIC_A',
    name: 'Agente Factura General',
    description: 'Modelo híbrido. Procesa facturas estándar Y aplica lógica de prorrateo TCBV si detecta grupos.',
    color: 'bg-purple-600', // Changed to Purple for distinct visual identity
    active: true,
    tags: ['Estándar + Math', 'Comercial', 'Auto-Detect'],
    mockImage: ''
  },
  {
    id: 'AGENT_GENERIC_B',
    name: 'Agente Packing List',
    description: 'Extracción de pesos y dimensiones desde PLs mixtos.',
    color: 'bg-slate-400',
    active: false,
    tags: ['Próximamente'],
    mockImage: ''
  },
  {
    id: 'AGENT_CUSTOMS',
    name: 'Agente Aduanas (DAE)',
    description: 'Validación cruzada contra formatos gubernamentales.',
    color: 'bg-slate-400',
    active: false,
    tags: ['Próximamente'],
    mockImage: ''
  }
];

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectFiles }) => {
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, format: string) => {
    if (e.target.files && e.target.files.length > 0) {
      onSelectFiles(Array.from(e.target.files), format as AgentType);
    }
  };

  // Filter out disabled agents for the view
  const visibleAgents = AGENTS.filter(a => a.id === 'AGENT_TCBV' || a.id === 'AGENT_GENERIC_A');

  // Helper to get icon styling based on agent type
  const getIconStyle = (agent: typeof AGENTS[0]) => {
    if (!agent.active) return 'bg-slate-200 text-slate-400';
    
    // Purple theme for Generic Agent
    if (agent.id === 'AGENT_GENERIC_A') return 'bg-purple-50 dark:bg-purple-900/20 text-purple-600';
    
    // Default Indigo for TCBV
    return 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-3">
           <BrainCircuit className="w-8 h-8 text-indigo-600" />
           Seleccionar Agente de Procesamiento
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
           Agentes neuronales con capacidad matemática para desglose y validación de facturas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {visibleAgents.map((agent) => (
          <div key={agent.id} className={`group relative rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${agent.active ? 'bg-white dark:bg-slate-800 hover:shadow-xl hover:shadow-indigo-500/10 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 opacity-70'}`}>
            <div className={`h-2 w-full ${agent.color}`} />
            
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-4 rounded-2xl ${getIconStyle(agent)}`}>
                  <FileText className="w-8 h-8" />
                </div>
                {/* Enable Preview for both now since logic is shared */}
                <button 
                onClick={() => setPreviewTemplate(agent.id)}
                className="p-3 bg-slate-50 dark:bg-slate-700 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors"
                title="Ver Lógica Matemática"
                >
                <Eye className="w-6 h-6" />
                </button>
              </div>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">{agent.name}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed h-12">{agent.description}</p>

              <div className="flex flex-wrap gap-2 mb-8">
                {agent.tags.map(tag => (
                  <span key={tag} className={`px-3 py-1 text-xs rounded-full font-bold uppercase tracking-wide ${agent.active ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-slate-200 text-slate-400'}`}>
                    {tag}
                  </span>
                ))}
              </div>

              {agent.active ? (
                <label className={`cursor-pointer flex items-center justify-center w-full py-4 rounded-xl font-bold text-white transition-all transform active:scale-95 ${agent.color} hover:brightness-110 shadow-lg shadow-indigo-500/20 text-lg`}>
                    <Upload className="w-5 h-5 mr-2" />
                    Cargar Lote
                    <input 
                    type="file" 
                    multiple 
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, agent.id)}
                    />
                </label>
              ) : (
                <button disabled className="w-full py-4 rounded-xl font-bold text-slate-400 bg-slate-200 cursor-not-allowed">
                    Deshabilitado
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Logic Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl p-8 animate-in zoom-in-95 duration-300 border border-slate-700 relative">
             <button 
                onClick={() => setPreviewTemplate(null)} 
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400"
             >
               <X className="w-6 h-6" />
             </button>
             
             <div className="flex items-center gap-4 mb-6">
                <div className={`p-3 rounded-lg text-white ${previewTemplate === 'AGENT_GENERIC_A' ? 'bg-purple-600' : 'bg-indigo-600'}`}>
                    <BrainCircuit className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Lógica Matemática (Compartida)</h3>
                    <p className="text-slate-500">Cómo procesan los agentes las tablas agrupadas</p>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-8">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-2 text-sm">Problema (Input Factura)</h4>
                    <div className="font-mono text-xs text-slate-500 space-y-1">
                        <p>Row 1: 12 HB | (Vacío) | (Vacío)</p>
                        <p>Row 2: 3 QB  | (Vacío) | (Vacío)</p>
                        <p className={`${previewTemplate === 'AGENT_GENERIC_A' ? 'text-purple-600' : 'text-indigo-600'} font-bold`}>Row 3: SUMMARY | $1,785.36 | 4100 Stems</p>
                    </div>
                </div>
                <div className="flex items-center justify-center">
                    <div className={`p-2 rounded-full ${previewTemplate === 'AGENT_GENERIC_A' ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        <CheckCircle className="w-6 h-6" />
                    </div>
                </div>
                <div className={`${previewTemplate === 'AGENT_GENERIC_A' ? 'bg-purple-50 border-purple-100' : 'bg-indigo-50 border-indigo-100'} p-4 rounded-xl border col-span-2`}>
                    <h4 className={`font-bold ${previewTemplate === 'AGENT_GENERIC_A' ? 'text-purple-700' : 'text-indigo-700'} mb-2 text-sm`}>Solución IA (Output JSON)</h4>
                    <p className={`text-xs ${previewTemplate === 'AGENT_GENERIC_A' ? 'text-purple-600' : 'text-indigo-600'} mb-2`}>El agente calcula el ratio EQ y distribuye valores:</p>
                    <div className={`font-mono text-xs ${previewTemplate === 'AGENT_GENERIC_A' ? 'text-purple-800' : 'text-indigo-800'} space-y-1`}>
                        <p>Item 1: 12 HB → Value: $1,586.98 (Calc) → Desc: Inherited</p>
                        <p>Item 2: 3 QB  → Value: $198.38 (Calc)   → Desc: Inherited</p>
                    </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateGallery;
