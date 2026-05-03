import React, { useMemo, useState } from 'react';
import { CheckCircle, AlertCircle, Plane, Package, History, FileWarning, Globe } from './Icons';
import { BatchItem, Agency, SubscriptionPlan } from '../types';
import {
  buildAwbReconciliationRows,
  buildInvoicedAwbRecords,
  getMockBookedAwbs,
  getOperationDateKey,
} from '../services/operationalService';

interface DashboardHomeProps {
  results: BatchItem[];
  currentAgencyId: string; // 'GLOBAL' or specific ID
  currentAgency?: Agency; // Undefined if GLOBAL
  currentPlan?: SubscriptionPlan;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({
  results,
  currentAgencyId,
  currentAgency,
  currentPlan,
}) => {
  const [operationDate, setOperationDate] = useState<string>(getOperationDateKey());

  // Filter results based on selected context and operation date
  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const matchesAgency =
        currentAgencyId === 'GLOBAL' ? true : result.agencyId === currentAgencyId;
      const matchesDate = getOperationDateKey(result.processedAt) === operationDate;
      return matchesAgency && matchesDate;
    });
  }, [operationDate, results, currentAgencyId]);

  const invoicedAwbs = useMemo(
    () =>
      buildInvoicedAwbRecords(results, {
        agencyId: currentAgencyId,
        operationDate,
      }),
    [currentAgencyId, operationDate, results],
  );

  const bookedAwbs = useMemo(
    () =>
      getMockBookedAwbs(
        {
          agencyId: currentAgencyId,
          operationDate,
        },
        invoicedAwbs,
      ),
    [currentAgencyId, invoicedAwbs, operationDate],
  );

  const awbSummary = useMemo(
    () => buildAwbReconciliationRows(bookedAwbs, invoicedAwbs),
    [bookedAwbs, invoicedAwbs],
  );

  // Subscription Logic Calculation
  // If Global, we show aggregate or hide this specific widget? Let's hide specific usage for Global view.
  const usagePercent =
    currentAgency && currentPlan ? (currentAgency.currentUsage / currentPlan.limit) * 100 : 0;
  const isOverLimit =
    currentAgency && currentPlan ? currentAgency.currentUsage > currentPlan.limit : false;

  // Incident Logic: Status Error OR Low Confidence (<75)
  const incidentsCount = awbSummary.filter((row) => row.status !== 'MATCHED').length;

  const pendingDocumentsCount = awbSummary.filter(
    (row) => row.status === 'PENDING_DOCUMENTS',
  ).length;

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Panel Operativo</h1>
            {currentAgencyId === 'GLOBAL' && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200">
                VISTA GLOBAL
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {currentAgencyId === 'GLOBAL'
              ? 'Visualizando consolidado de todas las agencias del sistema.'
              : `Conciliación y métricas para: ${currentAgency?.name || 'Agencia Seleccionada'}`}
          </p>
        </div>
        <div className="w-full md:w-auto bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            Fecha Operativa
          </label>
          <input
            type="date"
            value={operationDate}
            onChange={(event) => setOperationDate(event.target.value)}
            className="w-full md:w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <p className="mt-2 text-[11px] text-slate-400">
            Contrato mock listo para API futura: agencyId + operationDate.
          </p>
        </div>

        {/* Subscription Usage Widget (Hide if Global) */}
        {currentAgencyId !== 'GLOBAL' && currentAgency && currentPlan && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-full md:w-80">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Consumo Mensual</span>
              <span
                className={`text-xs font-bold ${isOverLimit ? 'text-red-500' : 'text-indigo-600'}`}
              >
                {currentAgency.currentUsage} / {currentPlan.limit} págs
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-1000 ${isOverLimit ? 'bg-red-500' : 'bg-indigo-600'}`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              ></div>
            </div>
            {isOverLimit && (
              <div className="mt-1 text-[10px] text-red-500 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Excedente aplicado:{' '}
                {currentAgency.currentUsage - currentPlan.limit} págs extra
              </div>
            )}
          </div>
        )}

        {/* Global Badge Info */}
        {currentAgencyId === 'GLOBAL' && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">
                Modo Administrador
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                Datos agregados de {awbSummary.length} Masters
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total AWB (Contexto)</p>
            <h3 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
              {awbSummary.length}
            </h3>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <Plane className="w-4 h-4" /> AWB del día
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Páginas Procesadas</p>
            <h3 className="text-4xl font-bold text-slate-800 dark:text-white">
              {filteredResults.length}
            </h3>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <Package className="w-4 h-4" /> Documentos del día
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="relative">
            <p className="text-sm font-medium text-slate-500 mb-1">Documentos con Incidencias</p>
            <h3
              className={`text-4xl font-bold ${incidentsCount > 0 ? 'text-red-600' : 'text-slate-800 dark:text-white'}`}
            >
              {incidentsCount}
            </h3>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 relative">
            <FileWarning
              className={`w-4 h-4 ${incidentsCount > 0 ? 'text-red-500' : 'text-slate-300'}`}
            />
            {incidentsCount > 0 ? 'Requieren revisión manual' : 'Sin errores detectados'}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Estado Operativo
          </p>
          <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-white">
            {pendingDocumentsCount}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            AWB booked sin documentos facturados o conciliación incompleta en la fecha seleccionada.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Origen Datos Reserva
          </p>
          <div className="mt-2 text-2xl font-bold text-indigo-600">MOCK API</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Hoy las reservas salen de un proveedor mock determinístico; luego aquí entra el endpoint
            real.
          </p>
        </div>
      </div>

      {/* Main Comparison Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden mb-8">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Plane className="w-5 h-5 text-indigo-500" />
            Consolidado por Master AWB
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              {/* SUPER HEADER */}
              <tr className="text-xs text-slate-500 uppercase bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <th
                  rowSpan={2}
                  className="px-6 py-4 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky left-0 z-10 w-48"
                >
                  Master AWB
                </th>

                {/* RESERVA GROUP */}
                <th
                  colSpan={3}
                  className="px-6 py-2 text-center border-r border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 font-bold tracking-wider"
                >
                  Reserva (Booked)
                </th>

                {/* FACTURA GROUP */}
                <th
                  colSpan={3}
                  className="px-6 py-2 text-center border-r border-slate-200 dark:border-slate-700 bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-700 font-bold tracking-wider"
                >
                  Facturado (Invoiced)
                </th>

                <th rowSpan={2} className="px-6 py-4 text-center bg-white dark:bg-slate-800">
                  Status
                </th>
              </tr>

              {/* SUB HEADER */}
              <tr className="text-[10px] text-slate-500 uppercase bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {/* Reserva Columns */}
                <th className="px-4 py-2 text-right bg-slate-50/50 border-r border-slate-100">
                  Hijas
                </th>
                <th className="px-4 py-2 text-right bg-slate-50/50 border-r border-slate-100">
                  Pcs
                </th>
                <th className="px-4 py-2 text-right bg-slate-50/50 border-r border-slate-200">
                  EQ Full
                </th>

                {/* Factura Columns */}
                <th className="px-4 py-2 text-right bg-indigo-50/10 border-r border-slate-100">
                  Hijas
                </th>
                <th className="px-4 py-2 text-right bg-indigo-50/10 border-r border-slate-100">
                  Pcs
                </th>
                <th className="px-4 py-2 text-right bg-indigo-50/10 border-r border-slate-200">
                  EQ Full
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {awbSummary.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="w-8 h-8 opacity-20" />
                      <span>Esperando procesamiento de documentos...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                awbSummary.map((awb) => {
                  const hasDiff =
                    awb.status === 'DISCREPANCY' ||
                    awb.status === 'PARTIAL' ||
                    awb.status === 'PENDING_DOCUMENTS';
                  const diffHijas = awb.bookedHijas !== awb.invoicedHijas;
                  const diffPieces = awb.bookedPieces !== awb.invoicedPieces;
                  const diffFulls = Math.abs(awb.bookedFulls - awb.invoicedFulls) > 0.1;

                  return (
                    <tr
                      key={awb.mawb}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 group"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm border-r border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 sticky left-0 group-hover:bg-slate-50 dark:group-hover:bg-slate-700/50">
                        {awb.mawb}
                      </td>

                      {/* RESERVA DATA */}
                      <td
                        className={`px-4 py-4 text-right text-slate-500 text-sm border-r border-slate-100 ${diffHijas ? 'text-amber-600 font-bold bg-amber-50/30' : ''}`}
                      >
                        {awb.bookedHijas}
                      </td>
                      <td
                        className={`px-4 py-4 text-right text-slate-500 text-sm border-r border-slate-100 ${diffPieces ? 'text-amber-600 font-bold bg-amber-50/30' : ''}`}
                      >
                        {awb.bookedPieces}
                      </td>
                      <td
                        className={`px-4 py-4 text-right text-slate-500 text-sm border-r border-slate-200 ${diffFulls ? 'text-amber-600 font-bold bg-amber-50/30' : ''}`}
                      >
                        {awb.bookedFulls.toFixed(2)}
                      </td>

                      {/* FACTURA DATA */}
                      <td className="px-4 py-4 text-right font-medium text-slate-700 dark:text-slate-300 text-sm border-r border-slate-100 bg-indigo-50/5">
                        {awb.invoicedHijas}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-700 dark:text-slate-300 text-sm border-r border-slate-100 bg-indigo-50/5">
                        {awb.invoicedPieces}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-600 text-sm border-r border-slate-200 bg-indigo-50/5">
                        {awb.invoicedFulls.toFixed(2)}
                      </td>

                      {/* STATUS */}
                      <td className="px-6 py-4 text-center">
                        {awb.status === 'MATCHED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-600 text-xs font-bold border border-green-100">
                            <CheckCircle className="w-3 h-3" /> Cuadrado
                          </span>
                        ) : awb.status === 'PENDING_DOCUMENTS' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                            <FileWarning className="w-3 h-3" /> Pendiente Docs
                          </span>
                        ) : awb.status === 'PARTIAL' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                            <AlertCircle className="w-3 h-3" /> Parcial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-xs font-bold border border-red-100">
                            <AlertCircle className="w-3 h-3" /> Diferencia
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Log (Now at the bottom) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-[300px]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-white uppercase tracking-wide">
            Log de Operaciones ({currentAgencyId === 'GLOBAL' ? 'Global' : 'Agencia'})
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {filteredResults.length === 0 ? (
            <div className="text-slate-400 italic">Sin actividad reciente...</div>
          ) : (
            [...filteredResults].reverse().map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded transition-colors"
              >
                <span className="text-slate-400">
                  {item.processedAt ? new Date(item.processedAt).toLocaleTimeString() : '--:--'}
                </span>
                <span
                  className={`font-bold ${item.status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`}
                >
                  [{item.status}]
                </span>
                <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                  {item.fileName}
                </span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase">
                  {item.user || 'Unknown'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(DashboardHome);
