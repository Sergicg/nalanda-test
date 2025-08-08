export type AlertSeverity = 'success' | 'info' | 'warn' | 'error';

export interface AlertEvent {
  severity: AlertSeverity;
  summary: string;
  detail?: string;
  taskId?: string;
  ts: number;
}
