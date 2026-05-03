import React from 'react';
import { AgentType } from '../types';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle,
  FileText,
  FileWarning,
  Lock,
  Package,
  Shield,
  Upload,
  Zap,
} from './Icons';

interface TemplateGalleryProps {
  onSelectFiles: (files: File[], format: AgentType) => void;
}

const ACTIVE_AGENT = {
  id: 'AGENT_GENERIC_A' as AgentType,
  name: 'Agente Factura General',
  description:
    'Procesa facturas comerciales estándar, valida totales y prepara los datos para revisión operativa.',
  tags: ['PDF', 'Factura comercial', 'Validación IA'],
};

const FUTURE_AGENTS = [
  {
    name: 'Agente Packing List',
    description: 'Lectura de pesos, piezas y dimensiones desde listas de empaque.',
    icon: Package,
  },
  {
    name: 'Agente Aduanas',
    description: 'Cruce documental contra soportes y formatos regulatorios.',
    icon: Shield,
  },
  {
    name: 'Agente Incidencias',
    description: 'Detección automática de diferencias, faltantes y alertas de datos.',
    icon: FileWarning,
  },
];

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectFiles }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, format: string) => {
    if (e.target.files && e.target.files.length > 0) {
      onSelectFiles(Array.from(e.target.files), format as AgentType);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-7 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            <BrainCircuit className="h-3.5 w-3.5" />
            Agentes IA
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Procesamiento inteligente de facturas
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Carga uno o varios PDFs y el agente general se encarga de extraer, validar y preparar la
            información para revisión.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          Agente principal activo
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-6 md:p-8">
            <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 dark:bg-cyan-500 dark:shadow-cyan-500/20">
                  <FileText className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {ACTIVE_AGENT.name}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {ACTIVE_AGENT.description}
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Listo
              </div>
            </div>

            <label className="group relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-cyan-200 bg-cyan-50/40 px-6 py-10 text-center transition-all hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:hover:border-cyan-400/60 dark:hover:bg-cyan-500/10">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-70" />
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm ring-1 ring-cyan-100 transition-transform group-hover:-translate-y-1 dark:bg-slate-950 dark:text-cyan-300 dark:ring-cyan-500/20">
                <Upload className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                Seleccionar PDFs para procesar
              </div>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Haz clic aquí o arrastra el lote de facturas en PDF.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition-colors group-hover:bg-cyan-600 dark:bg-cyan-500 dark:group-hover:bg-cyan-400">
                Cargar lote
                <ArrowRight className="h-4 w-4" />
              </div>
              <input
                type="file"
                multiple
                accept=".pdf, application/pdf"
                className="hidden"
                onChange={(event) => handleFileChange(event, ACTIVE_AGENT.id)}
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-2">
              {ACTIVE_AGENT.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950/40 lg:border-l lg:border-t-0">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Flujo operativo
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Carga, extracción y revisión.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                'Recibe PDFs del operador',
                'Extrae datos estructurados',
                'Envía resultados al historial',
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                    {index + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Agentes futuros</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tipos de procesamiento reservados para próximas etapas.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {FUTURE_AGENTS.map((agent) => {
            const Icon = agent.icon;

            return (
              <div
                key={agent.name}
                className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white/70 p-5 opacity-75 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                    <Lock className="h-3 w-3" />
                    Inactivo
                  </div>
                </div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200">{agent.name}</h4>
                <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {agent.description}
                </p>
                <button
                  disabled
                  className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800/70"
                >
                  Próximamente
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default TemplateGallery;
