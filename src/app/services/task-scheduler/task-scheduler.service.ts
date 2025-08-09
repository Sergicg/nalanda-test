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
    
    this.engine.getTasks()
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => this.scheduleTask(tasks));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.destroy$.next();    
    this.destroy$.complete();    
    this.destroy$ = new Subject<void>();
  }

  ngOnDestroy(): void {
    this.stop();
  }
  
  private scheduleTask(tasks: Task[]): void {
    if (!this.running) return;
    const taskToExecute = this.getTaskToExecute(tasks);

    taskToExecute.forEach((task:Task) => {
      if (this.engine.hasCapacity()) {
        this.engine.tryExecute(task.id).subscribe();
      }
    });    
  }

  private getTaskToExecute(tasks: Task[]): Task[] {
    const now = new Date();
    return tasks
      .filter(t => t.state === TaskStatus.PENDING)
      .filter(t => this.canRunTask(t, tasks))
      .filter(t => !t.startAt || t.startAt <= now)
      .sort((a, b) => a.priority - b.priority);
  }

  private canRunTask(task: Task, allTask: Task[]): boolean {
    if (!task.dependencies || !task.dependencies.length) return true;
    const tableTaskbyId = new Map(allTask.map(task => [task.id, task] as const));
    return task.dependencies.every(taskDep => (tableTaskbyId.get(taskDep.id)?.state) === TaskStatus.COMPLETED);
  }

}
