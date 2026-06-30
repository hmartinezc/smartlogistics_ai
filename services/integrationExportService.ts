import type {
  Agency,
  BatchExportDocument,
  IntegrationDeliverySource,
  IntegrationEndpointResponse,
} from '../types';
import { api, ApiError } from './apiClient';
import { applyFieldMappingsToDocuments, hasClientFieldMappings } from '../shared/integrationConfig';

export interface IntegrationExportExecutionResult {
  exportedDocuments: unknown[];
  usedClientMapping: boolean;
  deliveryResult?: IntegrationEndpointResponse;
}

export async function executeIntegrationExport(options: {
  agency: Agency | undefined;
  documents: BatchExportDocument[];
  useClientMapping: boolean;
  source: IntegrationDeliverySource;
  exportReference?: string;
  exportFilename?: string;
}): Promise<IntegrationExportExecutionResult> {
  const integrationConfig = options.agency?.integrationConfig;
  const hasClientMapping = hasClientFieldMappings(integrationConfig);
  const canUseClientMapping = Boolean(options.useClientMapping && hasClientMapping);
  const shouldDeliverToEndpoint = Boolean(
    options.agency?.id &&
    integrationConfig?.endpoint.enabled &&
    integrationConfig.endpoint.url &&
    (canUseClientMapping || !hasClientMapping),
  );

  const exportedDocuments = applyFieldMappingsToDocuments(
    options.documents,
    integrationConfig,
    canUseClientMapping,
  );

  let deliveryResult: IntegrationEndpointResponse | undefined;
  if (shouldDeliverToEndpoint && options.agency?.id) {
    try {
      deliveryResult = await api.sendToIntegration({
        agencyId: options.agency.id,
        documents: options.documents,
        useClientMapping: canUseClientMapping,
        source: options.source,
        exportReference: options.exportReference,
        exportFilename: options.exportFilename,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'No fue posible enviar al endpoint del cliente.';
      deliveryResult = {
        ok: false,
        error: message,
        usedClientMapping: canUseClientMapping,
      };
    }
  }

  return {
    exportedDocuments,
    usedClientMapping: canUseClientMapping,
    deliveryResult,
  };
}
