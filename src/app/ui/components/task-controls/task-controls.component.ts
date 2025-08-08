// task-controls.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task, TaskStatus } from '@domain';
import { TaskEngineService } from 'app/services/task-engine/task-engine.service';
import { first } from 'rxjs/operators';
import { DatePickerModule } from 'primeng/datepicker';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { v4 as uuidv4 } from 'uuid';
import { TaskState } from '@domain';

@Component({
  selector: 'nl-task-controls',
  standalone: true,
  imports: [CommonModule, InputTextModule, FormsModule, ButtonModule, DatePickerModule, DropdownModule, MultiSelectModule],
  templateUrl: './task-controls.component.html',
})
export class TaskControlsComponent implements OnInit {
  private engine = inject(TaskEngineService);

  // form state
  taskName = '';
  taskDuration: number | null = 2000;
  taskStartAtDate: Date = new Date();
  taskPriority: 1 | 2 | 3 = 2;

  // dependencias
  taskOptions: Task[] = [];
  selectedDeps: string[] = [];
  newTaskId = uuidv4();

  priorityOptions = [
    { label: 'Alta', value: 1 },
    { label: 'Media', value: 2 },
    { label: 'Baja', value: 3 },
  ];

  ngOnInit(): void {
    this.engine.getTasks().subscribe(tasks => {
      this.taskOptions = tasks.filter(
        t => t.state !== 'cancelled' && t.id !== this.newTaskId
      );
    });
  }

  isValid(): boolean {
    return Boolean(this.taskName?.trim()) && !!this.taskDuration && this.taskDuration > 0;
  }

  addTask(): void {
    if (!this.isValid()) return;

    this.engine.getTasks().pipe(first()).subscribe(all => {
      const byId = new Map(all.map(t => [t.id, t] as const));
      const deps: Task[] = this.selectedDeps
        .map(id => byId.get(id))
        .filter((t): t is Task => !!t && t.state !== 'cancelled');

      this.engine.addTask({
        title: this.taskName.trim(),
        id: this.newTaskId,
        duration: this.taskDuration!,
        startAt: this.taskStartAtDate ?? new Date(),
        priority: this.taskPriority,
        dependencies: deps,
        state: TaskStatus.PENDING,
        retries: 0,
        completed: false,
      });

      // reset form
      this.taskName = '';
      this.taskDuration = 2000;
      this.taskStartAtDate = new Date();
      this.taskPriority = 2;
      this.selectedDeps = [];
      this.newTaskId = uuidv4(); // nuevo id para siguiente tarea
    });
  }
}
