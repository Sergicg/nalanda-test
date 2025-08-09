import { Injectable } from '@angular/core';
import { AlertEvent } from '@domain';
import { Subject, BehaviorSubject } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class AlertsService {
  private stream$ = new Subject<AlertEvent>();
  private history$ = new BehaviorSubject<AlertEvent[]>([]);

  private lastKey = '';
  private dedupeMs = 500; // evita spam de eventos iguales muy seguidos

  asStream() { return this.stream$.asObservable(); }
  asHistory() { return this.history$.asObservable(); }

  emit(a: Omit<AlertEvent, 'ts'>, dedupe = true) {
    const evt: AlertEvent = { ...a, ts: Date.now() };
    if (dedupe) {
      const key = `${evt.severity}|${evt.summary}|${evt.detail ?? ''}`;
      if (key === this.lastKey && this.history$.value.at(-1)?.ts && evt.ts - this.history$.value.at(-1)!.ts < this.dedupeMs) {
        return;
      }
      this.lastKey = key;
    }
    this.stream$.next(evt);
    this.history$.next([...this.history$.value, evt]);
  }

  success(summary: string, detail?: string, taskId?: string) { this.emit({ severity: 'success', summary, detail, taskId }); }
  info(summary: string, detail?: string, taskId?: string)    { this.emit({ severity: 'info',    summary, detail, taskId }); }
  warn(summary: string, detail?: string, taskId?: string)    { this.emit({ severity: 'warn',    summary, detail, taskId }); }
  error(summary: string, detail?: string, taskId?: string)   { this.emit({ severity: 'error',   summary, detail, taskId }); }

  clearHistory() { this.history$.next([]); }
}
