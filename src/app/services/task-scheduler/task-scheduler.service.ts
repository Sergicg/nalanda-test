import { Injectable, OnDestroy } from '@angular/core';
import { TaskEngineService } from '../task-engine/task-engine.service';
import { Task, TaskStatus } from '@domain';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TaskSchedulerService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private running = false;

  constructor(private engine: TaskEngineService) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    // Nos suscribimos al stream de tareas y, ante cada cambio, intentamos llenar la capacidad
    this.engine.getTasks()
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => this.scheduleTick(tasks));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.destroy$.next();
    // no complete() para poder reiniciar luego; recreamos Subject:
    this.destroy$.complete();
    // nuevo subject para futuros start()
    (this as any).destroy$ = new Subject<void>();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ---- Lógica de planificación ----
  private scheduleTick(tasks: Task[]): void {
    if (!this.running) return;

    // Selecciona elegibles: pending, deps completadas, startAt alcanzado
    const now = new Date();
    const eligible = tasks
      .filter(t => t.state === TaskStatus.PENDING)
      .filter(t => this.dependenciesMet(t, tasks))
      .filter(t => !t.startAt || t.startAt <= now)
      .sort((a, b) => a.priority - b.priority);

    // Llenar huecos mientras haya capacidad y elegibles
    for (const t of eligible) {
      if (!this.engine.hasCapacity()) break;      
      this.engine.tryExecute(t.id).subscribe();
    }
  }

  private dependenciesMet(task: Task, all: Task[]): boolean {
    if (!task.dependencies || !task.dependencies.length) return true;
    // return task.dependencies.every(dep => dep.state === TaskStatus.COMPLETED);
    const byId = new Map(all.map(x => [x.id, x] as const));
    return task.dependencies.every(dep => (byId.get(dep.id)?.state) === TaskStatus.COMPLETED);
  }
}
