import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BrainCircuit,
  Building,
  FileText,
  Globe,
  TrendingUp,
  Users,
  Shield,
  Package,
  Mail,
  Eye,
  X,
  CheckCircle,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from './Icons';
import {
  Agency,
  SubscriptionPlan,
  DocumentProcessingAuditEntry,
  GeminiExtractionEvent,
  GeminiExtractionEventListResponse,
} from '../types';
import { api } from '../services/apiClient';
import PageHeader from './PageHeader';

interface AdminDashboardProps {
  agencies: Agency[];
  plans: SubscriptionPlan[];
}

interface MonthlyUsageStats {
  total: number;
  success: number;
  error: number;
}

interface DailyUsageStats extends MonthlyUsageStats {
  date: string;
}

type DailyDetailTab = 'daily' | 'planSplit';
type GeminiSuccessFilter = 'all' | 'success' | 'error';

const PLAN_USAGE_SPLITS = [25, 50, 75, 100];
const DEFAULT_GEMINI_STAGE_FILTERS = ['classifier', 'extractor'];
const GEMINI_STAGE_FILTER_OPTIONS = [
  'classifier',
  'classifier-medium',
  'extractor',
  'files-upload',
  'files-active',
  'files-delete',
];
const GEMINI_SUCCESS_FILTER_OPTIONS: Array<{
  description: string;
  label: string;
  value: GeminiSuccessFilter;
}> = [
  { description: 'Eventos correctos y fallidos', label: 'Todos', value: 'all' },
  { description: 'Solo eventos OK', label: 'Correctos', value: 'success' },
  { description: 'Solo eventos con error', label: 'Errores', value: 'error' },
];

const getCurrentMonthValue = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
};

const getDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultObservabilityFrom = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getDateInputValue(date);
};

const formatDateTimeLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-EC', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
};

const formatDuration = (value?: number) => {
  if (!value) {
    return '0 ms';
  }

  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
};

const formatUsd = (value?: number) => {
  const amount = value || 0;
  return amount < 0.01 ? `$${amount.toFixed(6)}` : `$${amount.toFixed(4)}`;
};

const formatGeminiStageLabel = (stage?: string) => {
  if (!stage) {
    return 'sin-etapa';
  }

  if (stage.startsWith('classifier')) {
    return 'classifier';
  }

  if (stage.startsWith('extractor')) {
    return 'extractor';
  }

  if (stage.startsWith('files-')) {
    return 'files';
  }

  return stage;
};

const emptyGeminiObservability: GeminiExtractionEventListResponse = {
  events: [],
  limit: 50,
  offset: 0,
  summary: {
    averageDurationMs: 0,
    byCategory: [],
    byModel: [],
    byStage: [],
    estimatedCostUsd: 0,
    error: 0,
    inputTokens: 0,
    outputTokens: 0,
    success: 0,
    total: 0,
    totalTokens: 0,
  },
  total: 0,
};

const getAuditMonth = (entry: DocumentProcessingAuditEntry): string | null => {
  const dateValue = entry.processedDate || entry.processedAt;
  const match = dateValue?.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
};

const formatMonthLabel = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) {
    return monthValue;
  }

  return new Date(year, month - 1, 1).toLocaleDateString('es-EC', {
    month: 'long',
    year: 'numeric',
  });
};

const formatDayLabel = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) {
    return dateValue;
  }

  return new Date(year, month - 1, day).toLocaleDateString('es-EC', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ agencies, plans }) => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [auditEntries, setAuditEntries] = useState<DocumentProcessingAuditEntry[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [geminiObservability, setGeminiObservability] =
    useState<GeminiExtractionEventListResponse>(emptyGeminiObservability);
  const [isGeminiObservabilityLoading, setIsGeminiObservabilityLoading] = useState(false);
  const [geminiObservabilityError, setGeminiObservabilityError] = useState<string | null>(null);
  const [geminiFrom, setGeminiFrom] = useState(getDefaultObservabilityFrom);
  const [geminiTo, setGeminiTo] = useState(() => getDateInputValue(new Date()));
  const [geminiStageFilters, setGeminiStageFilters] = useState<string[]>(
    DEFAULT_GEMINI_STAGE_FILTERS,
  );
  const [geminiSuccessFilter, setGeminiSuccessFilter] = useState<GeminiSuccessFilter>('all');
  const [geminiAgencyFilter, setGeminiAgencyFilter] = useState('GLOBAL');
  const [isGeminiAgencyMenuOpen, setIsGeminiAgencyMenuOpen] = useState(false);
  const [isGeminiStatusMenuOpen, setIsGeminiStatusMenuOpen] = useState(false);
  const [geminiOffset, setGeminiOffset] = useState(0);
  const [selectedGeminiEvent, setSelectedGeminiEvent] = useState<GeminiExtractionEvent | null>(
    null,
  );
  const [dailyBreakdownAgency, setDailyBreakdownAgency] = useState<Agency | null>(null);
  const [dailyDetailTab, setDailyDetailTab] = useState<DailyDetailTab>('daily');
  const monthInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const geminiAgencyMenuRef = useRef<HTMLDivElement>(null);
  const geminiStatusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isGeminiAgencyMenuOpen && !isGeminiStatusMenuOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (geminiAgencyMenuRef.current && !geminiAgencyMenuRef.current.contains(target)) {
        setIsGeminiAgencyMenuOpen(false);
      }
      if (geminiStatusMenuRef.current && !geminiStatusMenuRef.current.contains(target)) {
        setIsGeminiStatusMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isGeminiAgencyMenuOpen, isGeminiStatusMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    setIsAuditLoading(true);
    setAuditError(null);
    setAuditEntries([]);

    api
      .getDocumentProcessingAudit({ month: selectedMonth })
      .then((entries) => {
        if (!cancelled) {
          setAuditEntries(entries);
        }
      })
      .catch((err) => {
        console.error('Error cargando auditoría de procesamientos:', err);
        if (!cancelled) {
          setAuditEntries([]);
          setAuditError('No se pudo cargar la auditoría del periodo seleccionado.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAuditLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    setIsGeminiObservabilityLoading(true);
    setGeminiObservabilityError(null);

    api
      .getGeminiExtractionEvents({
        agencyId: geminiAgencyFilter === 'GLOBAL' ? undefined : geminiAgencyFilter,
        from: geminiFrom,
        limit: 50,
        offset: geminiOffset,
        stage: geminiStageFilters.length > 0 ? geminiStageFilters.join(',') : undefined,
        success: geminiSuccessFilter === 'all' ? undefined : geminiSuccessFilter === 'success',
        to: geminiTo,
      })
      .then((response) => {
        if (!cancelled) {
          setGeminiObservability(response);
        }
      })
      .catch((err) => {
        console.error('Error cargando observabilidad Gemini:', err);
        if (!cancelled) {
          setGeminiObservability(emptyGeminiObservability);
          setGeminiObservabilityError('No se pudo cargar la observabilidad Gemini.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGeminiObservabilityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    geminiAgencyFilter,
    geminiFrom,
    geminiOffset,
    geminiStageFilters,
    geminiSuccessFilter,
    geminiTo,
  ]);

  useEffect(() => {
    setGeminiOffset(0);
  }, [geminiAgencyFilter, geminiFrom, geminiStageFilters, geminiSuccessFilter, geminiTo]);

  const MONTHS_SHORT = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];

  const handleMonthSelect = (monthIndex: number) => {
    const m = String(monthIndex + 1).padStart(2, '0');
    setSelectedMonth(`${pickerYear}-${m}`);
    setIsPickerOpen(false);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    setPickerYear(now.getFullYear());
    setSelectedMonth(getCurrentMonthValue());
    setIsPickerOpen(false);
  };
  const [invoicePreview, setInvoicePreview] = useState<Agency | null>(null);
  const [sentSuccessId, setSentSuccessId] = useState<string | null>(null);

  const selectedMonthLabel = formatMonthLabel(selectedMonth);
  const monthlyUsageByAgency = useMemo(() => {
    const usage = new Map<string, MonthlyUsageStats>();

    auditEntries.forEach((entry) => {
      if (!entry.agencyId || getAuditMonth(entry) !== selectedMonth) {
        return;
      }

      const current = usage.get(entry.agencyId) || { total: 0, success: 0, error: 0 };
      current.total += 1;
      if (entry.status === 'SUCCESS') {
        current.success += 1;
      } else {
        current.error += 1;
      }
      usage.set(entry.agencyId, current);
    });

    return usage;
  }, [auditEntries, selectedMonth]);

  const totalProcessedForMonth = useMemo(
    () =>
      Array.from(monthlyUsageByAgency.values()).reduce(
        (total, agencyUsage) => total + agencyUsage.total,
        0,
      ),
    [monthlyUsageByAgency],
  );

  const dailyBreakdown = useMemo<DailyUsageStats[]>(() => {
    if (!dailyBreakdownAgency) {
      return [];
    }

    const days = new Map<string, DailyUsageStats>();
    auditEntries.forEach((entry) => {
      if (entry.agencyId !== dailyBreakdownAgency.id || getAuditMonth(entry) !== selectedMonth) {
        return;
      }

      const date = entry.processedDate || entry.processedAt.slice(0, 10);
      const current = days.get(date) || { date, total: 0, success: 0, error: 0 };
      current.total += 1;
      if (entry.status === 'SUCCESS') {
        current.success += 1;
      } else {
        current.error += 1;
      }
      days.set(date, current);
    });

    return Array.from(days.values()).sort((left, right) => left.date.localeCompare(right.date));
  }, [auditEntries, dailyBreakdownAgency, selectedMonth]);

  const dailyBreakdownTotals = useMemo(
    () =>
      dailyBreakdown.reduce<MonthlyUsageStats>(
        (totals, day) => ({
          total: totals.total + day.total,
          success: totals.success + day.success,
          error: totals.error + day.error,
        }),
        { total: 0, success: 0, error: 0 },
      ),
    [dailyBreakdown],
  );

  const planSplitBreakdown = useMemo(() => {
    if (!dailyBreakdownAgency) {
      return [];
    }

    const plan = plans.find((candidate) => candidate.id === dailyBreakdownAgency.planId);
    if (!plan) {
      return [];
    }

    return PLAN_USAGE_SPLITS.map((split) => {
      const splitLimit = Math.round((plan.limit * split) / 100);
      const used = dailyBreakdownTotals.total;
      const overage = Math.max(used - splitLimit, 0);
      const remaining = Math.max(splitLimit - used, 0);

      return {
        split,
        limit: splitLimit,
        used,
        overage,
        remaining,
        isOver: overage > 0,
        percent: splitLimit > 0 ? (used / splitLimit) * 100 : 0,
        planName: plan.name,
        planLimit: plan.limit,
      };
    });
  }, [dailyBreakdownAgency, dailyBreakdownTotals.total, plans]);

  const getPlan = (planId: string) => plans.find((p) => p.id === planId);
  const getMonthlyUsage = (agencyId: string) =>
    monthlyUsageByAgency.get(agencyId) || { total: 0, success: 0, error: 0 };
  const getAgencyName = (agencyId?: string) =>
    agencies.find((agency) => agency.id === agencyId)?.name || agencyId || 'Sin agencia';
  const geminiAgencyFilterLabel =
    geminiAgencyFilter === 'GLOBAL' ? 'Todas las agencias' : getAgencyName(geminiAgencyFilter);
  const geminiSuccessFilterLabel =
    GEMINI_SUCCESS_FILTER_OPTIONS.find((option) => option.value === geminiSuccessFilter)?.label ||
    'Todos';

  const geminiStageOptions = useMemo(() => {
    const summaryStages = geminiObservability.summary.byStage
      .map((item) => item.stage)
      .filter((stage) => stage && stage !== 'sin-etapa');
    return Array.from(new Set([...GEMINI_STAGE_FILTER_OPTIONS, ...summaryStages]));
  }, [geminiObservability.summary.byStage]);

  const toggleGeminiStageFilter = (stage: string) => {
    setGeminiStageFilters((current) =>
      current.includes(stage)
        ? current.filter((selectedStage) => selectedStage !== stage)
        : [...current, stage],
    );
  };

  const geminiTotalPages = Math.max(
    1,
    Math.ceil(geminiObservability.total / geminiObservability.limit),
  );
  const geminiCurrentPage = Math.floor(geminiObservability.offset / geminiObservability.limit) + 1;

  const calculateInvoiceDetails = (agency: Agency, usageCount: number) => {
    const plan = getPlan(agency.planId);
    if (!plan) return { base: 0, extra: 0, total: 0, limit: 0, extraPages: 0 };

    let extraCost = 0;
    let extraPages = 0;
    if (usageCount > plan.limit) {
      extraPages = usageCount - plan.limit;
      extraCost = extraPages * plan.extraPageCost;
    }

    return {
      base: plan.baseCost,
      extra: extraCost,
      total: plan.baseCost + extraCost,
      limit: plan.limit,
      extraPages: extraPages,
      planName: plan.name,
    };
  };

  const handleSendInvoice = (agency: Agency) => {
    // Simulate API call to send email
    setSentSuccessId(agency.id);
    setTimeout(() => setSentSuccessId(null), 3000);
    setInvoicePreview(null); // Close modal if open
    alert(`Factura enviada a: ${agency.emails.join(', ')}`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <PageHeader
        icon={<Shield className="h-3.5 w-3.5" />}
        badge="Portal de Administración"
        title="Facturación y Agencias"
        subtitle="Gestión de límites, suscripciones y costos por agencia."
      >
        <div className="text-right">
          <div className="text-4xl font-bold text-indigo-600">
            {isAuditLoading ? '...' : totalProcessedForMonth}
          </div>
          <div className="text-xs text-slate-400 uppercase font-bold">
            Procesamientos {selectedMonthLabel}
          </div>
        </div>
      </PageHeader>

      {auditError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
          {auditError}
        </div>
      )}

      {/* Plans Reference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-slate-800 dark:text-white text-lg">{plan.name}</h3>
              <span className="text-indigo-600 dark:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-500/15 px-2 py-1 rounded text-xs">
                ${plan.baseCost}
              </span>
            </div>
            <div className="text-sm text-slate-500 mb-4">
              Hasta <b>{plan.limit.toLocaleString()}</b> documentos
            </div>
            <div className="text-xs text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-700">
              Excedente: <b>${plan.extraPageCost}</b> / procesamiento
            </div>
          </div>
        ))}
      </div>

      {/* Agency Management Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Estado de Cuentas por Agencia
          </h3>
          <div ref={pickerRef} className="relative w-full md:w-64">
            {/* Trigger button */}
            <button
              type="button"
              onClick={() => {
                if (!isPickerOpen) {
                  const [y] = selectedMonth.split('-').map(Number);
                  setPickerYear(y || new Date().getFullYear());
                }
                setIsPickerOpen((v) => !v);
              }}
              className="group flex h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-3 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md active:scale-[0.98] dark:border-slate-700 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 dark:hover:border-indigo-500/60"
              aria-label="Seleccionar mes de consumo"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:group-hover:bg-indigo-500/30">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <span className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  Periodo
                </span>
                <span className="mt-0.5 truncate text-sm font-semibold capitalize text-slate-800 dark:text-white">
                  {selectedMonthLabel}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
                  Mes
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isPickerOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-indigo-500'}`}
                />
              </div>
            </button>

            {/* Custom month picker dropdown */}
            {isPickerOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/10">
                {/* Year navigation */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-base font-bold text-slate-800 dark:text-white">
                    {pickerYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-4 gap-1.5 p-3">
                  {MONTHS_SHORT.map((name, idx) => {
                    const val = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`;
                    const isSelected = val === selectedMonth;
                    const isCurrent = val === getCurrentMonthValue();
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleMonthSelect(idx)}
                        className={`relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-all active:scale-95
                                                ${
                                                  isSelected
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/50'
                                                    : isCurrent
                                                      ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20'
                                                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                                }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={goToCurrentMonth}
                    className="w-full rounded-lg bg-indigo-50 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                  >
                    Ir al mes actual
                  </button>
                </div>
              </div>
            )}
            <input
              ref={monthInputRef}
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthValue())}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-6 py-4">Agencia / Cliente</th>
                <th className="px-6 py-4">Plan Asignado</th>
                <th className="px-6 py-4">Consumo del Mes</th>
                <th className="px-6 py-4 text-center">Estado Límite</th>
                <th className="px-6 py-4 text-right bg-slate-50/50 dark:bg-slate-800/50">
                  Facturación Estimada
                </th>
                <th className="px-6 py-4 text-center bg-slate-50/50 dark:bg-slate-800/50">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {agencies.map((agency) => {
                const usageStats = getMonthlyUsage(agency.id);
                const details = calculateInvoiceDetails(agency, usageStats.total);
                const isOver = usageStats.total > details.limit;
                const percent = details.limit > 0 ? (usageStats.total / details.limit) * 100 : 0;

                return (
                  <tr key={agency.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                      {agency.name}
                      <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {agency.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-100 dark:border-indigo-800">
                        {details.planName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-[140px]">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-slate-600 dark:text-slate-300">
                            {usageStats.total}
                          </span>
                          <span className="text-slate-400">/ {details.limit}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          <span className="text-green-600">OK {usageStats.success}</span>
                          <span className="text-red-500">Error {usageStats.error}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isOver ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-bold bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-900/50">
                          Excedido (+{details.extraPages})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded border border-green-100 dark:border-green-900/50">
                          Dentro del Límite
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right bg-slate-50/30 dark:bg-slate-800/30">
                      <div className="text-lg font-bold text-slate-800 dark:text-white">
                        ${details.total.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isOver ? 'Incluye recargos' : 'Tarifa Base'}
                      </div>
                    </td>
                    <td className="px-6 py-4 bg-slate-50/30 dark:bg-slate-800/30">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setDailyDetailTab('daily');
                            setDailyBreakdownAgency(agency);
                          }}
                          className="p-2 text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-900/30 rounded-full transition-colors disabled:opacity-40"
                          title="Ver detalle diario"
                          disabled={isAuditLoading}
                        >
                          <BarChart3 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setInvoicePreview(agency)}
                          className="p-2 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-full transition-colors"
                          title="Visualizar Factura"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {sentSuccessId === agency.id ? (
                          <span className="p-2 text-green-600 animate-in fade-in zoom-in">
                            <CheckCircle className="w-5 h-5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSendInvoice(agency)}
                            className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full transition-colors"
                            title="Enviar Factura por Email"
                          >
                            <Mail className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gemini Observability */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-100 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                <BrainCircuit className="h-3.5 w-3.5" />
                Observabilidad IA
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Histórico Gemini, últimos 2 días
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Eventos por etapa del router, clasificador, extractor y Files API.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:max-w-[760px] xl:grid-cols-6">
              <input
                type="date"
                value={geminiFrom}
                onChange={(event) => setGeminiFrom(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                aria-label="Fecha desde observabilidad Gemini"
              />
              <input
                type="date"
                value={geminiTo}
                onChange={(event) => setGeminiTo(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                aria-label="Fecha hasta observabilidad Gemini"
              />
              <div className="relative md:col-span-2 xl:col-span-2" ref={geminiAgencyMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsGeminiAgencyMenuOpen((current) => !current);
                    setIsGeminiStatusMenuOpen(false);
                  }}
                  className={`group flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:bg-slate-950 ${
                    isGeminiAgencyMenuOpen
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isGeminiAgencyMenuOpen}
                  aria-label="Agencia observabilidad Gemini"
                  title={geminiAgencyFilterLabel}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {geminiAgencyFilter === 'GLOBAL' ? (
                      <Globe className="h-4 w-4" />
                    ) : (
                      <Building className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      Agencia
                    </p>
                    <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">
                      {geminiAgencyFilterLabel}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isGeminiAgencyMenuOpen
                        ? 'rotate-180 text-indigo-500'
                        : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'
                    }`}
                  />
                </button>

                {isGeminiAgencyMenuOpen && (
                  <div className="absolute left-0 z-50 mt-2 max-h-72 w-full min-w-[260px] overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/80 [scrollbar-color:theme(colors.slate.400)_transparent] [scrollbar-width:thin] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 dark:[scrollbar-color:theme(colors.slate.600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-track]:bg-transparent">
                    <button
                      type="button"
                      onClick={() => {
                        setGeminiAgencyFilter('GLOBAL');
                        setIsGeminiAgencyMenuOpen(false);
                      }}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-colors ${
                        geminiAgencyFilter === 'GLOBAL'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                      role="option"
                      aria-selected={geminiAgencyFilter === 'GLOBAL'}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-normal text-sm font-semibold leading-snug">
                          Todas las agencias
                        </p>
                      </div>
                    </button>

                    {agencies.map((agency) => {
                      const selected = geminiAgencyFilter === agency.id;

                      return (
                        <button
                          key={agency.id}
                          type="button"
                          onClick={() => {
                            setGeminiAgencyFilter(agency.id);
                            setIsGeminiAgencyMenuOpen(false);
                          }}
                          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                          role="option"
                          aria-selected={selected}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="whitespace-normal text-sm font-semibold leading-snug">
                              {agency.name}
                            </p>
                            <p
                              className={`text-xs ${
                                agency.isActive
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : 'text-rose-500 dark:text-rose-300'
                              }`}
                            >
                              {agency.isActive ? 'Agencia activa' : 'Agencia suspendida'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="relative xl:col-span-2" ref={geminiStatusMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsGeminiStatusMenuOpen((current) => !current);
                    setIsGeminiAgencyMenuOpen(false);
                  }}
                  className={`group flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:bg-slate-950 ${
                    isGeminiStatusMenuOpen
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isGeminiStatusMenuOpen}
                  aria-label="Estado observabilidad Gemini"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      Estado
                    </p>
                    <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">
                      {geminiSuccessFilterLabel}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isGeminiStatusMenuOpen
                        ? 'rotate-180 text-indigo-500'
                        : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'
                    }`}
                  />
                </button>

                {isGeminiStatusMenuOpen && (
                  <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                    {GEMINI_SUCCESS_FILTER_OPTIONS.map((option) => {
                      const selected = geminiSuccessFilter === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setGeminiSuccessFilter(option.value);
                            setIsGeminiStatusMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                          role="option"
                          aria-selected={selected}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              selected
                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{option.label}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {option.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="md:col-span-2 xl:col-span-6">
                <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                  {geminiStageOptions.map((stage) => {
                    const selected = geminiStageFilters.includes(stage);
                    return (
                      <button
                        key={stage}
                        type="button"
                        onClick={() => toggleGeminiStageFilter(stage)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setGeminiStageFilters([])}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    todas
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {geminiObservabilityError && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
            {geminiObservabilityError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-bold uppercase text-slate-400">Eventos</p>
            <p className="mt-1 text-2xl font-black text-slate-800 dark:text-white">
              {isGeminiObservabilityLoading
                ? '...'
                : geminiObservability.summary.total.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/20">
            <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
              Correctos
            </p>
            <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-200">
              {geminiObservability.summary.success.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-900/20">
            <p className="text-xs font-bold uppercase text-rose-600 dark:text-rose-300">Errores</p>
            <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-200">
              {geminiObservability.summary.error.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-900/20">
            <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-300">
              Tokens entrada / salida
            </p>
            <p className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-200">
              {geminiObservability.summary.inputTokens.toLocaleString()}
            </p>
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-300">
              out {geminiObservability.summary.outputTokens.toLocaleString()} · total{' '}
              {geminiObservability.summary.totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-900/20">
            <p className="text-xs font-bold uppercase text-sky-600 dark:text-sky-300">
              Costo total estimado
            </p>
            <p className="mt-1 text-2xl font-black text-sky-700 dark:text-sky-200">
              {formatUsd(geminiObservability.summary.estimatedCostUsd)}
            </p>
            <p className="text-xs font-semibold text-sky-500 dark:text-sky-300">
              total del filtro actual
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
              Eventos por etapa
            </h4>
            <div className="space-y-2">
              {geminiObservability.summary.byStage.slice(0, 6).map((item) => (
                <div key={item.stage} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                    {item.stage}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-white">
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
              {geminiObservability.summary.byStage.length === 0 && (
                <div className="text-sm font-medium text-slate-400">Sin eventos.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
              Categorías del router
            </h4>
            <div className="space-y-2">
              {geminiObservability.summary.byCategory.slice(0, 6).map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                    {item.category}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-white">
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
              {geminiObservability.summary.byCategory.length === 0 && (
                <div className="text-sm font-medium text-slate-400">Sin categorías.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
              Costo por modelo
            </h4>
            <div className="space-y-2">
              {geminiObservability.summary.byModel.map((item) => (
                <div key={item.model} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                      {item.model}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-white">
                      {formatUsd(item.estimatedCostUsd)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    in {item.inputTokens.toLocaleString()} · out{' '}
                    {item.outputTokens.toLocaleString()}
                  </div>
                </div>
              ))}
              {geminiObservability.summary.byModel.length === 0 && (
                <div className="text-sm font-medium text-slate-400">Sin modelos.</div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden border-t border-slate-100 dark:border-slate-700">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[14%]" />
              <col className="w-[5%]" />
              <col className="w-[4%]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Etapa</th>
                <th className="px-3 py-3">Modelo</th>
                <th className="px-3 py-3">Router</th>
                <th className="px-3 py-3 text-right">Tokens</th>
                <th className="px-3 py-3 text-right">Costo</th>
                <th className="px-3 py-3 text-right">Tiempo</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3 text-center">Estado</th>
                <th className="px-3 py-3 text-center">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {geminiObservability.events.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center font-medium text-slate-400">
                    {isGeminiObservabilityLoading ? 'Cargando eventos...' : 'Sin eventos Gemini.'}
                  </td>
                </tr>
              ) : (
                geminiObservability.events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                      {formatDateTimeLabel(event.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {formatGeminiStageLabel(event.stage)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                        {event.model}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">{event.promptHash}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                        {event.routerCategory || 'sin-categoria'}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400">
                        {event.routerConfidence !== undefined
                          ? `${Math.round(event.routerConfidence * 100)}% confianza`
                          : 'sin confianza'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="text-xs font-bold text-slate-800 dark:text-white">
                        <span>
                          <span className="mr-1 text-[10px] uppercase text-slate-400">In</span>
                          {event.inputTokenCount.toLocaleString()}
                        </span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span>
                          <span className="mr-1 text-[10px] uppercase text-slate-400">Out</span>
                          {event.outputTokenCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400">
                        total {(event.totalTokenCount || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-sky-700 dark:text-sky-300">
                      {formatUsd(event.estimatedCostUsd)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-700 dark:text-slate-200">
                      {formatDuration(event.durationMs)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                        {event.originalFileName || event.documentJobId || event.source}
                      </div>
                      <div className="truncate text-[10px] font-semibold text-slate-400">
                        {getAgencyName(event.agencyId)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${
                          event.success
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                        }`}
                      >
                        {event.success ? 'OK' : 'Error'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedGeminiEvent(event)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                        title="Ver detalle Gemini"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Mostrando {geminiObservability.events.length.toLocaleString()} de{' '}
            {geminiObservability.total.toLocaleString()} eventos
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={geminiOffset === 0 || isGeminiObservabilityLoading}
              onClick={() =>
                setGeminiOffset((value) => Math.max(0, value - geminiObservability.limit))
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-700"
              aria-label="Página anterior observabilidad Gemini"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[92px] text-center">
              {geminiCurrentPage} / {geminiTotalPages}
            </span>
            <button
              type="button"
              disabled={
                geminiOffset + geminiObservability.limit >= geminiObservability.total ||
                isGeminiObservabilityLoading
              }
              onClick={() => setGeminiOffset((value) => value + geminiObservability.limit)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-700"
              aria-label="Página siguiente observabilidad Gemini"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* INVOICE PREVIEW MODAL */}
      {invoicePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Invoice Header */}
            <div className="bg-indigo-600 p-6 text-white flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-6 h-6" />
                  <span className="font-bold text-lg tracking-wide">SMART LOGISTICS</span>
                </div>
                <p className="text-indigo-200 text-sm">Automated Billing System</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold">INVOICE</h2>
                <p className="text-indigo-200 text-sm font-mono">
                  #{Date.now().toString().slice(-6)}
                </p>
                <p className="text-indigo-200 text-sm">{new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-8">
              <div className="mb-8 flex justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Facturar A:</h3>
                  <p className="font-bold text-slate-800 text-lg">{invoicePreview.name}</p>
                  {invoicePreview.emails.map((e) => (
                    <p key={e} className="text-sm text-slate-500">
                      {e}
                    </p>
                  ))}
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Periodo:</h3>
                  <p className="font-medium text-slate-700 capitalize">{selectedMonthLabel}</p>
                </div>
              </div>

              {(() => {
                const details = calculateInvoiceDetails(
                  invoicePreview,
                  getMonthlyUsage(invoicePreview.id).total,
                );
                return (
                  <>
                    <table className="w-full mb-8">
                      <thead className="border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left py-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                            Descripción
                          </th>
                          <th className="text-center py-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                            Cantidad
                          </th>
                          <th className="text-right py-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="py-4 text-slate-700 dark:text-slate-200">
                            <span className="font-bold block">{details.planName} Plan Base</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              Suscripción mensual recurrente
                            </span>
                          </td>
                          <td className="py-4 text-center text-slate-600 dark:text-slate-300">1</td>
                          <td className="py-4 text-right font-medium text-slate-800 dark:text-white">
                            ${details.base.toFixed(2)}
                          </td>
                        </tr>
                        {details.extraPages > 0 && (
                          <tr className="border-b border-slate-100 dark:border-slate-700 bg-amber-50/30 dark:bg-amber-900/10">
                            <td className="py-4 text-slate-700 dark:text-slate-200">
                              <span className="font-bold block text-amber-700 dark:text-amber-400">
                                Procesamientos Adicionales (Excedente)
                              </span>
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                Superado el límite de {details.limit} procesamientos
                              </span>
                            </td>
                            <td className="py-4 text-center text-slate-600 dark:text-slate-300">
                              {details.extraPages}
                            </td>
                            <td className="py-4 text-right font-medium text-amber-700 dark:text-amber-400">
                              ${details.extra.toFixed(2)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div className="flex justify-end border-t border-slate-200 dark:border-slate-700 pt-4">
                      <div className="w-1/2">
                        <div className="flex justify-between mb-2 text-slate-500 dark:text-slate-400">
                          <span>Subtotal</span>
                          <span>${details.total.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between mb-2 text-slate-500 dark:text-slate-400">
                          <span>Impuestos (0%)</span>
                          <span>$0.00</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-slate-800 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                          <span>Total a Pagar</span>
                          <span>${details.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Footer Actions */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <button
                onClick={() => setInvoicePreview(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium text-sm px-4"
              >
                Cerrar Vista Previa
              </button>
              <button
                onClick={() => handleSendInvoice(invoicePreview)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Enviar Factura Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {dailyBreakdownAgency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-300 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Detalle diario
                </div>
                <h2 className="truncate text-xl font-bold text-slate-800 dark:text-white">
                  {dailyBreakdownAgency.name}
                </h2>
                <p className="mt-1 text-sm capitalize text-slate-500 dark:text-slate-400">
                  {selectedMonthLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDailyBreakdownAgency(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Cerrar detalle diario"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-5 flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setDailyDetailTab('daily')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                    dailyDetailTab === 'daily'
                      ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Detalle diario
                </button>
                <button
                  type="button"
                  onClick={() => setDailyDetailTab('planSplit')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                    dailyDetailTab === 'planSplit'
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Plan dividido
                </button>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-xs font-bold uppercase text-slate-400">Total</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                    {dailyBreakdownTotals.total}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                  <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
                    Correctos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-200">
                    {dailyBreakdownTotals.success}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-900/20">
                  <p className="text-xs font-bold uppercase text-rose-600 dark:text-rose-300">
                    Con error
                  </p>
                  <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-200">
                    {dailyBreakdownTotals.error}
                  </p>
                </div>
              </div>

              {dailyDetailTab === 'planSplit' ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/30">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-white">
                        Consumo del mes por sub-plan
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Mismo consumo mensual comparado contra 25%, 50%, 75% y 100% del plan activo.
                      </p>
                    </div>
                    {planSplitBreakdown[0] && (
                      <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {planSplitBreakdown[0].planName}:{' '}
                        {planSplitBreakdown[0].planLimit.toLocaleString()} docs
                      </div>
                    )}
                  </div>

                  {planSplitBreakdown.length === 0 ? (
                    <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-400 dark:bg-slate-800/60">
                      No se encontró el plan activo de esta agencia.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {planSplitBreakdown.map((item) => (
                        <div
                          key={item.split}
                          className={`rounded-xl border p-4 ${
                            item.isOver
                              ? 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20'
                              : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20'
                          }`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Corte {item.split}%
                              </p>
                              <p className="mt-1 text-2xl font-black text-slate-800 dark:text-white">
                                {item.limit.toLocaleString()}
                              </p>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                límite proporcional
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                item.isOver
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              }`}
                            >
                              {item.isOver ? 'Fuera' : 'Dentro'}
                            </span>
                          </div>

                          <div className="mb-3">
                            <div className="mb-1 flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                              <span>Consumo</span>
                              <span>{item.used.toLocaleString()}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white/70 dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full ${item.isOver ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(item.percent, 100)}%` }}
                              />
                            </div>
                          </div>

                          <div className="rounded-lg bg-white/70 p-3 text-xs font-semibold dark:bg-slate-800/70">
                            {item.isOver ? (
                              <div className="text-rose-700 dark:text-rose-300">
                                Excedente: {item.overage.toLocaleString()} docs por fuera
                              </div>
                            ) : (
                              <div className="text-emerald-700 dark:text-emerald-300">
                                Disponible: {item.remaining.toLocaleString()} docs restantes
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-[52vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3 text-center">Total</th>
                        <th className="px-4 py-3 text-center">Correctos</th>
                        <th className="px-4 py-3 text-center">Errores</th>
                        <th className="px-4 py-3">Actividad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {dailyBreakdown.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-10 text-center text-sm font-medium text-slate-400"
                          >
                            Sin procesamientos en este periodo.
                          </td>
                        </tr>
                      ) : (
                        dailyBreakdown.map((day) => {
                          const successPercent =
                            day.total > 0 ? (day.success / day.total) * 100 : 0;
                          const errorPercent = day.total > 0 ? (day.error / day.total) * 100 : 0;

                          return (
                            <tr
                              key={day.date}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            >
                              <td className="px-4 py-3 font-semibold capitalize text-slate-700 dark:text-slate-200">
                                {formatDayLabel(day.date)}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800 dark:text-white">
                                {day.total}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-emerald-600">
                                {day.success}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-rose-600">
                                {day.error}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                  <div
                                    className="bg-emerald-500"
                                    style={{ width: `${successPercent}%` }}
                                  />
                                  <div
                                    className="bg-rose-500"
                                    style={{ width: `${errorPercent}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGeminiEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-300 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Evento Gemini
                </div>
                <h2 className="truncate text-xl font-bold text-slate-800 dark:text-white">
                  {selectedGeminiEvent.stage || 'sin-etapa'} ·{' '}
                  {selectedGeminiEvent.success ? 'Correcto' : 'Error'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {formatDateTimeLabel(selectedGeminiEvent.timestamp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGeminiEvent(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Cerrar detalle Gemini"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[70vh] gap-4 overflow-auto p-6 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-bold uppercase text-slate-400">Modelo</p>
                <p className="mt-1 break-words text-sm font-bold text-slate-800 dark:text-white">
                  {selectedGeminiEvent.model}
                </p>
                <p className="mt-3 text-xs font-bold uppercase text-slate-400">SDK / cache</p>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {selectedGeminiEvent.sdk} / {selectedGeminiEvent.cacheMode}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-bold uppercase text-slate-400">Tokens</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-lg font-black text-slate-800 dark:text-white">
                  <span>In {selectedGeminiEvent.inputTokenCount.toLocaleString()}</span>
                  <span>Out {selectedGeminiEvent.outputTokenCount.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  total {(selectedGeminiEvent.totalTokenCount || 0).toLocaleString()} · thoughts{' '}
                  {selectedGeminiEvent.thoughtsTokenCount || 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-bold uppercase text-slate-400">Costo del evento</p>
                <p className="mt-1 text-2xl font-black text-sky-700 dark:text-sky-300">
                  {formatUsd(selectedGeminiEvent.estimatedCostUsd)}
                </p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                  {selectedGeminiEvent.originalFileName || selectedGeminiEvent.source}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 lg:col-span-3">
                <p className="text-xs font-bold uppercase text-slate-400">Contexto</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-800 dark:text-white">
                  {selectedGeminiEvent.originalFileName || selectedGeminiEvent.source}
                </p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                  {getAgencyName(selectedGeminiEvent.agencyId)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 lg:col-span-3">
                <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-white">
                  Metadata del evento
                </h3>
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div>
                    <span className="font-bold text-slate-500">Job:</span>{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {selectedGeminiEvent.documentJobId || 'n/a'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Batch:</span>{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {selectedGeminiEvent.batchId || 'n/a'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Usuario:</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">
                      {selectedGeminiEvent.userEmail || selectedGeminiEvent.userName || 'n/a'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Duración:</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">
                      {formatDuration(selectedGeminiEvent.durationMs)}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Router:</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">
                      {selectedGeminiEvent.routerCategory || 'sin-categoria'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500">Confianza:</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">
                      {selectedGeminiEvent.routerConfidence !== undefined
                        ? `${Math.round(selectedGeminiEvent.routerConfidence * 100)}%`
                        : 'n/a'}
                    </span>
                  </div>
                </div>

                {selectedGeminiEvent.routerVisualSignals &&
                  selectedGeminiEvent.routerVisualSignals.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase text-slate-400">
                        Señales visuales router
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedGeminiEvent.routerVisualSignals.map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {selectedGeminiEvent.error && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                    {selectedGeminiEvent.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdminDashboard);
