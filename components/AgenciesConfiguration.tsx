import React, { useState } from 'react';
import { Agency, SubscriptionPlan } from '../types';
import { generateId } from '../utils/helpers';
import { Building, Save, Trash2, AlertCircle, ChevronDown, Pencil, X, Plus, Power } from './Icons';

interface AgenciesConfigurationProps {
  agencies: Agency[];
  plans: SubscriptionPlan[];
  onAddAgency: (agency: Agency) => Promise<string | null> | string | null;
  onUpdateAgency: (agency: Agency) => Promise<string | null> | string | null;
  onDeleteAgency: (id: string) => Promise<string | null>;
}

const AgenciesConfiguration: React.FC<AgenciesConfigurationProps> = ({
  agencies,
  plans,
  onAddAgency,
  onUpdateAgency,
  onDeleteAgency,
}) => {
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');

  // Email management states
  const [currentEmailInput, setCurrentEmailInput] = useState('');
  const [emailList, setEmailList] = useState<string[]>([]);

  const [isActive, setIsActive] = useState(true);

  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id || '');
  const [error, setError] = useState('');

  const resetForm = () => {
    setName('');
    setEmailList([]);
    setCurrentEmailInput('');
    setSelectedPlan(plans[0]?.id || '');
    setIsActive(true);
    setEditingId(null);
    setError('');
  };

  const handleEdit = (agency: Agency) => {
    setEditingId(agency.id);
    setName(agency.name);
    setEmailList([...agency.emails]); // Copy array
    setCurrentEmailInput('');
    setSelectedPlan(agency.planId);
    setIsActive(agency.isActive);
    setError('');
  };

  const handleAddEmail = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!currentEmailInput.trim() || !currentEmailInput.includes('@')) {
      setError('Formato de email inválido');
      return;
    }
    if (emailList.includes(currentEmailInput.trim())) {
      setError('Este email ya está en la lista');
      return;
    }
    setEmailList([...emailList, currentEmailInput.trim()]);
    setCurrentEmailInput('');
    setError('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmailList(emailList.filter((e) => e !== emailToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre de la agencia es requerido');
      return;
    }
    if (emailList.length === 0) {
      setError('Debe agregar al menos un email de facturación');
      return;
    }

    if (editingId) {
      // UPDATE MODE
      const existingAgency = agencies.find((a) => a.id === editingId);
      if (existingAgency) {
        const submitError = await onUpdateAgency({
          ...existingAgency,
          name,
          emails: emailList,
          planId: selectedPlan,
          isActive: isActive,
        });

        if (submitError) {
          setError(submitError);
          return;
        }
      }
    } else {
      // CREATE MODE
      const newAgency: Agency = {
        id: generateId('AGENCY'),
        name: name,
        emails: emailList,
        planId: selectedPlan,
        currentUsage: 0,
        isActive: isActive,
      };
      const submitError = await onAddAgency(newAgency);
      if (submitError) {
        setError(submitError);
        return;
      }
    }

    resetForm();
  };

  const getPlanDetails = (planId: string) => plans.find((p) => p.id === planId);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-3">
          <Building className="w-8 h-8 text-indigo-600" />
          Configuración de Agencias
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          Administre las entidades comerciales, sus datos de contacto y niveles de servicio.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-1">
          <div
            className={`rounded-2xl shadow-lg border p-6 sticky top-6 transition-colors duration-300 ${editingId ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}
          >
            <div className="flex justify-between items-center mb-6">
              <h3
                className={`text-xl font-bold ${editingId ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-white'}`}
              >
                {editingId ? 'Editando Agencia' : 'Nueva Agencia'}
              </h3>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <X className="w-3 h-3" /> Cancelar
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Status Switch */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Estado de Cuenta
                </span>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isActive ? 'bg-green-500' : 'bg-red-500'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Ej. Flowers Cargo LLC"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Emails Facturación
                </label>
                <div className="flex gap-2 mb-2 items-center">
                  <input
                    type="email"
                    value={currentEmailInput}
                    onChange={(e) => setCurrentEmailInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                    className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="billing@agencia.com"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="shrink-0 w-11 h-11 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors border border-indigo-200"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Email Tags List */}
                <div className="flex flex-wrap gap-2">
                  {emailList.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {emailList.length === 0 && (
                    <span className="text-xs text-slate-400 italic">No hay emails agregados</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Plan de Suscripción
                </label>
                <div className="relative">
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                    className="w-full appearance-none px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none pr-10 cursor-pointer transition-all"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - ${p.baseCost}/mes
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
                {/* Plan Info Preview */}
                <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                  {(() => {
                    const p = getPlanDetails(selectedPlan);
                    if (!p) return null;
                    return (
                      <div className="text-xs space-y-1 text-indigo-800 dark:text-indigo-300">
                        <div className="flex justify-between">
                          <span>Límite Mensual:</span>
                          <span className="font-bold">{p.limit.toLocaleString()} Páginas</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Costo Base:</span>
                          <span className="font-bold">${p.baseCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                          <span>Costo Extra:</span>
                          <span className="font-bold">${p.extraPageCost.toFixed(2)} / pág</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-3 font-bold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 ${
                  editingId
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Actualizar Datos' : 'Registrar Agencia'}
              </button>
            </form>
          </div>
        </div>

        {/* Listado */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Agencias Activas ({agencies.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-white dark:bg-slate-800 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Agencia</th>
                    <th className="px-6 py-4">Plan Actual</th>
                    <th className="px-6 py-4 text-center">Uso Mes</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {agencies.map((agency) => {
                    const plan = getPlanDetails(agency.planId);
                    return (
                      <tr key={agency.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4">
                          {agency.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                              <Power className="w-3 h-3" /> ACTIVA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                              <Power className="w-3 h-3" /> SUSPENDIDA
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 dark:text-white">
                            {agency.name}
                          </div>
                          <div className="flex flex-col gap-1 mt-1">
                            {agency.emails && agency.emails.length > 0 ? (
                              agency.emails.map((email) => (
                                <span
                                  key={email}
                                  className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded w-fit"
                                >
                                  {email}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-red-400">Sin emails</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            {agency.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">
                            {plan?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                            {agency.currentUsage}
                          </span>
                          <span className="text-slate-400 text-xs">
                            {' '}
                            / {plan?.limit.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleEdit(agency)}
                              className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Editar Agencia"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                const deleteError = await onDeleteAgency(agency.id);
                                if (deleteError) {
                                  setError(deleteError);
                                }
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar Agencia"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgenciesConfiguration;
