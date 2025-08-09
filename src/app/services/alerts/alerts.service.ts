import { Injectable } from '@angular/core';
import { AlertEvent } from '@domain';
import { Subject, BehaviorSubject } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class AlertsService {
  private stream$ = new Subject<AlertEvent>();
  private history$ = new BehaviorSubject<AlertEvent[]>([]);

  private lastAlertKey = '';
  private readonly AVOID_DUPLICATES_MS = 500; // evita spam de eventos iguales muy seguidos

  asStream() { return this.stream$.asObservable(); }
  asHistory() { return this.history$.asObservable(); }

  emit(alertData: Omit<AlertEvent, 'ts'>, avoidDuplicates = true) {
    const newAlert = this.createAlertWithTimestamp(alertData);

    if (avoidDuplicates) {
      const alertKey = this.createAlertKey(newAlert);
      if (this.isDuplicateAlert(newAlert, alertKey)) return;
      this.lastAlertKey = alertKey;
    }
    this.stream$.next(newAlert);
    this.history$.next([...this.history$.value, newAlert]);
  }

  success(summary: string, detail?: string, taskId?: string) { this.emit({ severity: 'success', summary, detail, taskId }); }
  info(summary: string, detail?: string, taskId?: string)    { this.emit({ severity: 'info',    summary, detail, taskId }); }
  warn(summary: string, detail?: string, taskId?: string)    { this.emit({ severity: 'warn',    summary, detail, taskId }); }
  error(summary: string, detail?: string, taskId?: string)   { this.emit({ severity: 'error',   summary, detail, taskId }); }

  clearHistory() { this.history$.next([]); }

  private createAlertWithTimestamp(alertData: Omit<AlertEvent, 'ts'>): AlertEvent {
    return { ...alertData, ts: Date.now() };
  }

  private createAlertKey(alert: AlertEvent): string {
    return `${alert.severity}|${alert.summary}|${alert.detail ?? ''}`;
  }

  private isDuplicateAlert(newAlert: AlertEvent, alertKey: string): boolean {
    return this.isSameAsLastAlert(alertKey) && this.isRecentDuplicate(newAlert.ts);
  }

  private isSameAsLastAlert(alertKey: string): boolean {
    return alertKey === this.lastAlertKey;
  }

  private isRecentDuplicate(newAlertTimestamp: number): boolean {
    const lastAlert = this.getLastAlert();
    if (!lastAlert) return false;
    return newAlertTimestamp - lastAlert.ts < this.AVOID_DUPLICATES_MS;
  }

  private getLastAlert(): AlertEvent | undefined {
    const listAlertHistory = this.history$.value;
    return listAlertHistory.length > 0 ? listAlertHistory[listAlertHistory.length - 1] : undefined;
  }

}
