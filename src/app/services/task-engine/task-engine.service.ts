import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer, throwError, EMPTY, asapScheduler } from 'rxjs';
import { catchError, finalize, map, mergeMap, observeOn, tap } from 'rxjs/operators';
import { Task, TaskStatus } from '@domain';
import { AlertsService } from '../alerts/alerts.service';

@Injectable({ providedIn: 'root' })
export class TaskEngineService {

  private alerts = inject(AlertsService);

  private tasks$ = new BehaviorSubject<Task[]>([]);
  
  private activeTasks = new Set<string>();
  private readonly maxConcurrency = 3;  

  private lastInactivityAt = 0;
  private lastHighPriAt = 0;
  private readonly ALERT_COOLDOWN_MS = 2000;
  private readonly MAX_PRIORIZED_TASKS = 5;

  getTasks(): Observable<Task[]> { 
    return this.tasks$.asObservable().pipe(observeOn(asapScheduler)); 
  }

  addTask(task: Task): void {
    const next = [...this.tasks$.value, { ...task }];
    this.emitTasks(next);
  }

  updateTask(updated: Task): void {
    const list = this.tasks$.value;
    const i = list.findIndex(t => t.id === updated.id);
    if (i === -1) return;
    const copy = [...list];
    copy[i] = { ...updated };
    this.tasks$.next(copy);
  }

  updateSubTask(parentTask: Task, updatedTask: Task): void {
    const list = this.tasks$.value;
    const i = list.findIndex(t => t.id === parentTask.id);
    if (i === -1) return;
    const copy = [...list];
    copy[i] = {
      ...copy[i],
      dependencies: copy[i].dependencies?.map(d => d.id === updatedTask.id ? { ...updatedTask } : d) ?? []
    };
    this.tasks$.next(copy);    
  }

  cancelTask(taskId: string): void {
    const currentTask = this.getById(taskId);
    if (!currentTask) return;
    if (currentTask.state === 'pending' || currentTask.state === 'in-progress') {
      this.updateTask({ ...currentTask, state: TaskStatus.CANCELLED });
      this.alerts.error(`Falló ${currentTask.title}`, `Sin más reintentos`, currentTask.id);
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
    const currentTask = this.getById(taskId);
    if (!currentTask) return;
    if (currentTask.state === TaskStatus.FAILED) {
      const nextRetries = 1;
      if (nextRetries <= 2) {
        this.updateTask({ ...currentTask, retries: nextRetries, state: TaskStatus.PENDING });
        this.alerts.info(`Reintentando ${currentTask.title}`, `Intento ${nextRetries}/3`, currentTask.id);
      } else {
        this.updateTask({ ...currentTask, state: TaskStatus.FAILED });
        this.alerts.error(`Falló ${currentTask.title}`, `Sin más reintentos`, currentTask.id);
      }
    }
  }

  updateCreateAt(task: Task): void {
    const currentTask = this.getById(task.id);
    if (!currentTask) return;
    this.updateTask({ ...currentTask, startAt: task.startAt, state: TaskStatus.PENDING });
  }

  // ------- Info de capacidad para el Scheduler -------
  hasCapacity(): boolean {
    return this.activeTasks.size < this.maxConcurrency;
  }

  tryExecute(taskId: string): Observable<void> {
    const initialTask = this.getById(taskId);
    const isRunnable =
      !!initialTask && initialTask.state === TaskStatus.PENDING && this.hasCapacity();

    if (!isRunnable) return of(void 0);

    // Reservar slot y marcar IN_PROGRESS
    this.activeTasks.add(taskId);
    this.updateTask({ ...initialTask!, state: TaskStatus.IN_PROGRESS });

    // Watch de bloqueo: si supera 2×duration -> BLOCKED + alerta
    const blockTimerId = this.checkBlockTaskByDurationTimer(initialTask!);

    // Simulación de ejecución real
    return timer(initialTask!.duration).pipe(
      // Resultado (70% éxito / 30% error simulado)
      mergeMap(() => {
        const currentTask = this.getById(taskId);
        if (!currentTask) return EMPTY;

        if (this.isTaskCancelled(currentTask)) {
          this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
          return EMPTY;
        }

        const success = Math.random() < 0.7;
        return success ? of(null) : throwError(() => new Error('Random failure'));
      }),

      // Éxito
      tap(() => {
        const currentTask = this.getById(taskId);
        if (!currentTask) return;
        if (this.isTaskCancelled(currentTask)) {
          this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
          return;
        }
        this.updateTask({ ...currentTask, state: TaskStatus.COMPLETED, completed: true });

        this.checkSubtaskCompletion(currentTask);

        this.alerts.success(`Completada ${currentTask.title}`, undefined, currentTask.id);
      }),

      // Fallo + reintentos
      catchError(() => {
        const currentTask = this.getById(taskId);
        if (!currentTask) return of(void 0);

        if (this.isTaskCancelled(currentTask)) {
          this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
          return of(void 0);
        }

        const retryCount = (currentTask.retries ?? 0) + 1;
        if (retryCount <= 2) {
          this.updateTask({ ...currentTask, retries: retryCount, state: TaskStatus.PENDING });
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
        this.emitTasks([...this.tasks$.value]);
      }),

      map(() => void 0)
    );
  }

  private checkSubtaskCompletion(task: Task): void {  
    const allTasksWidthDependencies = this.tasks$.value.filter(currentTask => currentTask.dependencies.length > 0);    
    allTasksWidthDependencies.forEach(parentTask => {
      parentTask.dependencies.forEach(dep => {
        if (dep.id === task.id) {
          this.updateSubTask({...parentTask}, { ...dep, state: TaskStatus.COMPLETED });
          this.alerts.success(`Subtarea ${dep.title} completada`, undefined, dep.id);
          return;
        }
      });      
    });
  }
  
  private emitTasks(next: Task[]) {
    this.tasks$.next(next);
    this.evaluateSystemAlerts();
  }

  private evaluateSystemAlerts() {
    const tasks = this.tasks$.value;
    const now = Date.now();

    const maxTaskPrioritzedPending = tasks.filter(t => t.state === TaskStatus.PENDING && t.priority === 1).length;
    if (maxTaskPrioritzedPending >= this.MAX_PRIORIZED_TASKS && now - this.lastHighPriAt > this.ALERT_COOLDOWN_MS) {
      this.alerts.warn(
        'Demasiadas tareas de prioridad alta pendientes',
        `Hay ${maxTaskPrioritzedPending} tareas P1 en cola`
      );
      this.lastHighPriAt = now;
    }

    const running = tasks.some(t => t.state === TaskStatus.IN_PROGRESS);
    const readyNow = tasks.some(
      t =>
        t.state === TaskStatus.PENDING &&
        this.dependenciesMet(t, tasks) &&
        (!t.startAt || t.startAt <= new Date())
    );

    if (!running && !readyNow && now - this.lastInactivityAt > this.ALERT_COOLDOWN_MS) {
      this.alerts.info('Sistema inactivo');
      this.lastInactivityAt = now;
    }
  }

  private dependenciesMet(task: Task, all: Task[]): boolean {
    if (!task.dependencies?.length) return true;
    const byId = new Map(all.map(x => [x.id, x] as const));
    return task.dependencies.every(dep => (byId.get(dep.id)?.state) === TaskStatus.COMPLETED);
  }

  private checkBlockTaskByDurationTimer(task: Task): ReturnType<typeof setTimeout>{
    const maxTime = task.duration * 2;
    return setTimeout(() => {
      const currentTask = this.getCurrentTask(task.id);
      if (currentTask?.state === TaskStatus.IN_PROGRESS) {
        this.updateTask({ ...currentTask, state: TaskStatus.BLOCKED });
        this.alerts.warn(`Tarea ${currentTask.title} bloqueada`, `Excedió ${maxTime}ms`, currentTask.id);
      }
    },  maxTime);
  }

  private getCurrentTask(taskId: string): Task | undefined {
    return this.getById(taskId);
  }

  private getById(id: string): Task | undefined {
    return this.tasks$.value.find(t => t.id === id);
  }

  private isTaskCancelled(task: Task): boolean {
    return task.state === TaskStatus.CANCELLED;
  }

  private showCancelledInfo(task: Task): void {
    this.alerts.info(`Tarea ${task.title} cancelada`, undefined, task.id);
  }


}
