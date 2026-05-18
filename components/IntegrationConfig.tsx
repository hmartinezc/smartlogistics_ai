import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Agency,
  AgencyIntegrationConfig,
  AgencyIntegrationEndpointConfig,
  BatchExportDocument,
  IntegrationDeliveryLog,
  IntegrationEndpointHeader,
  IntegrationEndpointResponse,
} from '../types';
import { api } from '../services/apiClient';
import {
  applyFieldMappingsToDocuments,
  buildIntegrationTestDocuments,
  createDefaultIntegrationConfig,
  hasClientFieldMappings,
  hasEnabledIntegrationEndpoint,
  INTEGRATION_FIELD_DEFINITIONS,
  isValidIntegrationEndpointUrl,
} from '../shared/integrationConfig';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  Zap,
} from './Icons';
import PageHeader from './PageHeader';

interface IntegrationConfigProps {
  currentAgencyId: string;
  currentAgency?: Agency;
  onUpdateAgency: (agency: Agency) => Promise<string | null> | string | null;
}

const SECTION_ORDER = ['meta', 'invoice', 'lineItems', 'match'] as const;

const SECTION_LABELS: Record<(typeof SECTION_ORDER)[number], string> = {
  meta: 'Meta exportación',
  invoice: 'Campos factura',
  lineItems: 'Line items',
  match: 'Matches cliente',
};

const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: 'Sin autenticación' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apiKey', label: 'API Key Header' },
  { value: 'basic', label: 'Basic Auth' },
] as const;

const METHOD_OPTIONS = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
] as const;

type MappingViewMode = 'fields' | 'json';
type JsonPreviewMode = 'native' | 'mapped';

const buildEmptyHeader = (): IntegrationEndpointHeader => ({
  id: `header_${crypto.randomUUID()}`,
  key: '',
  value: '',
});

const cloneConfig = (config?: AgencyIntegrationConfig): AgencyIntegrationConfig =>
  config ? structuredClone(config) : createDefaultIntegrationConfig();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBatchExportDocumentLike(value: unknown): value is BatchExportDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.filename === 'string' &&
    typeof value.invoiceNumber === 'string' &&
    typeof value.date === 'string' &&
    Array.isArray(value.lineItems)
  );
}

function normalizeUploadedTestDocuments(value: unknown): BatchExportDocument[] | null {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isBatchExportDocumentLike) ? value : null;
  }

  if (isBatchExportDocumentLike(value)) {
    return [value];
  }

  return null;
}

const JSON_TOKEN_REGEX =
  /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function getJsonTokenClassName(source: string, token: string, tokenIndex: number): string {
  if (token.startsWith('"')) {
    const nextCharacter = source.slice(tokenIndex + token.length).trimStart()[0];
    return nextCharacter === ':' ? 'text-sky-300' : 'text-emerald-300';
  }

  if (token === 'true' || token === 'false') {
    return 'text-fuchsia-300';
  }

  if (token === 'null') {
    return 'text-slate-500';
  }

  return 'text-amber-300';
}

function renderHighlightedJson(source: string): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let segmentKey = 0;

  for (const match of source.matchAll(JSON_TOKEN_REGEX)) {
    const token = match[0];
    const tokenIndex = match.index ?? 0;
    const plainText = source.slice(lastIndex, tokenIndex);

    if (plainText) {
      segments.push(
        <span key={`json_plain_${segmentKey++}`} className="text-slate-300">
          {plainText}
        </span>,
      );
    }

    segments.push(
      <span
        key={`json_token_${segmentKey++}`}
        className={getJsonTokenClassName(source, token, tokenIndex)}
      >
        {token}
      </span>,
    );

    lastIndex = tokenIndex + token.length;
  }

  const trailingText = source.slice(lastIndex);
  if (trailingText) {
    segments.push(
      <span key={`json_plain_${segmentKey++}`} className="text-slate-300">
        {trailingText}
      </span>,
    );
  }

  return segments;
}

const formatLogDate = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-EC', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const IntegrationConfig: React.FC<IntegrationConfigProps> = ({
  currentAgencyId,
  currentAgency,
  onUpdateAgency,
}) => {
  const [draft, setDraft] = useState<AgencyIntegrationConfig>(() =>
    cloneConfig(currentAgency?.integrationConfig),
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<IntegrationEndpointResponse | null>(null);
  const [logs, setLogs] = useState<IntegrationDeliveryLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBasicPassword, setShowBasicPassword] = useState(false);
  const [testPayloadDocuments, setTestPayloadDocuments] = useState<BatchExportDocument[] | null>(
    null,
  );
  const [testPayloadFileName, setTestPayloadFileName] = useState('');
  const [testPayloadError, setTestPayloadError] = useState('');
  const [mappingView, setMappingView] = useState<MappingViewMode>('fields');
  const [jsonPreviewMode, setJsonPreviewMode] = useState<JsonPreviewMode>('mapped');
  const logsRequestIdRef = useRef(0);
  const mappingContentRef = useRef<HTMLDivElement | null>(null);
  const currentAgencyConfigSignature = JSON.stringify(currentAgency?.integrationConfig ?? null);

  const loadLogs = async (agencyId: string): Promise<void> => {
    const requestId = ++logsRequestIdRef.current;
    setIsLoadingLogs(true);

    try {
      const nextLogs = await api.getIntegrationLogs(agencyId);
      if (logsRequestIdRef.current !== requestId) {
        return;
      }

      setLogs(nextLogs);
    } catch {
      if (logsRequestIdRef.current !== requestId) {
        return;
      }

      setLogs([]);
    } finally {
      if (logsRequestIdRef.current === requestId) {
        setIsLoadingLogs(false);
      }
    }
  };

  useEffect(() => {
    setDraft(cloneConfig(currentAgency?.integrationConfig));
    setSearch('');
    setError('');
    setSuccess('');
    setTestResult(null);
    setTestPayloadDocuments(null);
    setTestPayloadFileName('');
    setTestPayloadError('');
    setMappingView('fields');
    setJsonPreviewMode('mapped');
  }, [currentAgency?.id, currentAgencyConfigSignature]);

  useEffect(() => {
    if (!currentAgencyId || currentAgencyId === 'GLOBAL') {
      logsRequestIdRef.current += 1;
      setLogs([]);
      setIsLoadingLogs(false);
      return;
    }

    void loadLogs(currentAgencyId);
  }, [currentAgencyId]);

  useEffect(() => {
    mappingContentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [mappingView, jsonPreviewMode]);

  const filteredFields = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return INTEGRATION_FIELD_DEFINITIONS;
    }

    return INTEGRATION_FIELD_DEFINITIONS.filter((field) =>
      [field.path, field.label, field.description].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [search]);

  const groupedFields = useMemo(
    () =>
      SECTION_ORDER.map((section) => ({
        section,
        fields: filteredFields.filter((field) => field.section === section),
      })).filter((group) => group.fields.length > 0),
    [filteredFields],
  );

  const previewDocuments = useMemo(() => buildIntegrationTestDocuments(), []);
  const nativeJsonPreview = useMemo(
    () => JSON.stringify(previewDocuments, null, 2),
    [previewDocuments],
  );
  const mappedJsonPreview = useMemo(
    () => JSON.stringify(applyFieldMappingsToDocuments(previewDocuments, draft, true), null, 2),
    [draft, previewDocuments],
  );
  const previewHasDifferences = nativeJsonPreview !== mappedJsonPreview;
  const exampleLineItemCount = previewDocuments[0]?.lineItems.length ?? 0;
  const activeJsonPreview = jsonPreviewMode === 'native' ? nativeJsonPreview : mappedJsonPreview;
  const activeJsonPreviewTitle = jsonPreviewMode === 'native' ? 'JSON actual' : 'JSON resultante';
  const activeJsonPreviewDescription =
    jsonPreviewMode === 'native'
      ? 'Formato nativo Smart Invoice'
      : 'Como lo recibiria el sistema del cliente';
  const activeJsonPreviewBadge = jsonPreviewMode === 'native' ? 'Nuestro' : 'Cliente';
  const activeJsonPreviewBadgeClass =
    jsonPreviewMode === 'native'
      ? 'bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20'
      : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20';
  const highlightedJsonPreview = useMemo(
    () => renderHighlightedJson(activeJsonPreview),
    [activeJsonPreview],
  );

  const mappingCount = Object.keys(draft.fieldMappings).length;
  const hasEndpointConfig = hasEnabledIntegrationEndpoint(draft);

  const setEndpoint = (
    updater: (endpoint: AgencyIntegrationEndpointConfig) => AgencyIntegrationEndpointConfig,
  ) => {
    setDraft((current) => ({
      ...current,
      endpoint: updater(current.endpoint),
    }));
  };

  const updateEndpoint = (patch: Partial<AgencyIntegrationEndpointConfig>) => {
    setEndpoint((currentEndpoint) => ({
      ...currentEndpoint,
      ...patch,
    }));
  };

  const updateHeader = (id: string, patch: Partial<IntegrationEndpointHeader>) => {
    setEndpoint((currentEndpoint) => ({
      ...currentEndpoint,
      headers: currentEndpoint.headers.map((header) =>
        header.id === id ? { ...header, ...patch } : header,
      ),
    }));
  };

  const addHeader = () => {
    setEndpoint((currentEndpoint) => ({
      ...currentEndpoint,
      headers: [...currentEndpoint.headers, buildEmptyHeader()],
    }));
  };

  const removeHeader = (id: string) => {
    setEndpoint((currentEndpoint) => ({
      ...currentEndpoint,
      headers: currentEndpoint.headers.filter((header) => header.id !== id),
    }));
  };

  const handleMappingChange = (path: string, value: string) => {
    setDraft((current) => {
      const nextMappings = { ...current.fieldMappings };
      const trimmed = value.trim();
      if (trimmed) {
        nextMappings[path] = trimmed;
      } else {
        delete nextMappings[path];
      }

      return {
        ...current,
        fieldMappings: nextMappings,
      };
    });
  };

  const handleSave = async () => {
    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      setError('Selecciona una agencia específica para configurar la integración.');
      return;
    }

    if (draft.endpoint.enabled && !isValidIntegrationEndpointUrl(draft.endpoint.url)) {
      setError('Configura una URL válida antes de activar el endpoint externo.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    const submitError = await onUpdateAgency({
      ...currentAgency,
      integrationConfig: draft,
    });

    setIsSaving(false);
    if (submitError) {
      setError(submitError);
      return;
    }

    setSuccess('Configuración de integración guardada.');
  };

  const handleTestPayloadFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const normalizedDocuments = normalizeUploadedTestDocuments(parsed);
      if (!normalizedDocuments) {
        setTestPayloadDocuments(null);
        setTestPayloadFileName('');
        setTestPayloadError(
          'El archivo JSON debe contener un objeto o un array de objetos exportables.',
        );
        setSuccess('');
        return;
      }

      setTestPayloadDocuments(normalizedDocuments);
      setTestPayloadFileName(file.name);
      setTestPayloadError('');
      setSuccess(`JSON de prueba cargado: ${file.name}`);
      setError('');
    } catch {
      setTestPayloadDocuments(null);
      setTestPayloadFileName('');
      setTestPayloadError(
        'No fue posible leer el JSON cargado. Verifica el archivo e intenta nuevamente.',
      );
      setSuccess('');
    }
  };

  const handleTestConnection = async () => {
    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      setError('Selecciona una agencia específica antes de probar la conexión.');
      return;
    }

    if (!hasEnabledIntegrationEndpoint(draft)) {
      setError('Activa y completa el endpoint externo antes de probar la conexión.');
      return;
    }

    setIsTesting(true);
    setError('');
    setSuccess('');
    setTestResult(null);

    const saveError = await onUpdateAgency({
      ...currentAgency,
      integrationConfig: draft,
    });

    if (saveError) {
      setError(saveError);
      setIsTesting(false);
      return;
    }

    try {
      const response = await api.testIntegration({
        agencyId: currentAgencyId,
        useClientMapping: hasClientFieldMappings(draft),
        documents: testPayloadDocuments || undefined,
      });
      setTestResult(response);
      setSuccess(
        response.ok
          ? testPayloadDocuments
            ? 'Conexión validada correctamente con el JSON cargado.'
            : 'Conexión validada correctamente con el payload ejemplo.'
          : 'El endpoint respondió con error.',
      );
      await loadLogs(currentAgencyId);
    } catch (testError) {
      const message =
        testError instanceof Error ? testError.message : 'No fue posible probar la conexión.';
      setTestResult({
        ok: false,
        error: message,
        usedClientMapping: hasClientFieldMappings(draft),
      });
      setError(message);
    } finally {
      setIsTesting(false);
    }
  };

  if (!currentAgency || currentAgencyId === 'GLOBAL') {
    return (
      <div className="mx-auto flex h-full max-w-5xl items-center justify-center p-8">
        <div className="w-full max-w-xl rounded-3xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Settings className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            Integración por Agencia
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Selecciona una agencia activa para mapear campos del JSON y configurar su endpoint REST.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 xl:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <PageHeader
          icon={<Zap className="h-3.5 w-3.5" />}
          badge="Integración"
          title={`Flujo Cliente · ${currentAgency.name}`}
          subtitle="Mapea todos los campos del JSON exportado y conecta el endpoint del cliente. Si no configuras nada, el sistema sigue descargando el JSON nativo como hasta ahora."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[460px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Mappings
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-white">
                {mappingCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Endpoint
              </p>
              <p
                className={`mt-2 text-sm font-bold ${hasEndpointConfig ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {hasEndpointConfig ? 'Activo' : 'No configurado'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Payload test
              </p>
              <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                {exampleLineItemCount} item(s)
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Último test
              </p>
              <p
                className={`mt-2 text-sm font-bold ${testResult?.ok ? 'text-emerald-600 dark:text-emerald-300' : testResult ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {testResult
                  ? testResult.ok
                    ? `OK ${testResult.statusCode ?? ''}`
                    : testResult.error || `Error ${testResult.statusCode ?? ''}`
                  : 'Sin probar'}
              </p>
            </div>
          </div>
        </PageHeader>

        {(error || success) && (
          <div className="mt-5 space-y-3">
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {success}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-700">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Field Mapping
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">
                  Mapeo de claves exportadas
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Si dejas un campo vacío, se exporta con el nombre nativo de Smart Invoice.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 lg:max-w-sm lg:items-end">
                <div
                  className="inline-flex w-full rounded-2xl bg-slate-100 p-1 dark:bg-slate-900"
                  role="tablist"
                  aria-label="Vista de mapeo"
                >
                  <button
                    type="button"
                    onClick={() => setMappingView('fields')}
                    role="tab"
                    aria-selected={mappingView === 'fields'}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${mappingView === 'fields' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    Campos
                  </button>
                  <button
                    type="button"
                    onClick={() => setMappingView('json')}
                    role="tab"
                    aria-selected={mappingView === 'json'}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${mappingView === 'json' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    JSON
                  </button>
                </div>

                {mappingView === 'fields' && (
                  <div className="relative w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Buscar campos de mapping"
                      placeholder="Buscar campo, label o descripción..."
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            ref={mappingContentRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5"
          >
            {mappingView === 'json' ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Preview JSON
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">
                      Visualiza el payload exportado
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Este preview usa un payload real de ejemplo con la misma estructura que
                      exporta Smart Invoice. Cambia entre el JSON nativo y el resultante sin salir
                      de la card de mapping.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white px-3 py-1 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      {previewDocuments.length} documento(s) ejemplo
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      {mappingCount} mapping(s) activo(s)
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 ${previewHasDifferences ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      {previewHasDifferences ? 'Cambios detectados' : 'Sin cambios todavia'}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <div
                    className="inline-flex rounded-2xl bg-slate-900 p-1 shadow-inner shadow-slate-950/30"
                    role="tablist"
                    aria-label="Preview JSON"
                  >
                    <button
                      type="button"
                      onClick={() => setJsonPreviewMode('native')}
                      role="tab"
                      aria-selected={jsonPreviewMode === 'native'}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${jsonPreviewMode === 'native' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}
                    >
                      JSON actual
                    </button>
                    <button
                      type="button"
                      onClick={() => setJsonPreviewMode('mapped')}
                      role="tab"
                      aria-selected={jsonPreviewMode === 'mapped'}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${jsonPreviewMode === 'mapped' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}
                    >
                      JSON resultante
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner shadow-slate-950/30">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-white">{activeJsonPreviewTitle}</p>
                      <p className="text-xs text-slate-400">{activeJsonPreviewDescription}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${activeJsonPreviewBadgeClass}`}
                    >
                      {activeJsonPreviewBadge}
                    </span>
                  </div>
                  <div className="overflow-x-auto overflow-y-hidden">
                    <pre className="px-4 py-4 text-[12px] leading-6 text-slate-200">
                      <code>{highlightedJsonPreview}</code>
                    </pre>
                  </div>
                </div>

                {!previewHasDifferences && (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
                    Cuando parametrices al menos un campo, aquí verás inmediatamente cómo cambia el
                    payload que descargaría o enviaría el sistema.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedFields.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    No encontramos campos con ese filtro. Ajusta la búsqueda para seguir mapeando.
                  </div>
                ) : (
                  groupedFields.map((group) => (
                    <div
                      key={group.section}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                          {SECTION_LABELS[group.section]}
                        </h3>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {group.fields.map((field) => (
                          <div
                            key={field.path}
                            className="grid gap-3 px-4 py-3 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                {field.label}
                              </p>
                              <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                                {field.path}
                              </p>
                              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                {field.description}
                              </p>
                            </div>
                            <input
                              type="text"
                              value={draft.fieldMappings[field.path] || ''}
                              onChange={(event) =>
                                handleMappingChange(field.path, event.target.value)
                              }
                              placeholder={field.path}
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-6">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Endpoint Externo
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">
                    Nodo REST cliente
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Se usa al descargar desde historial o panel solo si está activo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateEndpoint({ enabled: !draft.endpoint.enabled })}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${draft.endpoint.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}
                >
                  {draft.endpoint.enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    URL endpoint
                  </label>
                  <input
                    id="integration-endpoint-url"
                    type="url"
                    value={draft.endpoint.url}
                    onChange={(event) => updateEndpoint({ url: event.target.value })}
                    placeholder="https://api.cliente.com/import"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label
                    htmlFor="integration-endpoint-method"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Método
                  </label>
                  <div className="relative">
                    <select
                      id="integration-endpoint-method"
                      value={draft.endpoint.method}
                      onChange={(event) =>
                        updateEndpoint({
                          method: event.target.value as AgencyIntegrationEndpointConfig['method'],
                        })
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      {METHOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="integration-endpoint-auth"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Autenticación
                </label>
                <div className="relative">
                  <select
                    id="integration-endpoint-auth"
                    value={draft.endpoint.authType}
                    onChange={(event) =>
                      updateEndpoint({
                        authType: event.target.value as AgencyIntegrationEndpointConfig['authType'],
                      })
                    }
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {AUTH_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {draft.endpoint.authType === 'bearer' && (
                <div>
                  <label
                    htmlFor="integration-bearer-token"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Bearer token
                  </label>
                  <div className="relative">
                    <input
                      id="integration-bearer-token"
                      type={showBearerToken ? 'text' : 'password'}
                      value={draft.endpoint.bearerToken || ''}
                      onChange={(event) => updateEndpoint({ bearerToken: event.target.value })}
                      placeholder="Ingresa el token del cliente"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBearerToken((current) => !current)}
                      aria-label={showBearerToken ? 'Ocultar bearer token' : 'Mostrar bearer token'}
                      aria-pressed={showBearerToken}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showBearerToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {draft.endpoint.authType === 'apiKey' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="integration-api-key-header"
                      className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Header API key
                    </label>
                    <input
                      id="integration-api-key-header"
                      type="text"
                      value={draft.endpoint.apiKeyHeader || ''}
                      onChange={(event) => updateEndpoint({ apiKeyHeader: event.target.value })}
                      placeholder="X-API-Key"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="integration-api-key-value"
                      className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Valor API key
                    </label>
                    <div className="relative">
                      <input
                        id="integration-api-key-value"
                        type={showApiKey ? 'text' : 'password'}
                        value={draft.endpoint.apiKeyValue || ''}
                        onChange={(event) => updateEndpoint({ apiKeyValue: event.target.value })}
                        placeholder="Ingresa el API key"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((current) => !current)}
                        aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
                        aria-pressed={showApiKey}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {draft.endpoint.authType === 'basic' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="integration-basic-username"
                      className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Usuario
                    </label>
                    <input
                      id="integration-basic-username"
                      type="text"
                      value={draft.endpoint.basicUsername || ''}
                      onChange={(event) => updateEndpoint({ basicUsername: event.target.value })}
                      placeholder="Usuario basic auth"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="integration-basic-password"
                      className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        id="integration-basic-password"
                        type={showBasicPassword ? 'text' : 'password'}
                        value={draft.endpoint.basicPassword || ''}
                        onChange={(event) => updateEndpoint({ basicPassword: event.target.value })}
                        placeholder="Contraseña basic auth"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBasicPassword((current) => !current)}
                        aria-label={
                          showBasicPassword
                            ? 'Ocultar contraseña basic auth'
                            : 'Mostrar contraseña basic auth'
                        }
                        aria-pressed={showBasicPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showBasicPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Headers extra
                  </label>
                  <button
                    type="button"
                    onClick={addHeader}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.endpoint.headers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                      No hay headers personalizados.
                    </div>
                  ) : (
                    draft.endpoint.headers.map((header) => (
                      <div key={header.id} className="grid gap-2 sm:grid-cols-[0.9fr_1.1fr_auto]">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(event) => updateHeader(header.id, { key: event.target.value })}
                          placeholder="Header"
                          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(event) =>
                            updateHeader(header.id, { value: event.target.value })
                          }
                          placeholder="Valor"
                          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeader(header.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-5 w-5 text-indigo-500 dark:text-indigo-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      Comportamiento en descarga
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Si el endpoint está activo, la descarga local sigue ocurriendo. Luego el
                      sistema hace el envío externo y registra si fue exitoso.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">
                        Payload de prueba
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Puedes probar con el payload ejemplo o cargar un JSON real descargado desde
                        Historial para validar exactamente lo que recibiría el cliente.
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
                      <Upload className="h-4 w-4" />
                      Cargar JSON
                      <input
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(event) => {
                          void handleTestPayloadFileChange(event);
                        }}
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40">
                    {testPayloadDocuments ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                            <FileText className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
                            <span className="truncate">{testPayloadFileName}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {testPayloadDocuments.length} documento(s) listos para la prueba.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTestPayloadDocuments(null);
                            setTestPayloadFileName('');
                            setTestPayloadError('');
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Limpiar archivo
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Usando payload ejemplo interno
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Si quieres probar un caso real, descarga un JSON desde Historial y súbelo
                          aquí.
                        </p>
                      </div>
                    )}
                  </div>

                  {testPayloadError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                      {testPayloadError}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {isTesting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  {isTesting ? 'Probando...' : 'Probar conexión'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSaving ? 'Guardando...' : 'Guardar integración'}
                </button>
              </div>

              {testResult && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200'}`}
                >
                  <div className="flex items-start gap-2">
                    {testResult.ok ? (
                      <CheckCircle className="mt-0.5 h-4 w-4" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4" />
                    )}
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {testResult.ok
                          ? `Conexión validada (${testResult.statusCode ?? 'OK'})`
                          : testResult.error ||
                            `Respuesta ${testResult.statusCode ?? 'desconocida'}`}
                      </p>
                      {testResult.responseBody && (
                        <pre className="max-h-32 overflow-auto rounded-xl bg-white/60 p-3 text-xs text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                          {testResult.responseBody}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-700">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Delivery Logs
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">
                  Últimos envíos
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadLogs(currentAgencyId);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} /> Refrescar
              </button>
            </div>

            <div className="min-h-0 max-h-[420px] overflow-auto px-6 py-5">
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    No hay envíos registrados todavía.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${log.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}
                            >
                              {log.success ? 'OK' : 'ERROR'}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {log.eventType} · {log.source}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">
                            {log.endpointUrl}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {formatLogDate(log.createdAt)} · {log.requestDocumentCount} documento(s)
                            · mapping cliente {log.usedClientMapping ? 'ON' : 'OFF'}
                          </p>
                        </div>
                        <div className="text-right text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {log.responseStatus ? `HTTP ${log.responseStatus}` : 'Sin status'}
                        </div>
                      </div>

                      {(log.error || log.responseBody) && (
                        <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                          {log.error && (
                            <p className="font-semibold text-rose-600 dark:text-rose-300">
                              {log.error}
                            </p>
                          )}
                          {log.responseBody && (
                            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap">
                              {log.responseBody}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default IntegrationConfig;
