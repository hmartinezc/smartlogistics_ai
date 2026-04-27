
import React, { useState, useEffect, useRef } from 'react';
import { AgentType, AppState, BatchItem, User, Agency } from './types';
import { useAuth, useAgencyContext, useBatchProcessor, useDarkMode, useConfirmDialog, useApiData } from './hooks';
import { api, ApiError } from './services/apiClient';
import LoginScreen from './components/LoginScreen';
import TemplateGallery from './components/TemplateGallery';
import BatchProcessor from './components/BatchProcessor';
import ResultsDashboard from './components/ResultsDashboard';
import ExtractedDataManager from './components/ExtractedDataManager';
import DashboardHome from './components/DashboardHome';
import OperatorPanel from './components/OperatorPanel';
import AdminDashboard from './components/AdminDashboard';
import UserManagement from './components/UserManagement';
import AgenciesConfiguration from './components/AgenciesConfiguration';
import ProductMatchCatalog from './components/ProductMatchCatalog';
import Sidebar from './components/Sidebar';
import { X } from './components/Icons';
import {
  canAccessAgency,
  canAccessAppState,
  resolveDefaultAgencyContext,
  resolveLandingState,
} from './services/authService';
import { generateId } from './utils/helpers';

interface AppProps {
  isWidgetMode?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

function App({ isWidgetMode = false, isOpen = true, onClose }: AppProps) {
  const [appState, setAppState] = useState<AppState>(AppState.LOGIN);
  const [selectedFormat, setSelectedFormat] = useState<AgentType>('AGENT_GENERIC_A');
  
  // Hooks — datos cargados desde API (libSQL/Turso)
  const [isDarkMode, toggleDarkMode] = useDarkMode();
  const { currentUser, loginApi, logout, isAuthenticated, sessionReady } = useAuth();
  const { users, setUsers, agencies, setAgencies, plans, loading: dataLoading, refresh: refreshData } = useApiData(isAuthenticated, currentUser);
  const { batchFiles, batchResults, setBatchFiles, addResults, updateResult, removeResults, clearResults, loadResults } = useBatchProcessor();
  const { confirm } = useConfirmDialog();
  const [isCleaningData, setIsCleaningData] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState('');
  const completedBatchIdsRef = useRef<Set<string>>(new Set());

  // Mutable plans array para componentes que esperan SubscriptionPlan[]
  const PLANS = plans;

  // Agency Context
  const { currentAgencyId, setCurrentAgencyId, availableAgencies, currentAgency } = useAgencyContext(currentUser, agencies);

  // Cargar resultados batch cuando cambia la agencia
  useEffect(() => {
    if (isAuthenticated && currentAgencyId) {
      const shouldLoadAllResults = currentUser?.role === 'ADMIN' && appState === AppState.DASHBOARD_ADMIN;
      loadResults(shouldLoadAllResults || currentAgencyId === 'GLOBAL' ? undefined : currentAgencyId);
    }
  }, [appState, currentUser?.role, isAuthenticated, currentAgencyId, loadResults]);

  // Reset logic when widget opens/closes
  useEffect(() => {
    if (!isOpen && isWidgetMode) {
        // keeping state alive is better UX
    }
  }, [isOpen, isWidgetMode]);

  useEffect(() => {
    if (!sessionReady) return; // Esperar a que se restaure la sesión

    if (!isAuthenticated) {
      if (appState !== AppState.LOGIN) {
        setAppState(AppState.LOGIN);
      }
      return;
    }

    if (!canAccessAppState(currentUser, appState) || appState === AppState.LOGIN) {
      setAppState(resolveLandingState(currentUser!));
    }
  }, [appState, currentUser, isAuthenticated, sessionReady]);

  const handleLogin = async (email: string, password: string) => {
    const result = await loginApi(email, password);

    if ('error' in result) {
      return result.error;
    }

    const user = result.user;
    await refreshData(); // Recargar datos frescos de la BD
    setCurrentAgencyId(resolveDefaultAgencyContext(user, agencies));
    setAppState(resolveLandingState(user));

    return null;
  };

  const handleLogout = async () => {
    await logout();
    setCurrentAgencyId('');
    setAppState(AppState.LOGIN);
    setBatchFiles([]);
    clearResults(true);
  };

  const handleSwitchAgencyContext = (agencyId: string) => {
      if (!canAccessAgency(currentUser, agencyId, agencies)) {
        return;
      }

      setCurrentAgencyId(agencyId);
      if (![AppState.DASHBOARD_OPS, AppState.DASHBOARD_ADMIN, AppState.DASHBOARD_PANEL, AppState.PRODUCT_MATCHES].includes(appState)) {
        setAppState(currentUser?.role === 'ADMIN' ? AppState.DASHBOARD_OPS : AppState.DASHBOARD_PANEL);
      }
  };

  const handleAddUser = async (newUser: User) => {
    try {
      const created = await api.createUser(newUser);
      setUsers(prev => [...prev, created]);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error creando usuario.';
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const updated = await api.updateUser(updatedUser);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error actualizando usuario.';
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!(await confirm('¿Eliminar usuario permanentemente?'))) {
      return null;
    }

    try {
      await api.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error eliminando usuario.';
    }
  };

  const handleAddAgency = async (newAgency: Agency) => {
    try {
      const created = await api.createAgency(newAgency);
      setAgencies(prev => [...prev, created]);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error creando agencia.';
    }
  };

  const handleUpdateAgency = async (updatedAgency: Agency) => {
    try {
      const updated = await api.updateAgency(updatedAgency);
      setAgencies(prev => prev.map(a => a.id === updated.id ? updated : a));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error actualizando agencia.';
    }
  };

  const handleDeleteAgency = async (id: string) => {
    if (!(await confirm('¿Eliminar agencia?'))) {
      return null;
    }

    try {
      // La API ya valida integridad (usuarios asignados)
      await api.deleteAgency(id);
      setAgencies(prev => prev.filter(a => a.id !== id));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error eliminando agencia.';
    }
  };

  const handleFilesSelected = (files: File[], format: AgentType) => {
    if (!currentAgencyId || currentAgencyId === 'GLOBAL') {
      alert('Selecciona una agencia especifica antes de procesar facturas. La vista global es solo para consulta.');
      return;
    }

    setCurrentBatchId(generateId('batch'));
    setBatchFiles(files);
    setSelectedFormat(format);
    setAppState(AppState.BATCH_RUNNING);
  };

  // ACTUALIZACIÓN DE ÍTEM INDIVIDUAL (Sin crear nuevos)
  const handleUpdateResult = (updatedItem: BatchItem) => {
      updateResult(updatedItem);
  };

  const handleBatchComplete = async (batchId: string, newResults: BatchItem[]) => {
    if (completedBatchIdsRef.current.has(batchId)) {
      return;
    }

    completedBatchIdsRef.current.add(batchId);

    const processedCount = newResults.filter(r => r.status === 'SUCCESS' || r.status === 'ERROR').length;
    const targetAgencyId = currentAgencyId;
    if (!targetAgencyId || targetAgencyId === 'GLOBAL') {
      alert('No se guardo el lote porque no hay una agencia especifica seleccionada. Selecciona una agencia y vuelve a procesar.');
      setAppState(AppState.PROCESS_SELECTION);
      return;
    }

    const resultsWithMeta = newResults.map(item => ({
        ...item,
        user: currentUser?.name || 'Unknown',
        agencyId: targetAgencyId 
    }));
    
    try {
      await addResults(resultsWithMeta);

      if (processedCount > 0) {
        try {
          const updated = await api.bumpAgencyUsage(targetAgencyId, processedCount);
          setAgencies(prev => prev.map(a => a.id === updated.id ? updated : a));
        } catch (err) {
          console.error('Error actualizando uso de agencia:', err);
        }
      }

      setAppState(AppState.HISTORY_RESULTS);
    } catch (err) {
      console.error('Error guardando resultados del lote:', err);
      alert('No se pudieron guardar los resultados del lote. Intenta nuevamente antes de continuar.');
    }
  };
  
  const handleClearHistory = async () => {
    if(await confirm("¿Estás seguro de limpiar todo el historial de esta sesión?")) {
        clearResults();
    }
  };

  const handleDeleteBatchItems = async (ids: string[]) => {
    if (ids.length === 0) {
      return null;
    }

    const message = ids.length === 1
      ? '¿Eliminar este registro extraído de forma permanente?'
      : `¿Eliminar ${ids.length} registros extraídos de forma permanente?`;

    if (!(await confirm(message))) {
      return null;
    }

    setIsCleaningData(true);
    try {
      await removeResults(ids);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Error eliminando registros.';
    } finally {
      setIsCleaningData(false);
    }
  };

  const handleRefreshBatchResults = async () => {
    setIsCleaningData(true);
    try {
      await loadResults(currentAgencyId === 'GLOBAL' ? undefined : currentAgencyId || undefined);
    } finally {
      setIsCleaningData(false);
    }
  };

  const handleNavigate = async (target: AppState) => {
    if (!canAccessAppState(currentUser, target)) {
      return;
    }

    if (appState === AppState.BATCH_RUNNING && target !== AppState.BATCH_RUNNING) {
      if (!(await confirm("¿Estás seguro? El proceso actual se detendrá."))) return;
    }
    setAppState(target);
  };

  const contextPlan = currentAgency ? PLANS.find(p => p.id === currentAgency.planId) : undefined;

  // WIDGET MODE WRAPPER
  const containerClasses = isWidgetMode 
    ? "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    : "h-screen w-full";
  
  const innerClasses = isWidgetMode
    ? "bg-slate-50 dark:bg-slate-900 w-full max-w-[95vw] h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex relative"
    : "h-full w-full flex bg-slate-50 dark:bg-slate-900 font-sans";

  if (!isOpen) return null;

  // Mostrar loading mientras se restaura sesión o cargan datos
  if (!sessionReady || dataLoading) {
    return (
      <div className={`${isDarkMode ? 'dark' : ''} h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Conectando con la base de datos...</p>
        </div>
      </div>
    );
  }

  const MainContent = () => (
    <>
         {appState === AppState.LOGIN ? (
           <div className="w-full h-full overflow-y-auto">
              <LoginScreen onLogin={handleLogin} />
           </div>
         ) : (
           <>
            <Sidebar 
                currentTab={appState} 
                onNavigate={handleNavigate} 
                onLogout={handleLogout}
                isDarkMode={isDarkMode}
                onToggleTheme={toggleDarkMode}
                userRole={currentUser?.role || 'OPERADOR'}
                userName={currentUser?.name || 'Usuario'}
                availableAgencies={availableAgencies}
                currentAgencyId={currentAgencyId}
                onSwitchAgency={handleSwitchAgencyContext}
            />

            <main className="flex-1 overflow-hidden relative flex flex-col">
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                {appState === AppState.DASHBOARD_ADMIN && currentUser?.role === 'ADMIN' && (
                    <AdminDashboard results={batchResults} agencies={agencies} plans={PLANS} />
                )}
                {appState === AppState.DASHBOARD_OPS && currentUser?.role === 'ADMIN' && (
                    <DashboardHome results={batchResults} currentAgencyId={currentAgencyId} currentAgency={currentAgency} currentPlan={contextPlan} />
                )}
                {appState === AppState.DASHBOARD_PANEL && currentUser && (
                  <OperatorPanel results={batchResults} currentAgencyId={currentAgencyId} currentAgency={currentAgency} />
                )}
                {appState === AppState.USER_MANAGEMENT && currentUser?.role === 'ADMIN' && (
                    <UserManagement users={users} agencies={agencies} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />
                )}
                {appState === AppState.AGENCY_CONFIG && currentUser?.role === 'ADMIN' && (
                    <AgenciesConfiguration agencies={agencies} plans={PLANS} onAddAgency={handleAddAgency} onUpdateAgency={handleUpdateAgency} onDeleteAgency={handleDeleteAgency} />
                )}
                {appState === AppState.PRODUCT_MATCHES && currentUser && (
                  <ProductMatchCatalog currentAgencyId={currentAgencyId} currentAgency={currentAgency} />
                )}
                {appState === AppState.PROCESS_SELECTION && (
                    <TemplateGallery onSelectFiles={handleFilesSelected} />
                )}
                {appState === AppState.BATCH_RUNNING && (
                    <div className="h-full flex flex-col justify-center">
                        <BatchProcessor
                            files={batchFiles}
                            format={selectedFormat}
                            batchId={currentBatchId}
                            onComplete={(results) => handleBatchComplete(currentBatchId, results)}
                        />
                    </div>
                )}
                {appState === AppState.HISTORY_RESULTS && (
                    <ResultsDashboard 
                        results={batchResults} 
                        onBack={() => setAppState(AppState.PROCESS_SELECTION)} 
                        onClearHistory={handleClearHistory} 
                        onUpdateItem={handleUpdateResult} 
                    />
                )}
                {appState === AppState.DATA_CLEANUP && (
                  <ExtractedDataManager
                    results={batchResults}
                    isBusy={isCleaningData}
                    onRefresh={handleRefreshBatchResults}
                    onDeleteItems={handleDeleteBatchItems}
                  />
                )}
                </div>
            </main>
           </>
         )}
    </>
  );

  return (
    <div className={`${isDarkMode ? 'dark' : ''} ${containerClasses}`}>
        {isWidgetMode && (
            // Close Button for Widget Mode
            <button 
                onClick={onClose} 
                className="absolute top-4 right-4 z-[60] bg-white text-slate-500 hover:text-red-500 p-2 rounded-full shadow-lg transition-transform hover:scale-110"
            >
                <X className="w-6 h-6" />
            </button>
        )}
        
        <div className={innerClasses}>
            <MainContent />
        </div>
    </div>
  );
}

export default App;
