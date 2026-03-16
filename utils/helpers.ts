// ============================================
// UTILIDADES HELPER
// ============================================

import { UI_CONFIG, BOX_TYPE_FACTORS, BOX_TYPE_ALIASES } from '../config';

// --------------------------
// Formateo de números y moneda
// --------------------------
export const formatCurrency = (value: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatNumber = (value: number, decimals = 2): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatPercentage = (value: number): string => {
  return `${Math.round(value)}%`;
};

// --------------------------
// Formateo de fechas
// --------------------------
export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
};

// --------------------------
// Lógica de Box Types (Logística Flores)
// --------------------------
export const normalizeBoxType = (rawType: string): string => {
  const upper = rawType.toUpperCase().trim();
  return BOX_TYPE_ALIASES[upper] || upper;
};

export const getBoxTypeFactor = (boxType: string): number => {
  const normalized = normalizeBoxType(boxType);
  return BOX_TYPE_FACTORS[normalized] ?? 1.0;
};

export const calculateEqFull = (pieces: number, boxType: string): number => {
  const factor = getBoxTypeFactor(boxType);
  return pieces * factor;
};

// --------------------------
// Confidence Score Helpers
// --------------------------
export const getConfidenceLevel = (score: number): 'high' | 'medium' | 'low' => {
  if (score >= UI_CONFIG.HIGH_CONFIDENCE_SCORE) return 'high';
  if (score >= UI_CONFIG.MIN_CONFIDENCE_SCORE) return 'medium';
  return 'low';
};

export const getConfidenceLabel = (score: number): string => {
  const level = getConfidenceLevel(score);
  const labels = { high: 'Alta', medium: 'Media', low: 'Revisar' };
  return labels[level];
};

export const getConfidenceColor = (score: number): string => {
  const level = getConfidenceLevel(score);
  const colors = {
    high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200',
    low: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200',
  };
  return colors[level];
};

// --------------------------
// Validaciones
// --------------------------
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string, minLength = 4): boolean => {
  return password.length >= minLength;
};

// --------------------------
// Generadores de IDs
// --------------------------
export const generateId = (prefix = ''): string => {
  const random = Math.random().toString(36).substring(2, 11);
  const timestamp = Date.now().toString(36);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
};

// --------------------------
// Manejo de archivos
// --------------------------
export const getFileExtension = (filename: string): string => {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
};

export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

export const isPDFFile = (file: File): boolean => {
  return file.type === 'application/pdf';
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --------------------------
// Exportación de datos
// --------------------------
export const downloadAsJSON = (data: unknown, filename: string): void => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadAsCSV = (data: Record<string, unknown>[], filename: string): void => {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        const stringValue = String(value ?? '');
        // Escapar comillas y envolver en comillas si contiene comas
        return stringValue.includes(',') || stringValue.includes('"')
          ? `"${stringValue.replace(/"/g, '""')}"`
          : stringValue;
      }).join(',')
    )
  ];
  
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// --------------------------
// Debounce utility
// --------------------------
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
};

// --------------------------
// Class name utility (similar to clsx)
// --------------------------
export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};
