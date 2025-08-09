import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer, throwError, EMPTY, asapScheduler } from 'rxjs';
import { catchError, finalize, map, mergeMap, observeOn, tap } from 'rxjs/operators';
import { Task, TaskStatus } from '@domain';
import { AlertsService } from '../alerts/alerts.service';

@Injectable({ providedIn: 'root' })
export class TaskEngineService {

  private alerts = inject(AlertsService);

  private tasks$ = new BehaviorSubject<Task[]>([]);
  private currentActiveTasks = new Set<string>();
  private lastInactivityAt = 0;
  private lastHighPriAt = 0;
  
  private readonly ALERT_COOLDOWN_MS = 2000;
  private readonly MAX_CONCURRENT_TASKS = 3;
  private readonly MAX_TASK_RETRIES = 2;
  private readonly MAX_PRIORIZED_TASKS = 5;
  private readonly MAX_TASK_DURATION_LIMIT = 2;
  private readonly TASK_RANDOM_SUCCESS_RATE = 0.7;
  

  getTasks(): Observable<Task[]> { 
    return this.tasks$.asObservable().pipe(observeOn(asapScheduler)); 
  }

  addTask(task: Task): void {
    const next = [...this.tasks$.value, { ...task }];
    this.emitTasks(next);
  }

  updateTask(task: Task): void {
    const listTask = this.tasks$.value;
    const taskIndex = listTask.findIndex(currentTask => currentTask.id === task.id);
    if (taskIndex === -1) return;
    const listTaskCopy = [...listTask];
    listTaskCopy[taskIndex] = { ...task };
    this.tasks$.next(listTaskCopy);
  }

  updateSubTask(parentTask: Task, updatedTask: Task): void {
    const listTask = this.tasks$.value;
    const listTaskIndex = listTask.findIndex(task => task.id === parentTask.id);
    if (listTaskIndex === -1) return;
    const listTaskCopy = [...listTask];
    listTaskCopy[listTaskIndex] = {
      ...listTaskCopy[listTaskIndex],
      dependencies: listTaskCopy[listTaskIndex].dependencies?.map(taskDep => taskDep.id === updatedTask.id ? { ...updatedTask } : taskDep) ?? []
    };
    this.tasks$.next(listTaskCopy);    
  }

  cancelTask(taskId: string): void {
    const currentTask = this.getById(taskId);
    if (!currentTask) return;
    if (currentTask.state === TaskStatus.PENDING || currentTask.state === TaskStatus.IN_PROGRESS) {
      this.updateTask({ ...currentTask, state: TaskStatus.CANCELLED });
      this.alerts.error(`Falló ${currentTask.title}`, `Sin más reintentos`, currentTask.id);
    }
  }

  deleteTask(taskId: string): void {
    const listTaskFiltered = this.tasks$.value.filter(task => task.id !== taskId);
    const listUpdated = listTaskFiltered.map(task => ({
      ...task,
      dependencies: task.dependencies?.filter(taskDep => taskDep.id !== taskId) ?? []
    }));
    this.tasks$.next(listUpdated);
  }

  retryTask(taskId: string): void {
    const currentTask = this.getById(taskId);
    if (!currentTask) return;
    if (currentTask.state === TaskStatus.FAILED) {
      const nextRetries = 1;
      if (nextRetries <= this.MAX_TASK_RETRIES) {
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
  
  hasCapacity(): boolean {
    return this.currentActiveTasks.size < this.MAX_CONCURRENT_TASKS;
  }

  tryExecute(taskId: string): Observable<void> {
    const initialTask = this.getById(taskId);
    const isRunnable = !!initialTask && initialTask.state === TaskStatus.PENDING && this.hasCapacity();

    if (!isRunnable) return of(void 0);
    
    this.currentActiveTasks.add(taskId);
    this.updateTask({ ...initialTask!, state: TaskStatus.IN_PROGRESS });

    // Watch de bloqueo: si supera 2×duration -> BLOCKED + alerta
    const blockTimerId = this.checkBlockTaskByDurationTimer(initialTask!);

    // Simulación de ejecución real
    return timer(initialTask!.duration).pipe(
      mergeMap(() => this.simulateTaskSuccessOrError(taskId)),
      tap(() => this.handleTaskFullfilled(taskId)),
      catchError(() => this.handleTaskError(taskId)),
      finalize(() => {
        clearTimeout(blockTimerId);
        this.currentActiveTasks.delete(taskId);        
        this.emitTasks([...this.tasks$.value]);
      }),

      map(() => void 0)
    );
  }

  private simulateTaskSuccessOrError(taskId: string): Observable<void | null> {
    const currentTask = this.getById(taskId);
    if (!currentTask) return EMPTY;

    if (this.isTaskCancelled(currentTask)) {
      this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
      return EMPTY;
    }

    const success = Math.random() < this.TASK_RANDOM_SUCCESS_RATE;
    return success ? of(null) : throwError(() => new Error('Random failure'));
  }


  private handleTaskFullfilled(taskId: string): void {
    const currentTask = this.getById(taskId);
    if (!currentTask) return;
    if (this.isTaskCancelled(currentTask)) {
      this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
      return;
    }
    this.updateTask({ ...currentTask, state: TaskStatus.COMPLETED, completed: true });

    this.updateSubtaskCompletion(currentTask);

    this.alerts.success(`Completada ${currentTask.title}`, undefined, currentTask.id);
  }

  private handleTaskError(taskId: string): Observable<void> {
    const currentTask = this.getById(taskId);
    if (!currentTask) return of(void 0);

    if (this.isTaskCancelled(currentTask)) {
      this.alerts.info(`Tarea ${currentTask.title} cancelada`, undefined, currentTask.id);
      return of(void 0);
    }

    const retryCount = (currentTask.retries ?? 0) + 1;
    if (retryCount <= this.MAX_TASK_RETRIES) {
      this.updateTask({ ...currentTask, retries: retryCount, state: TaskStatus.PENDING });
      this.alerts.info(`Reintentando ${currentTask.title}`, `Intento ${retryCount}/3`, currentTask.id);
    } else {
      this.updateTask({ ...currentTask, state: TaskStatus.FAILED });
      this.alerts.error(`Falló ${currentTask.title}`, `Sin más reintentos`, currentTask.id);
    }
    return of(void 0);
  }

  private updateSubtaskCompletion(task: Task): void {  
    const allTasksWidthDependencies = this.tasks$.value.filter(currentTask => currentTask.dependencies.length > 0);    
    allTasksWidthDependencies.forEach(parentTask => {
      parentTask.dependencies.forEach(taskDep => {
        if (taskDep.id === task.id) {
          this.updateSubTask({...parentTask}, { ...taskDep, state: TaskStatus.COMPLETED });
          this.alerts.success(`Subtarea ${taskDep.title} completada`, undefined, taskDep.id);
          return;
        }
      });      
    });
  }
  
  private emitTasks(next: Task[]): void {
    this.tasks$.next(next);
    this.evaluateSystemAlerts();
  }

  private evaluateSystemAlerts(): void {
    const listTask = this.tasks$.value;
    const now = Date.now();

    const maxTaskPrioritzedPending = listTask.filter((task: Task) => task.state === TaskStatus.PENDING && task.priority === 1).length;
    if (maxTaskPrioritzedPending >= this.MAX_PRIORIZED_TASKS && now - this.lastHighPriAt > this.ALERT_COOLDOWN_MS) {
      this.alerts.warn(
        'Demasiadas tareas de prioridad alta pendientes',
        `Hay ${maxTaskPrioritzedPending} tareas P1 en cola`
      );
      this.lastHighPriAt = now;
    }

    const isSomeTaskInProgress = listTask.some((task: Task) => task.state === TaskStatus.IN_PROGRESS);
    const isSomeTaskReadyToProcess = listTask.some(
      (task: Task) =>
        task.state === TaskStatus.PENDING &&
        this.dependenciesMet(task, listTask) &&
        (!task.startAt || task.startAt <= new Date())
    );

    if (!isSomeTaskInProgress && !isSomeTaskReadyToProcess && now - this.lastInactivityAt > this.ALERT_COOLDOWN_MS) {
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
    const maxTime = task.duration * this.MAX_TASK_DURATION_LIMIT;
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

}
