import { TestBed } from '@angular/core/testing';

import { TaskSchedulerService } from './task-scheduler.service';

describe('TaskSchedulerService', () => {
  let service: TaskSchedulerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TaskSchedulerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
