import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubtaskListComponent } from './subtask-list.component';

describe('SubtaskListComponent', () => {
  let component: SubtaskListComponent;
  let fixture: ComponentFixture<SubtaskListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubtaskListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubtaskListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
