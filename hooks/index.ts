// ============================================
// CUSTOM HOOKS - Lógica Reutilizable
// ============================================
// Conecta con backend API (libSQL/Turso) vía services/apiClient.ts
// localStorage se usa SOLO para: sessionId, darkMode, currentAgencyId
// ============================================

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { User, Agency, BatchItem, SubscriptionPlan } from '../types';
import {
  getAccessibleAgencies,
  resolveDefaultAgencyContext,
} from '../services/authService';
import { api, ApiError } from '../services/apiClient';

// --------------------------
// useApiData - Carga datos desde la API al montar
// --------------------------
export function useApiData(enabled = false, currentUser: User | null = null) {
  const [users, setUsers] = useState<User[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, u] = await Promise.all([
        api.getAgencies(),
        api.getPlans(),
        currentUser?.role === 'ADMIN' ? api.getUsers() : Promise.resolve(currentUser ? [currentUser] : []),
      ]);
      setAgencies(a);
      setPlans(p);
      setUsers(u);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    refresh();
  }, [enabled, refresh]);

  return { users, setUsers, agencies, setAgencies, plans, loading, refresh };
}

// --------------------------
// useAuth - Autenticación vía API
// --------------------------
interface UseAuthReturn {
  currentUser: User | null;
  login: (user: User) => void;
  logout: () => void;
  loginApi: (email: string, password: string) => Promise<{ user: User } | { error: string }>;
  restoreSession: () => Promise<User | null>;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAuthenticated: boolean;
  sessionReady: boolean;
}

export function useAuth(): UseAuthReturn {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const restoredRef = useRef(false);

  // Restaurar sesión al montar
  const restoreSession = useCallback(async (): Promise<User | null> => {
    try {
      const result = await api.getSession();
      if (result?.user) {
        setCurrentUser(result.user);
        return result.user;
      }
    } catch {
      // Sesión inválida o expirada
    }
    setCurrentUser(null);
    return null;
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    restoreSession().finally(() => setSessionReady(true));
  }, [restoreSession]);

  const loginApi = useCallback(async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      setCurrentUser(result.user);
      return { user: result.user };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Error de conexión.';
      return { error: message };
    }
  }, []);

  const login = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setCurrentUser(null);
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isAuthenticated = Boolean(currentUser);

  return { currentUser, login, logout, loginApi, restoreSession, isAdmin, isSupervisor, isAuthenticated, sessionReady };
}

// --------------------------
// useAgencyContext - Contexto de agencia activa
// --------------------------
interface UseAgencyContextReturn {
  currentAgencyId: string;
  setCurrentAgencyId: (id: string) => void;
  availableAgencies: Agency[];
  currentAgency: Agency | undefined;
}

export function useAgencyContext(
  user: User | null, 
  agencies: Agency[]
): UseAgencyContextReturn {
  const [currentAgencyId, setCurrentAgencyIdState] = useState<string>(() => {
    return localStorage.getItem('smart-invoice-ai.currentAgencyId') || '';
  });

  const setCurrentAgencyId = useCallback((id: string) => {
    setCurrentAgencyIdState(id);
    localStorage.setItem('smart-invoice-ai.currentAgencyId', id);
  }, []);

  const availableAgencies = useMemo(() => getAccessibleAgencies(user, agencies), [user, agencies]);

  useEffect(() => {
    if (!user) {
      setCurrentAgencyId('');
      return;
    }

    const defaultAgencyId = resolveDefaultAgencyContext(user, agencies);
    const hasValidContext = currentAgencyId === 'GLOBAL'
      ? user.role === 'ADMIN'
      : availableAgencies.some((agency) => agency.id === currentAgencyId);

    if (!currentAgencyId || !hasValidContext) {
      setCurrentAgencyId(defaultAgencyId);
    }
  }, [agencies, availableAgencies, currentAgencyId, setCurrentAgencyId, user]);

  const currentAgency = useMemo(() => 
    agencies.find(a => a.id === currentAgencyId),
    [agencies, currentAgencyId]
  );

  return { currentAgencyId, setCurrentAgencyId, availableAgencies, currentAgency };
}

// --------------------------
// useBatchProcessor - Estado del procesamiento batch (API-backed)
// --------------------------
interface UseBatchProcessorReturn {
  batchFiles: File[];
  batchResults: BatchItem[];
  setBatchFiles: (files: File[]) => void;
  addResults: (results: BatchItem[]) => Promise<void>;
  updateResult: (updatedItem: BatchItem) => void;
  removeResults: (ids: string[]) => Promise<void>;
  clearResults: (localOnly?: boolean) => void;
  loadResults: (agencyId?: string) => Promise<void>;
  successCount: number;
  errorCount: number;
}

export function useBatchProcessor(): UseBatchProcessorReturn {
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);

  const loadResults = useCallback(async (agencyId?: string) => {
    try {
      const results = await api.getBatchResults(agencyId);
      setBatchResults(results);
    } catch (err) {
      console.error('Error cargando resultados batch:', err);
    }
  }, []);

  const addResults = useCallback(async (results: BatchItem[]) => {
    const createdAt = new Date().toISOString();
    const serializableItems = results.map(({ file, ...rest }) => ({
      ...rest,
      createdAt: rest.createdAt || createdAt,
    }));

    await api.saveBatchResults(serializableItems);

    setBatchResults(prev => {
      const existingIds = new Set(prev.map(item => item.id));
      const newItems = serializableItems.filter(item => !existingIds.has(item.id));

      return newItems.length > 0 ? [...prev, ...newItems] : prev;
    });
  }, []);

  const updateResult = useCallback((updatedItem: BatchItem) => {
    api.updateBatchItem(updatedItem).catch(err =>
      console.error('Error actualizando item:', err)
    );
    setBatchResults(prev => 
      prev.map(item => item.id === updatedItem.id ? updatedItem : item)
    );
  }, []);

  const removeResults = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(ids));
    await api.deleteBatchItems(uniqueIds);
    setBatchResults(prev => prev.filter(item => !uniqueIds.includes(item.id)));
  }, []);

  const clearResults = useCallback((localOnly = false) => {
    if (!localOnly) {
      api.clearBatchResults().catch(err =>
        console.error('Error limpiando historial:', err)
      );
    }
    setBatchResults([]);
  }, []);

  const successCount = useMemo(() => 
    batchResults.filter(r => r.status === 'SUCCESS').length,
    [batchResults]
  );

  const errorCount = useMemo(() => 
    batchResults.filter(r => r.status === 'ERROR').length,
    [batchResults]
  );

  return {
    batchFiles,
    batchResults,
    setBatchFiles,
    addResults,
    updateResult,
    removeResults,
    clearResults,
    loadResults,
    successCount,
    errorCount,
  };
}

// --------------------------
// useConfirmDialog - Diálogos de confirmación
// --------------------------
interface UseConfirmDialogReturn {
  confirm: (message: string) => Promise<boolean>;
  confirmDelete: (itemName: string) => Promise<boolean>;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const confirm = useCallback(async (message: string): Promise<boolean> => {
    return window.confirm(message);
  }, []);

  const confirmDelete = useCallback(async (itemName: string): Promise<boolean> => {
    return window.confirm(`¿Estás seguro de eliminar "${itemName}"? Esta acción no se puede deshacer.`);
  }, []);

  return { confirm, confirmDelete };
}

// --------------------------
// useDarkMode - Tema oscuro/claro (localStorage - no necesita API)
// --------------------------
const DARK_MODE_STORAGE_KEY = 'smart-invoice-ai.darkMode';

export function useDarkMode(): [boolean, () => void] {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DARK_MODE_STORAGE_KEY) || 'false');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem(DARK_MODE_STORAGE_KEY, JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev: boolean) => !prev);
  }, []);

  return [isDarkMode, toggleDarkMode];
}
