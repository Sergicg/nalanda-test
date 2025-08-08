// src/app/services/task-engine.service.ts
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer, throwError, EMPTY } from 'rxjs';
import { catchError, finalize, map, mergeMap, tap } from 'rxjs/operators';
import { Task, TaskStatus } from '@domain';
import { AlertsService } from '../alerts/alerts.service';

@Injectable({ providedIn: 'root' })
export class TaskEngineService {

  private alerts = inject(AlertsService);

  private tasks$ = new BehaviorSubject<Task[]>([]);
  private alerts$ = new BehaviorSubject<string[]>([]);

  // Control de ejecución
  private activeTasks = new Set<string>();
  private readonly maxConcurrency = 3;  

  getTasks(): Observable<Task[]> { 
    return this.tasks$.asObservable(); 
  }
  
  getAlerts(): Observable<string[]> { 
    return this.alerts$.asObservable(); 
  }  

  addTask(task: Task): void {
    const merged: Task = { ...task };
    this.tasks$.next([...this.tasks$.value, merged]);
  }

  updateTask(updated: Task): void {
    const list = this.tasks$.value;
    const i = list.findIndex(t => t.id === updated.id);
    if (i === -1) return;
    const copy = [...list];
    copy[i] = { ...updated };
    this.tasks$.next(copy);
  }

  cancelTask(taskId: string): void {
    const cur = this.getById(taskId);
    if (!cur) return;
    if (cur.state === 'pending' || cur.state === 'in-progress') {
      this.updateTask({ ...cur, state: 'cancelled' });
      this.alerts.error(`Falló ${cur.title}`, `Sin más reintentos`, cur.id);
    }
  }

  deleteTask(taskId: string): void {
    const filtered = this.tasks$.value.filter(t => t.id !== taskId);
    const cleaned = filtered.map(t => ({
      ...t,
      dependencies: t.dependencies?.filter(d => d.id !== taskId) ?? []
    }));
    this.tasks$.next(cleaned);
  }

  retryTask(taskId: string): void {
    const cur = this.getById(taskId);
    if (!cur) return;
    if (cur.state === 'failed') {
      const nextRetries = (cur.retries ?? 0) + 1;
      if (nextRetries <= 2) {
        this.updateTask({ ...cur, retries: nextRetries, state: TaskStatus.PENDING });
        this.alerts.info(`Reintentando ${cur.title}`, `Intento ${nextRetries}/3`, cur.id);
      } else {
        this.updateTask({ ...cur, state: 'failed' });
        this.alerts.error(`Falló ${cur.title}`, `Sin más reintentos`, cur.id);
      }
    }
  }

  updateCreateAt(task: Task): void {
    const cur = this.getById(task.id);
    if (!cur) return;
    this.updateTask({ ...cur, startAt: task.startAt });
  }

  // ------- Info de capacidad para el Scheduler -------
  hasCapacity(): boolean {
    return this.activeTasks.size < this.maxConcurrency;
  }

  tryExecute(taskId: string): Observable<void> {
    const initialTask = this.getById(taskId);

    // Condiciones iniciales: tarea válida, pendiente y hay capacidad
    const isRunnable =
      initialTask &&
      initialTask.state === TaskStatus.PENDING &&
      this.hasCapacity();

    if (!isRunnable) {
      return of(void 0);
    }

  // Reservar slot y marcar como en progreso
  this.activeTasks.add(taskId);
  this.updateTask({ ...initialTask, state: TaskStatus.IN_PROGRESS });

  const blockTimerId = this.checkBlockTaskByDurationTimer(initialTask);

  // Helpers
  const getCurrentTask = () => this.getById(taskId);
  const isTaskCancelled = (task?: Task) => task?.state === TaskStatus.CANCELLED;
  const showCancelledInfo = (task: Task) => this.alerts.info(`Tarea ${task.title} cancelada`, undefined, task.id);

  return timer(initialTask.duration).pipe(
    // Simulación de ejecución
    mergeMap(() => {
      const currentTask = getCurrentTask();
      if (!currentTask) return EMPTY;
      if (isTaskCancelled(currentTask)) {
        showCancelledInfo(currentTask);
        return EMPTY;
      }

      const executionSucceeded = Math.random() < 0.7;
      return executionSucceeded
        ? of(null)
        : throwError(() => new Error('Random failure'));
    }),

    // Éxito
    tap(() => {
      const currentTask = getCurrentTask();
      if (!currentTask) return;
      if (isTaskCancelled(currentTask)) {
        showCancelledInfo(currentTask);
        return;
      }

      this.updateTask({
        ...currentTask,
        state: TaskStatus.COMPLETED,
        completed: true
      });      

      this.alerts.success(`Completada ${currentTask.title}`, undefined, currentTask.id);
    }),

    // Error y reintentos
    catchError(() => {
      const currentTask = getCurrentTask();
      if (!currentTask) return of(void 0);
      if (isTaskCancelled(currentTask)) {
        showCancelledInfo(currentTask);
        return of(void 0);
      }

      const retryCount = (currentTask.retries ?? 0) + 1;
      if (retryCount <= 2) {
        this.updateTask({
          ...currentTask,
          retries: retryCount,
          state: TaskStatus.PENDING
        });
        this.alerts.info(
          `Reintentando ${currentTask.title}`,
          `Intento ${retryCount}/3`,
          currentTask.id
        );
      } else {
        this.updateTask({ ...currentTask, state: TaskStatus.FAILED });
        this.alerts.error(`Falló ${currentTask.title}`, `Sin más reintentos`, currentTask.id);
      }
      return of(void 0);
    }),

    finalize(() => {
      clearTimeout(blockTimerId);
      this.activeTasks.delete(taskId);
      // Forzar reevaluación para que el Scheduler reciba cambios
      Promise.resolve().then(() => this.tasks$.next([...this.tasks$.value]));
    }),

    map(() => void 0)
  );
}

  private checkBlockTaskByDurationTimer(task: Task): ReturnType<typeof setTimeout>{
    const maxTime = task.duration * 2;
    return setTimeout(() => {
      const cur = this.getById(task.id);
      if (cur?.state === TaskStatus.IN_PROGRESS) {
        this.updateTask({ ...cur, state: TaskStatus.BLOCKED });
        this.alerts.warn(`Tarea ${cur.title} bloqueada`, `Excedió ${maxTime}ms`, cur.id);
      }
    },  maxTime);
  }

  private getById(id: string): Task | undefined {
    return this.tasks$.value.find(t => t.id === id);
  }


}
