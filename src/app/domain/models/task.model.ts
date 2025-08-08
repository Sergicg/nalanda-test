import { TaskStatus } from "../enums";

export type Task = {
    id: string;
    title: string;    
    completed: boolean;    
    dependencies: Task[];    
    priority: TaskPriority
    duration: number;
    startAt: Date | undefined;
    state: TaskStatus;
    retries: number;
}

export type TaskPriority = 
    | 1
    | 2
    | 3
    | 4
    | 5;