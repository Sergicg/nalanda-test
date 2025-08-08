import { CommonModule } from '@angular/common';
import { Component, input, output, ViewChild, viewChild, ViewChildren } from '@angular/core';
import { Task } from '@domain';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Popover, PopoverModule } from 'primeng/popover';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'nl-task-list',
  standalone: true,
  imports: [CommonModule, DatePickerModule, FormsModule, ButtonModule, TableModule, PopoverModule],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.css'
})
export class TaskListComponent {
  tasks = input.required<Task[]>();
  onCancelTask = output<string>();
  onRetryTask = output<string>();
  onUpdateCreateAt = output<Task>();

  @ViewChild('op') popover!: Popover

  protected expandedRows: { [key: string]: boolean } = {};

  expandAll() {            
    this.expandedRows = this.tasks().reduce((acc, p) => {
      acc[p.id] = true;
      return acc;
    }, {} as Record<string, boolean>);
  }

  collapseAll() {
    this.expandedRows = {};
  }

  cancelTask(taskId: string): void {
    this.onCancelTask.emit(taskId);
  }

  retryTask(taskId: string): void {
    this.onRetryTask.emit(taskId);
  }
  
  updateCreateAt(task: Task): void {
    this.onUpdateCreateAt.emit(task);
    this.popover.hide();
  }
}
