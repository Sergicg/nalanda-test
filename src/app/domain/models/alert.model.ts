export type AlertSeverity = 'success' | 'info' | 'warn' | 'error';
export type AlertType = 'info' | 'success' | 'warn' | 'danger' | 'contrast' | 'secondary';

export interface AlertEvent {
  severity: AlertSeverity;
  summary: string;
  detail?: string;
  taskId?: string;
  ts: number;
}
