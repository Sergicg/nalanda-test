// src/app/core/services/tasks.api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { Task } from '@domain';


@Injectable({ providedIn: 'root' })
export class TasksApiService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<Task[]> {
    return this.http.get<Task[]>('assets/tasks.json').pipe(
      map(tasks => this.mapDates(tasks))
    );
  }

  /** Convierte strings de fecha a objetos Date de forma recursiva */
  private mapDates(tasks: Task[]): Task[] {
    return tasks.map(t => ({
      ...t,
      startAt: t.startAt ? new Date(t.startAt) : undefined,
      dependencies: this.mapDates(t.dependencies || [])
    }));
  }
}
