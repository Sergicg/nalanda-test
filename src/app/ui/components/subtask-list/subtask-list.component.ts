import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-subtask-list',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule],
  templateUrl: './subtask-list.component.html',
  styleUrl: './subtask-list.component.css'
})
export class SubtaskListComponent {
  
}
