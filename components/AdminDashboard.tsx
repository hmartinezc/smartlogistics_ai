
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BrainCircuit, FileText, TrendingUp, Users, Shield, Package, Mail, Eye, X, CheckCircle, Calendar, ChevronDown, ChevronLeft, ChevronRight } from './Icons';
import { Agency, SubscriptionPlan, BatchItem } from '../types';

interface AdminDashboardProps {
  results: BatchItem[];
  agencies: Agency[];
  plans: SubscriptionPlan[];
}

const getCurrentMonthValue = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
};

const getBatchItemMonth = (item: BatchItem): string | null => {
    const dateValue = item.processedAt || item.createdAt;
    const match = dateValue?.match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : null;
};

const isFinishedProcessing = (item: BatchItem) => item.status === 'SUCCESS' || item.status === 'ERROR';

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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ results, agencies, plans }) => {
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
    const monthInputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

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

    const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
        const usage = new Map<string, number>();

        results.forEach((item) => {
            if (!item.agencyId || !isFinishedProcessing(item) || getBatchItemMonth(item) !== selectedMonth) {
                return;
            }

            usage.set(item.agencyId, (usage.get(item.agencyId) || 0) + 1);
        });

        return usage;
    }, [results, selectedMonth]);

    const totalProcessedForMonth = useMemo(
        () => Array.from(monthlyUsageByAgency.values()).reduce((total, agencyUsage) => total + agencyUsage, 0),
        [monthlyUsageByAgency]
    );

  const getPlan = (planId: string) => plans.find(p => p.id === planId);
    const getMonthlyUsage = (agencyId: string) => monthlyUsageByAgency.get(agencyId) || 0;

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
        planName: plan.name
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
      <div className="mb-10 flex justify-between items-end">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold mb-4">
                <Shield className="w-3 h-3" />
                Portal de Administración
            </div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Facturación y Agencias</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
                Gestión de límites, suscripciones y costos por agencia.
            </p>
          </div>
          <div className="text-right">
                 <div className="text-4xl font-bold text-indigo-600">{totalProcessedForMonth}</div>
                 <div className="text-xs text-slate-400 uppercase font-bold">Procesamientos {selectedMonthLabel}</div>
          </div>
      </div>

      {/* Plans Reference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
         {plans.map(plan => (
            <div key={plan.id} className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800 dark:text-white text-lg">{plan.name}</h3>
                    <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded text-xs">${plan.baseCost}</span>
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
                            <span className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">Periodo</span>
                            <span className="mt-0.5 truncate text-sm font-semibold capitalize text-slate-800 dark:text-white">{selectedMonthLabel}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">Mes</span>
                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isPickerOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-indigo-500'}`} />
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
                                <span className="text-base font-bold text-slate-800 dark:text-white">{pickerYear}</span>
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
                                                ${isSelected
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
                     <th className="px-6 py-4 text-right bg-slate-50/50">Facturación Estimada</th>
                     <th className="px-6 py-4 text-center bg-slate-50/50">Acciones</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {agencies.map(agency => {
                      const usageCount = getMonthlyUsage(agency.id);
                      const details = calculateInvoiceDetails(agency, usageCount);
                      const isOver = usageCount > details.limit;
                      const percent = details.limit > 0 ? (usageCount / details.limit) * 100 : 0;
                      
                      return (
                        <tr key={agency.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                           <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                              {agency.name}
                              <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {agency.id}</div>
                           </td>
                           <td className="px-6 py-4">
                              <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                                 {details.planName}
                              </span>
                           </td>
                           <td className="px-6 py-4">
                               <div className="flex flex-col gap-1 max-w-[140px]">
                                   <div className="flex justify-between text-xs font-medium">
                                       <span className="text-slate-600 dark:text-slate-300">{usageCount}</span>
                                       <span className="text-slate-400">/ {details.limit}</span>
                                   </div>
                                   <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                       <div className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(percent, 100)}%`}}></div>
                                   </div>
                               </div>
                           </td>
                           <td className="px-6 py-4 text-center">
                              {isOver ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded border border-red-100">
                                      Excedido (+{details.extraPages})
                                  </span>
                              ) : (
                                  <span className="inline-flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded border border-green-100">
                                      Dentro del Límite
                                  </span>
                              )}
                           </td>
                           <td className="px-6 py-4 text-right bg-slate-50/30">
                              <div className="text-lg font-bold text-slate-800 dark:text-white">
                                 ${details.total.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                 {isOver ? 'Incluye recargos' : 'Tarifa Base'}
                              </div>
                           </td>
                           <td className="px-6 py-4 bg-slate-50/30">
                              <div className="flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => setInvoicePreview(agency)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
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
                                        className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
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

      {/* INVOICE PREVIEW MODAL */}
      {invoicePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
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
                          <p className="text-indigo-200 text-sm font-mono">#{Date.now().toString().slice(-6)}</p>
                          <p className="text-indigo-200 text-sm">{new Date().toLocaleDateString()}</p>
                      </div>
                  </div>

                  {/* Body */}
                  <div className="p-8">
                      <div className="mb-8 flex justify-between">
                          <div>
                              <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Facturar A:</h3>
                              <p className="font-bold text-slate-800 text-lg">{invoicePreview.name}</p>
                              {invoicePreview.emails.map(e => (
                                  <p key={e} className="text-sm text-slate-500">{e}</p>
                              ))}
                          </div>
                          <div className="text-right">
                              <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Periodo:</h3>
                              <p className="font-medium text-slate-700 capitalize">{selectedMonthLabel}</p>
                          </div>
                      </div>

                      {(() => {
                          const details = calculateInvoiceDetails(invoicePreview, getMonthlyUsage(invoicePreview.id));
                          return (
                              <>
                                <table className="w-full mb-8">
                                    <thead className="border-b border-slate-200">
                                        <tr>
                                            <th className="text-left py-2 text-sm font-bold text-slate-600">Descripción</th>
                                            <th className="text-center py-2 text-sm font-bold text-slate-600">Cantidad</th>
                                            <th className="text-right py-2 text-sm font-bold text-slate-600">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        <tr className="border-b border-slate-100">
                                            <td className="py-4 text-slate-700">
                                                <span className="font-bold block">{details.planName} Plan Base</span>
                                                <span className="text-xs text-slate-400">Suscripción mensual recurrente</span>
                                            </td>
                                            <td className="py-4 text-center text-slate-600">1</td>
                                            <td className="py-4 text-right font-medium text-slate-800">${details.base.toFixed(2)}</td>
                                        </tr>
                                        {details.extraPages > 0 && (
                                            <tr className="border-b border-slate-100 bg-amber-50/30">
                                                <td className="py-4 text-slate-700">
                                                    <span className="font-bold block text-amber-700">Procesamientos Adicionales (Excedente)</span>
                                                    <span className="text-xs text-amber-600">Superado el límite de {details.limit} procesamientos</span>
                                                </td>
                                                <td className="py-4 text-center text-slate-600">{details.extraPages}</td>
                                                <td className="py-4 text-right font-medium text-amber-700">${details.extra.toFixed(2)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                <div className="flex justify-end border-t border-slate-200 pt-4">
                                    <div className="w-1/2">
                                        <div className="flex justify-between mb-2 text-slate-500">
                                            <span>Subtotal</span>
                                            <span>${details.total.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between mb-2 text-slate-500">
                                            <span>Impuestos (0%)</span>
                                            <span>$0.00</span>
                                        </div>
                                        <div className="flex justify-between text-xl font-bold text-slate-800 border-t border-slate-200 pt-2 mt-2">
                                            <span>Total a Pagar</span>
                                            <span>${details.total.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                              </>
                          )
                      })()}
                  </div>

                  {/* Footer Actions */}
                  <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center">
                      <button 
                        onClick={() => setInvoicePreview(null)}
                        className="text-slate-500 hover:text-slate-800 font-medium text-sm px-4"
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

    </div>
  );
};

export default AdminDashboard;
